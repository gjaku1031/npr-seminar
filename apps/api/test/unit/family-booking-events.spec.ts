import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  AdminCancelDto,
  AdminCreateDto,
  AdminUpdateDto,
  adminCreateAuditReason,
} from "../../src/modules/family-bookings/family-bookings.controller.js";
import { FamilyBookingsManagementService } from "../../src/modules/family-bookings/family-bookings-management.service.js";

describe("family booking audit event response contract", () => {
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
      {} as never, {} as never,
    );
    const response = await service.bookingEvents("00000000-0000-4000-8000-000000000010");
    expect(response.items).toEqual([{
      sequence: "11", eventId: "00000000-0000-4000-8000-000000000011",
      familyBookingId: "00000000-0000-4000-8000-000000000010", type: "UPDATED",
      actor: { type: "ADMIN", subjectId: "00000000-0000-4000-8000-000000000012", displayName: null },
      cancellationType: null, reason: "회차 변경", metadata: { fromSessionId: "old", toSessionId: "new" }, occurredAt,
    }]);
    expect(response.items[0]).not.toHaveProperty("eventType");
    expect(response.items[0]).not.toHaveProperty("actorSubject");
    expect(response.items[0]).not.toHaveProperty("safeMetadata");
  });

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
