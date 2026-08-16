import { Injectable } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

export interface SheetBookingChildSnapshot {
  readonly familyBookingStudentPublicId: string;
  readonly studentPublicId: string;
  readonly sourceStudentNo: string;
  readonly studentName: string;
  readonly branch: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  readonly unitName: string | null;
  readonly teacherName: string | null;
  readonly schoolName: string | null;
  readonly grade: string | null;
  readonly active: boolean;
}

export interface SheetBookingEventInput {
  readonly eventId: string;
  readonly eventType: "CREATED" | "UPDATED" | "CANCELLED" | "CHECKED_IN";
  readonly occurredAt: Date;
  readonly seminarSessionPublicId: string;
  readonly familyBookingPublicId: string;
  readonly bookingVersion: bigint;
  readonly bookingCreatedAt: Date;
  readonly attendanceParty: "MOTHER" | "FATHER" | "BOTH";
  readonly bookingSource: "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE";
  readonly children: readonly SheetBookingChildSnapshot[];
}

@Injectable()
export class SheetOutboxService {
  public constructor(private readonly protector: PhoneProtector) {}

  public async enqueueBookingEvent(transaction: Prisma.TransactionClient, input: SheetBookingEventInput): Promise<void> {
    // 테스트 예약은 시트에 내보내지 않는다. QR 재테스트는 같은 예약을 몇 번이고 입장·취소하므로
    // 그대로 두면 운영 예약명단 시트에 가짜 행과 중복 배송이 계속 쌓인다. 시트는 원장이 아니라
    // 투영이므로, 투영에서 빼는 것으로 충분하다.
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

  public bookingLabel(source: "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE", party: "MOTHER" | "FATHER" | "BOTH"): string {
    if (source === "PHONE") return "전화 예약";
    if (source === "TEACHER") return "선생님 예약";
    if (source === "ON_SITE") return "현장 예약";
    return party === "MOTHER" ? "웹앱 예약 (모)" : party === "FATHER" ? "웹앱 예약 (부)" : "웹앱 예약 (모, 부)";
  }

  private eventLabel(type: SheetBookingEventInput["eventType"]): string {
    return type === "CREATED" ? "예약" : type === "UPDATED" ? "예약변경" : type === "CANCELLED" ? "예약취소" : "QR입장";
  }

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }
}
