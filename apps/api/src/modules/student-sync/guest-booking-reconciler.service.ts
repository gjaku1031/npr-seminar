import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service.js";

/**
 * 예약할 때는 비재원생이었는데 그 뒤에 등록한 가정을 재원생 예약으로 잇는다.
 *
 * 왜 필요한가: 학부모는 설명회를 먼저 예약하고 나중에 등록한다. 예약 시점에 학생이
 * 통통통에 없으면 비재원생으로 남고, 등록한 뒤에도 명단에서는 계속 반·단위·담임이 빈
 * 채로 보인다. 운영자가 매번 눈으로 찾아 고칠 일이 아니라 매일 갱신이 알아서 할 일이다.
 *
 * 기준은 **이름과 연락처가 모두 일치**할 때뿐이다. 둘 중 하나만으로는 잇지 않는다 —
 * 번호만 보면 형제에게 붙고(정하준 예약이 정하윤에게), 이름만 보면 동명이인에게 붙는다
 * (같은 캠퍼스 동명이인 37건 중 33건이 다른 학교였다).
 */
@Injectable()
export class GuestBookingReconcilerService {
  private readonly logger = new Logger(GuestBookingReconcilerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 지나지 않은 회차의 비재원 예약을 훑어 재원생으로 전환한다.
   *
   * 전환 자체가 목적이 아니라 명단이 사실과 맞는 것이 목적이므로, 조금이라도 모호하면
   * 건너뛰고 그 수를 남긴다. 잘못 이은 한 건이 안 이은 열 건보다 나쁘다.
   */
  async reconcile(actorSubject: string): Promise<GuestReconciliationResult> {
    const candidates = await this.prisma.$queryRaw<CandidateRow[]>`
      with guest_row as (
        select fbs.id, fbs.family_booking_id, fbs.session_id,
               fbs.student_name_snapshot as name, fbs.branch_code_at_booking as branch,
               fbs.class_name_snapshot, fbs.school_name_snapshot,
               fbs.grade_snapshot, fbs.unit_name_snapshot, fbs.teacher_name_snapshot,
               fb.contact_digest
          from family_booking_students fbs
          join family_bookings fb
            on fb.id = fbs.family_booking_id and fb.session_id = fbs.session_id
          join seminar_sessions ss on ss.id = fbs.session_id
         where fbs.active
           and fbs.participant_type = 'GUEST'
           and fb.status <> 'CANCELLED'
           and ss.ends_at > now()
      )
      select g.id,
             g.family_booking_id,
             g.session_id,
             g.name,
             g.class_name_snapshot,
             g.school_name_snapshot,
             g.grade_snapshot,
             g.unit_name_snapshot,
             g.teacher_name_snapshot,
             matched.student_id,
             matched.match_count,
             matched.cross_branch_count
        from guest_row g
        join lateral (
          select min(s.id) filter (where b.code = g.branch) as student_id,
                 count(*) filter (where b.code = g.branch) as match_count,
                 count(*) filter (where b.code <> g.branch) as cross_branch_count
            from students s
            join branches b on b.id = s.branch_id
           where s.source_active
             and btrim(normalize(s.name, NFKC)) = btrim(normalize(g.name, NFKC))
             and (s.mother_phone_digest = g.contact_digest
                  or s.father_phone_digest = g.contact_digest)
        ) matched on true
       where matched.match_count > 0 or matched.cross_branch_count > 0`;

    const result = { promoted: 0, skippedAmbiguous: 0, skippedCrossBranch: 0, skippedAlreadyBooked: 0 };

    for (const candidate of candidates) {
      // 같은 캠퍼스에서 두 명 이상이 걸리면 어느 쪽인지 알 수 없다. 고르지 않는다.
      if (candidate.match_count > 1n) { result.skippedAmbiguous += 1; continue; }
      if (candidate.student_id === null) { result.skippedCrossBranch += 1; continue; }
      // 예약한 캠퍼스와 다른 캠퍼스에도 같은 사람이 걸리면 판단을 보류한다.
      if (candidate.cross_branch_count > 0n) { result.skippedAmbiguous += 1; continue; }

      const promoted = await this.promote(candidate, actorSubject);
      if (promoted) result.promoted += 1;
      else result.skippedAlreadyBooked += 1;
    }

    if (result.promoted > 0 || result.skippedAmbiguous > 0 || result.skippedCrossBranch > 0) {
      this.logger.log(`guest booking reconciliation ${JSON.stringify(result)}`);
    }
    return result;
  }

  /**
   * 한 건을 전환한다. 이미 그 학생이 같은 회차에 재원생으로 잡혀 있으면 손대지 않는다 —
   * 한 학생이 두 예약에 걸치면 명단과 집계가 어긋난다.
   */
  private async promote(candidate: CandidateRow, actorSubject: string): Promise<boolean> {
    const studentId = candidate.student_id!;
    return this.prisma.$transaction(async (transaction) => {
      const conflicting = await transaction.familyBookingStudent.count({
        where: { sessionId: candidate.session_id, studentId, active: true },
      });
      if (conflicting > 0) return false;

      const student = await transaction.student.findUnique({
        where: { id: studentId },
        select: {
          sourceStudentNo: true, name: true, className: true, schoolName: true,
          grade: true, unitName: true, teacherName: true,
        },
      });
      if (student === null) return false;

      const updated = await transaction.familyBookingStudent.updateMany({
        // participant_type 조건을 다시 건다 — 그 사이 다른 경로가 이미 바꿨으면 덮지 않는다.
        where: { id: candidate.id, participantType: "GUEST", active: true },
        data: {
          participantType: "ENROLLED",
          studentId,
          sourceStudentNoSnapshot: student.sourceStudentNo,
          studentNameSnapshot: student.name,
          classNameSnapshot: student.className,
          schoolNameSnapshot: student.schoolName,
          gradeSnapshot: student.grade,
          unitNameSnapshot: student.unitName,
          teacherNameSnapshot: student.teacherName,
        },
      });
      if (updated.count === 0) return false;

      // 되돌릴 수 있게 바꾸기 전 값을 그대로 남긴다. 자동으로 고친 것일수록 기록이 필요하다.
      await transaction.bookingEvent.create({
        data: {
          familyBookingId: candidate.family_booking_id,
          eventType: "UPDATED",
          actorSubject,
          safeMetadata: {
            guestPromotedToEnrolled: true,
            matchedBy: "NAME_AND_CONTACT",
            sourceStudentNo: student.sourceStudentNo,
            previous: {
              className: candidate.class_name_snapshot,
              schoolName: candidate.school_name_snapshot,
              grade: candidate.grade_snapshot,
              unitName: candidate.unit_name_snapshot,
              teacherName: candidate.teacher_name_snapshot,
            },
          },
        },
      });
      return true;
    }, { timeout: 10_000, maxWait: 5_000 });
  }
}

export interface GuestReconciliationResult {
  readonly promoted: number;
  readonly skippedAmbiguous: number;
  readonly skippedCrossBranch: number;
  readonly skippedAlreadyBooked: number;
}

interface CandidateRow {
  readonly id: bigint;
  readonly family_booking_id: bigint;
  readonly session_id: bigint;
  readonly name: string;
  readonly class_name_snapshot: string;
  readonly school_name_snapshot: string | null;
  readonly grade_snapshot: string | null;
  readonly unit_name_snapshot: string | null;
  readonly teacher_name_snapshot: string | null;
  readonly student_id: bigint | null;
  readonly match_count: bigint;
  readonly cross_branch_count: bigint;
}
