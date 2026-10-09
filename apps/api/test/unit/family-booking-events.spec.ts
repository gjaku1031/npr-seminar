import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  AdminCancelDto,
  AdminCreateDto,
  AdminUpdateDto,
  adminCreateAuditReason,
} from "../../src/modules/family-bookings/family-bookings.controller.js";
import { FamilyBookingsManagementService } from "../../src/modules/family-bookings/family-bookings-management.service.js";

// 예약 감사 이벤트 응답 형식과 관리자 예약 DTO
describe("family booking audit event response contract", () => {
  // OpenAPI BookingAuditEvent 형식으로 응답하고 저장소 필드명을 노출하지 않음
  it("returns the OpenAPI BookingAuditEvent shape without persistence field names", async () => {
    const occurredAt = new Date("2026-07-17T10:00:00Z");
    const prisma = {
      familyBooking: { findUnique: async () => ({ id: 7n }) },
      bookingEvent: { findMany: async () => [{
        id: 11n, eventId: "00000000-0000-4000-8000-000000000011", familyBookingId: 7n,
        eventType: "UPDATED", actorSubject: "00000000-0000-4000-8000-000000000012",
        cancellationType: null,
        safeMetadata: { reason: "회차 변경", fromSessionId: "old", toSessionId: "new" }, occurredAt,
      }] },
    };
    const service = new FamilyBookingsManagementService(
      prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
    );
    const response = await service.bookingEvents("00000000-0000-4000-8000-000000000010");
    expect(response.items).toEqual([{
      sequence: "11", eventId: "00000000-0000-4000-8000-000000000011",
      familyBookingId: "00000000-0000-4000-8000-000000000010", type: "UPDATED",
      actor: { type: "ADMIN", subjectId: "00000000-0000-4000-8000-000000000012", displayName: null },
      cancellationType: null, reason: "회차 변경",
      scannerDeviceName: null, scannerEntranceName: null, scannerGateCode: null,
      metadata: { fromSessionId: "old", toSessionId: "new" }, occurredAt,
    }]);
    expect(response.items[0]).not.toHaveProperty("eventType");
    expect(response.items[0]).not.toHaveProperty("actorSubject");
    expect(response.items[0]).not.toHaveProperty("safeMetadata");
  });

  // 기기 행이 삭제된 뒤에도 입장 당시 스캐너 스냅샷을 표시
  it("projects immutable scanner snapshots after the device relation is deleted", async () => {
    const occurredAt = new Date("2026-07-19T03:21:00Z");
    const scannerSnapshot = {
      scannerDeviceName: "iPad 스캐너",
      scannerEntranceName: "A 정문",
      scannerGateCode: "CAMPUS_A-MAIN",
    };
    const prisma = {
      familyBooking: { findUnique: async () => ({ id: 7n }) },
      bookingEvent: { findMany: async () => [{
        id: 12n, eventId: "00000000-0000-4000-8000-000000000012", familyBookingId: 7n,
        eventType: "CHECKED_IN", actorSubject: "00000000-0000-4000-8000-000000000099",
        cancellationType: null, safeMetadata: { source: "QR", ...scannerSnapshot }, occurredAt,
      }] },
      checkInEvent: { findMany: async () => [{
        id: 13n, eventId: "00000000-0000-4000-8000-000000000013",
        source: "QR", result: "CHECKED_IN", seatCount: 2, gateCode: "CAMPUS_A-MAIN",
        safeMetadata: scannerSnapshot, occurredAt,
        session: { publicId: "00000000-0000-4000-8000-000000000102" },
        scannerDevice: null,
      }] },
    };
    const service = new FamilyBookingsManagementService(
      prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
    );

    const bookingEvents = await service.bookingEvents("00000000-0000-4000-8000-000000000010");
    expect(bookingEvents.items[0]).toMatchObject(scannerSnapshot);
    const checkInEvents = await service.checkInEvents("00000000-0000-4000-8000-000000000010");
    expect(checkInEvents.items[0]).toMatchObject({
      deviceId: null,
      ...scannerSnapshot,
    });
  });

  // 관리자 취소 유형은 전화·선생님·기타 세 가지만 허용
  it("accepts only the three administrator cancellation types", async () => {
    for (const cancellationType of ["PHONE", "TEACHER", "OTHER"] as const) {
      expect(await validate(Object.assign(new AdminCancelDto(), { expectedVersion: 1, cancellationType }))).toHaveLength(0);
    }
    expect(await validate(Object.assign(new AdminCancelDto(), {
      expectedVersion: 1,
      cancellationType: "SELF_SERVICE",
    }))).not.toHaveLength(0);
    expect(await validate(Object.assign(new AdminCancelDto(), {
      expectedVersion: 1,
      cancellationType: "직접 입력",
    }))).not.toHaveLength(0);
  });

  // 관리자 생성 사유는 생략 가능하고 길이 제한된 기본 사유를 만들며, 변경 사유는 계속 필수
  it("allows an omitted admin-create reason, derives a bounded audit reason, and keeps update reasons mandatory", async () => {
    const create = Object.assign(new AdminCreateDto(), {
      seminarSessionId: "00000000-0000-4000-8000-000000000101",
      attendanceParty: "MOTHER",
      participantType: "ENROLLED",
      studentIds: ["00000000-0000-4000-8000-000000000102"],
      contact: "01012345678",
      bookingSource: "TEACHER",
    });
    expect(await validate(create)).toHaveLength(0);
    expect(adminCreateAuditReason("TEACHER")).toBe("ADMIN_CREATE_TEACHER");
    expect(adminCreateAuditReason("ON_SITE", "   ")).toBe("ADMIN_CREATE_ON_SITE");
    expect(adminCreateAuditReason("PHONE", `  ${"가".repeat(600)}  `)).toHaveLength(500);

    expect(await validate(Object.assign(new AdminUpdateDto(), { expectedVersion: 1 })))
      .not.toHaveLength(0);
    expect(await validate(Object.assign(new AdminUpdateDto(), { expectedVersion: 1, reason: "관리자 변경" })))
      .toHaveLength(0);
  });
});
