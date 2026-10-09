import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service.js";

/**
 * 예약 당시 비재원생이었다가 이후 등록한 가정을 재원생 예약으로 연결
 *
 * 학부모는 설명회를 먼저 예약하고 나중에 등록함. 예약 시점에 통통통에 없으면 비재원생으로 남고
 * 등록 후에도 명단에서 반·단위·담임이 빈 채로 보이므로 정기 동기화가 자동으로 연결함
 *
 * 이름과 연락처가 모두 일치할 때만 연결. 한쪽만으로는 연결하지 않음
 * 번호만 보면 형제에게 붙고, 이름만 보면 동명이인에게 붙음(같은 캠퍼스 동명이인 37건 중 33건이 다른 학교)
 */
@Injectable()
export class GuestBookingReconcilerService {
  /**
   * 연결 결과 기록용 로거
   */
  private readonly logger = new Logger(GuestBookingReconcilerService.name);

  /**
   * DB 클라이언트 주입
   */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 지나지 않은 회차의 활성 비재원생 예약을 재원생으로 전환
   *
   * 명단이 사실과 맞는 것이 목적이므로 조금이라도 모호하면 건너뛰고 건수만 남김
   * 잘못 연결한 한 건이 연결하지 않은 열 건보다 나쁨
   *
   * @param actorSubject 예약 이벤트에 남길 처리 주체
   * @returns 전환·건너뜀 건수
   */
  async reconcile(actorSubject: string): Promise<GuestReconciliationResult> {
    // 이름(NFKC·공백 제거)과 어머니·아버지 연락처 다이제스트가 같은 활성 학생을 같은 지점·다른 지점으로 나눠 셈
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
      // 같은 캠퍼스에서 두 명 이상 일치하면 어느 쪽인지 알 수 없어 고르지 않음
      if (candidate.match_count > 1n) { result.skippedAmbiguous += 1; continue; }
      if (candidate.student_id === null) { result.skippedCrossBranch += 1; continue; }
      // 예약한 캠퍼스와 다른 캠퍼스에도 같은 사람이 있으면 판단 보류
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
   * 예약 학생 1건 전환
   *
   * 그 학생이 같은 회차에 이미 재원생으로 예약돼 있으면 변경하지 않음. 한 학생이 두 예약에 걸치면 명단과 집계가 어긋남
   *
   * @returns 전환했으면 true, 충돌·이미 변경됨이면 false
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
        // 참여 유형 조건을 다시 확인. 그 사이 다른 경로가 이미 바꿨으면 덮어쓰지 않음
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

      // 되돌릴 수 있도록 변경 전 스냅샷 값을 이벤트에 남김. 자동 수정일수록 기록 필요
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

/**
 * 비재원생 연결 결과
 */
export interface GuestReconciliationResult {
  /**
   * 재원생으로 전환한 건수
   */
  readonly promoted: number;

  /**
   * 같은 지점 다중 일치·다른 지점 동시 일치로 건너뛴 건수
   */
  readonly skippedAmbiguous: number;

  /**
   * 다른 지점에서만 일치해 건너뛴 건수
   */
  readonly skippedCrossBranch: number;

  /**
   * 같은 회차에 이미 재원생 예약이 있거나 그 사이 바뀌어 건너뛴 건수
   */
  readonly skippedAlreadyBooked: number;
}

/**
 * 연결 후보 조회 행
 */
interface CandidateRow {
  /**
   * 예약 학생 ID
   */
  readonly id: bigint;

  /**
   * 가족 예약 ID
   */
  readonly family_booking_id: bigint;

  /**
   * 회차 ID
   */
  readonly session_id: bigint;

  /**
   * 예약 학생 이름
   */
  readonly name: string;

  /**
   * 예약 당시 반
   */
  readonly class_name_snapshot: string;

  /**
   * 예약 당시 학교
   */
  readonly school_name_snapshot: string | null;

  /**
   * 예약 당시 학년
   */
  readonly grade_snapshot: string | null;

  /**
   * 예약 당시 단위
   */
  readonly unit_name_snapshot: string | null;

  /**
   * 예약 당시 담임
   */
  readonly teacher_name_snapshot: string | null;

  /**
   * 같은 지점 일치 학생 중 가장 작은 ID. 없으면 null
   */
  readonly student_id: bigint | null;

  /**
   * 같은 지점 일치 수
   */
  readonly match_count: bigint;

  /**
   * 다른 지점 일치 수
   */
  readonly cross_branch_count: bigint;
}
