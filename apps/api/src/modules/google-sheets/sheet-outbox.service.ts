import { Injectable } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * 시트에 반영할 예약 학생 스냅샷
 */
export interface SheetBookingChildSnapshot {
  /**
   * 예약 학생 공개 ID. 예약명단 행 식별 키
   */
  readonly familyBookingStudentPublicId: string;

  /**
   * 학생 공개 ID
   */
  readonly studentPublicId: string;

  /**
   * 원천 학번
   */
  readonly sourceStudentNo: string;

  /**
   * 학생 이름
   */
  readonly studentName: string;

  /**
   * 예약 시점 지점
   */
  readonly branch: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 반 이름
   */
  readonly unitName: string | null;

  /**
   * 담임 이름
   */
  readonly teacherName: string | null;

  /**
   * 학교
   */
  readonly schoolName: string | null;

  /**
   * 학년
   */
  readonly grade: string | null;

  /**
   * 예약 포함 여부. false면 해제된 학생
   */
  readonly active: boolean;
}

/**
 * 시트 반영 예약 이벤트
 */
export interface SheetBookingEventInput {
  /**
   * 이벤트 ID. 같은 이벤트·학생은 한 번만 적재
   */
  readonly eventId: string;

  /**
   * 이벤트 종류
   */
  readonly eventType: "CREATED" | "UPDATED" | "CANCELLED" | "CHECKED_IN";

  /**
   * 발생 시각
   */
  readonly occurredAt: Date;

  /**
   * 회차 공개 ID. 시트 매핑 선택 기준
   */
  readonly seminarSessionPublicId: string;

  /**
   * 가족 예약 공개 ID
   */
  readonly familyBookingPublicId: string;

  /**
   * 이벤트 시점 예약 버전. 워커가 오래된 반영을 건너뛰는 기준
   */
  readonly bookingVersion: bigint;

  /**
   * 예약 생성 시각
   */
  readonly bookingCreatedAt: Date;

  /**
   * 참석 보호자. 어머니·아버지·둘 다
   */
  readonly attendanceParty: "MOTHER" | "FATHER" | "BOTH";

  /**
   * 예약 경로
   */
  readonly bookingSource: "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE";

  /**
   * 학생별 스냅샷
   */
  readonly children: readonly SheetBookingChildSnapshot[];
}

/**
 * 예약 이벤트를 시트 반영 대기열(sheet_outbox)에 적재
 *
 * 호출자 트랜잭션 안에서 적재해 예약 변경과 함께 커밋·롤백됨. 스냅샷은 암호화 저장
 */
@Injectable()
export class SheetOutboxService {
  /**
   * 시트 페이로드 암호화 주입
   */
  public constructor(private readonly protector: PhoneProtector) {}

  /**
   * 예약 이벤트를 학생별 대기열 행으로 적재
   *
   * 테스트 예약이거나 회차에 시트 매핑이 없으면 적재하지 않음. 같은 매핑·이벤트·학생은 무시
   *
   * @param transaction 호출자 트랜잭션
   */
  public async enqueueBookingEvent(transaction: Prisma.TransactionClient, input: SheetBookingEventInput): Promise<void> {
    // 테스트 예약은 시트에 내보내지 않음. QR 재테스트는 같은 예약을 반복 입장·취소해 운영 시트에 가짜 행과 중복 반영이 쌓임
    // 시트는 원장이 아닌 투영이므로 투영에서 제외하면 충분함
    const booking = await transaction.familyBooking.findUnique({
      where: { publicId: input.familyBookingPublicId },
      select: { isTest: true },
    });
    if (booking?.isTest === true) return;

    const mapping = await transaction.sheetMapping.findUnique({
      where: { seminarSessionPublicId: input.seminarSessionPublicId },
      select: { id: true },
    });
    if (mapping === null) return;
    // 학생마다 표시 문구까지 계산한 스냅샷을 암호화해 적재
    for (const child of input.children) {
      const snapshot = {
        occurredAt: input.occurredAt.toISOString(),
        bookingCreatedAt: input.bookingCreatedAt.toISOString(),
        sourceStudentNo: child.sourceStudentNo,
        studentName: child.studentName,
        branch: child.branch,
        unitName: child.unitName,
        teacherName: child.teacherName,
        schoolName: child.schoolName,
        grade: child.grade,
        attendanceParty: input.attendanceParty,
        bookingSource: input.bookingSource,
        active: child.active,
        eventLabel: this.eventLabel(input.eventType),
        resultLabel: input.eventType === "CHECKED_IN" ? "참석완료" : child.active ? this.bookingLabel(input.bookingSource, input.attendanceParty) : "예약 취소",
      };
      const ciphertext = this.protector.encryptSheetPayload(JSON.stringify(snapshot));
      await transaction.$executeRaw`
        insert into sheet_outbox(
          mapping_id,event_id,event_type,seminar_session_public_id,family_booking_public_id,
          family_booking_student_public_id,student_public_id,booking_version,snapshot_ciphertext
        ) values (
          ${mapping.id},${input.eventId}::uuid,${input.eventType},${input.seminarSessionPublicId}::uuid,
          ${input.familyBookingPublicId}::uuid,${child.familyBookingStudentPublicId}::uuid,${child.studentPublicId}::uuid,
          ${input.bookingVersion},${this.bytes(ciphertext)}
        ) on conflict(mapping_id,event_id,family_booking_student_public_id) do nothing`;
    }
  }

  /**
   * 예약 경로·참석 보호자 표시 문구
   */
  public bookingLabel(source: "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE", party: "MOTHER" | "FATHER" | "BOTH"): string {
    if (source === "PHONE") return "전화 예약";
    if (source === "TEACHER") return "선생님 예약";
    if (source === "ON_SITE") return "현장 예약";
    return party === "MOTHER" ? "웹앱 예약 (모)" : party === "FATHER" ? "웹앱 예약 (부)" : "웹앱 예약 (모, 부)";
  }

  /**
   * 이벤트 종류 표시 문구
   */
  private eventLabel(type: SheetBookingEventInput["eventType"]): string {
    return type === "CREATED" ? "예약" : type === "UPDATED" ? "예약변경" : type === "CANCELLED" ? "예약취소" : "QR입장";
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }
}
