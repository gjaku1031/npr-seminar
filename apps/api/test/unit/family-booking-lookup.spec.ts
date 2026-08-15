import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { RedisService } from "../../src/common/redis/redis.service.js";
import { FamilyBookingLookupService } from "../../src/modules/family-bookings/family-booking-lookup.service.js";

const environment = {
  appEnv: "test",
  phoneEncryptionKey: Buffer.alloc(32, 1).toString("base64"),
  phoneHmacKey: Buffer.alloc(32, 2).toString("base64"),
} as AppEnvironment;

const request = {
  ip: "198.51.100.20",
  socket: { remoteAddress: "198.51.100.20" },
} as Request;

function bookingRow() {
  return {
    publicId: randomUUID(),
    attendanceParty: "BOTH",
    bookingSource: "WEB_APP",
    seatCount: 2,
    status: "RESERVED",
    version: 3n,
    createdAt: new Date("2026-07-19T01:00:00.000Z"),
    updatedAt: new Date("2026-07-19T02:00:00.000Z"),
    checkedInAt: null,
    cancelledAt: null,
    session: { publicId: randomUUID() },
    students: [{
      active: true,
      releasedAt: null,
      participantType: "ENROLLED",
      studentNameSnapshot: "김도준",
      branchCodeAtBooking: "CAMPUS_A",
    }],
    qrCredentials: [{ status: "ACTIVE" }],
  };
}

function configuredService(rows: ReturnType<typeof bookingRow>[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const auditCreate = vi.fn().mockResolvedValue({});
  const prisma = { familyBooking: { findMany }, authAudit: { create: auditCreate } };
  const evaluate = vi.fn().mockResolvedValue(1);
  const redis = { prefix: "npr:test:", client: { eval: evaluate } };
  return {
    service: new FamilyBookingLookupService(
      prisma as never,
      redis as never,
      new PhoneProtector(environment),
    ),
    findMany,
    auditCreate,
    evaluate,
  };
}

describe("FamilyBookingLookupService", () => {
  it("matches a normalized full phone while returning only the exact masked DTO", async () => {
    const row = bookingRow();
    const fixture = configuredService([row]);
    const result = await fixture.service.lookup(request, "010-5555-7629");

    expect(result.items).toEqual([{
      familyBookingId: row.publicId,
      seminarSessionId: row.session.publicId,
      maskedContact: "010-****-7629",
      attendanceParty: "BOTH",
      bookingSource: "WEB_APP",
      seatCount: 2,
      status: "RESERVED",
      participants: [{ participantType: "ENROLLED", maskedName: "김*준", branch: "CAMPUS_A" }],
      qrStatus: "ACTIVE",
      version: 3,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      checkedInAt: null,
      cancelledAt: null,
    }]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("01055557629");
    expect(serialized).not.toContain("김도준");
    expect(serialized).not.toContain("qrToken");
    expect(Object.keys(result.items[0]!).sort()).toEqual([
      "attendanceParty", "bookingSource", "cancelledAt", "checkedInAt", "createdAt",
      "familyBookingId", "maskedContact", "participants", "qrStatus", "seatCount",
      "seminarSessionId", "status", "updatedAt", "version",
    ].sort());

    const query = fixture.findMany.mock.calls[0]![0];
    expect(query.where.contactDigest).toBeInstanceOf(Uint8Array);
    expect(query.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(query.take).toBe(100);
    expect(query.select.students.select).toEqual({
      active: true,
      releasedAt: true,
      participantType: true,
      studentNameSnapshot: true,
      branchCodeAtBooking: true,
    });
    expect(JSON.stringify(query.select.students.select)).not.toMatch(/sourceStudentNo|school|class|teacher/u);
    expect(fixture.evaluate).toHaveBeenCalledTimes(3);
    expect(fixture.auditCreate).toHaveBeenCalledWith({
      data: {
        eventType: "BOOKING_LOOKUP",
        resultCode: "SUCCEEDED",
        safeMetadata: {
          contactFingerprint: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/u),
          ipFingerprint: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/u),
          resultCount: 1,
        },
      },
    });
    expect(JSON.stringify(fixture.auditCreate.mock.calls)).not.toContain("01055557629");
  });

  it("returns an audited empty list for no match", async () => {
    const fixture = configuredService([]);
    await expect(fixture.service.lookup(request, "010-5555-0000")).resolves.toEqual({ items: [] });
    expect(fixture.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultCode: "SUCCEEDED", safeMetadata: expect.objectContaining({ resultCount: 0 }) }),
    }));
  });

  it("uses the lookup-specific IP/contact/global limiter and never queries after a limit", async () => {
    const fixture = configuredService([bookingRow()]);
    fixture.evaluate.mockImplementation(async (_script: string, options: { keys: string[] }) => (
      options.keys[0]?.includes("booking-lookup:contact:") === true ? 11 : 1
    ));

    await expect(fixture.service.lookup(request, "010-5555-7629"))
      .rejects.toMatchObject({ status: 429, code: "BOOKING_LOOKUP_RATE_LIMITED" });
    expect(fixture.findMany).not.toHaveBeenCalled();
    expect(fixture.evaluate.mock.calls.map((call) => call[1].keys[0])).toEqual(expect.arrayContaining([
      expect.stringContaining("booking-lookup:contact:"),
      expect.stringContaining("booking-lookup:ip:"),
      expect.stringContaining("booking-lookup:global"),
    ]));
    expect(fixture.auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultCode: "RATE_LIMITED" }),
    }));
  });

  it("naturally fails with REDIS_NOT_CONFIGURED before a database lookup", async () => {
    const findMany = vi.fn();
    const prisma = { familyBooking: { findMany }, authAudit: { create: vi.fn() } };
    const service = new FamilyBookingLookupService(
      prisma as never,
      new RedisService(environment),
      new PhoneProtector(environment),
    );
    await expect(service.lookup(request, "010-5555-7629"))
      .rejects.toMatchObject({ status: 503, code: "REDIS_NOT_CONFIGURED" });
    expect(findMany).not.toHaveBeenCalled();
  });
});
