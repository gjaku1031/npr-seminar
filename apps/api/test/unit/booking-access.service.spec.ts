import { randomBytes, randomUUID } from "node:crypto";
import type { Request } from "express";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { BookingAccessService } from "../../src/modules/family-bookings/booking-access.service.js";
import { BookingCryptoService } from "../../src/modules/family-bookings/booking-crypto.service.js";
import { BookingAccessExchangeDto } from "../../src/modules/family-bookings/booking-access.controller.js";

function environment(): AppEnvironment {
  return {
    appEnv: "test", processRole: "api", port: 4000,
    phoneEncryptionKey: Buffer.alloc(32, 1).toString("base64"),
    phoneHmacKey: Buffer.alloc(32, 2).toString("base64"),
    smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
    smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined },
    smsAligoTestMode: true, googleSheetsEnabled: false, trustProxy: 0,
    tongSyncEnabled: false, sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
  };
}

describe("booking access exchange", () => {
  it("lets bounded malformed tokens reach the service IP limiter and records an invalid audit", async () => {
    const body = Object.assign(new BookingAccessExchangeDto(), {
      accessToken: "malformed-token",
      contact: "010-0000-7147",
    });
    expect(await validate(body)).toEqual([]);
    expect(await validate(Object.assign(new BookingAccessExchangeDto(), {
      accessToken: randomBytes(32).toString("base64url"),
      contact: "010-0000-7147",
    }))).toEqual([]);
    expect(await validate(Object.assign(new BookingAccessExchangeDto(), {
      accessToken: "x".repeat(201),
      contact: "010-0000-7147",
    }))).not.toEqual([]);

    const auditCreate = vi.fn().mockResolvedValue({});
    const increment = vi.fn().mockResolvedValue(1);
    const redis = {
      prefix: "npr:",
      client: { incr: increment, expire: vi.fn().mockResolvedValue(true) },
    };
    const service = new BookingAccessService(
      { authAudit: { create: auditCreate } } as never,
      new BookingCryptoService(),
      new PhoneProtector(environment()),
      redis as never,
      {} as never,
    );
    const request = {
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      session: {},
    } as unknown as Request;

    await expect(service.exchange(request, body.accessToken, body.contact, "malformed-key"))
      .rejects.toMatchObject({ status: 401, code: "BOOKING_ACCESS_INVALID" });
    expect(increment).toHaveBeenCalledOnce();
    expect(increment.mock.calls[0]?.[0]).toContain("booking-access:ip:");
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultCode: "INVALID" }),
    }));
  });

  it("rate-limits and audits malformed tokens before format rejection", async () => {
    const auditCreate = vi.fn().mockResolvedValue({});
    const redis = {
      prefix: "npr:",
      client: { incr: vi.fn().mockResolvedValue(31), expire: vi.fn().mockResolvedValue(true) },
    };
    const service = new BookingAccessService(
      { authAudit: { create: auditCreate } } as never,
      new BookingCryptoService(),
      new PhoneProtector(environment()),
      redis as never,
      {} as never,
    );
    const request = {
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      session: {},
    } as unknown as Request;

    await expect(service.exchange(request, "malformed-token", "010-0000-7147", "malformed-key"))
      .rejects.toMatchObject({ status: 429, code: "BOOKING_ACCESS_RATE_LIMITED" });
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultCode: "RATE_LIMITED" }),
    }));
  });

  it("stores only token/session digests and establishes a 30-minute booking-scoped session", async () => {
    const crypto = new BookingCryptoService();
    const phone = new PhoneProtector(environment());
    const rawAccessToken = randomBytes(32).toString("base64url");
    const protectedContact = phone.protect("01000007147");
    const familyBookingPublicId = randomUUID();
    const managementPublicId = randomUUID();
    const findUnique = vi.fn().mockResolvedValue({
      id: 5n, status: "ACTIVE", expiresAt: new Date(Date.now() + 60_000),
      familyBooking: { id: 7n, publicId: familyBookingPublicId, contactDigest: protectedContact.digest },
    });
    const replayManagementPublicId = randomUUID();
    const create = vi.fn()
      .mockResolvedValueOnce({ id: 9n, publicId: managementPublicId })
      .mockResolvedValueOnce({ id: 10n, publicId: replayManagementPublicId });
    const auditCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      bookingAccessCredential: { findUnique },
      bookingManagementSession: { create, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      authAudit: { create: auditCreate },
    };
    const redis = {
      prefix: "npr:",
      client: { incr: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(true) },
    };
    let replayedIdentity: { familyBookingId: string } | null = null;
    const idempotency = {
      replay: vi.fn().mockImplementation(async () => replayedIdentity),
      execute: vi.fn().mockImplementation(async (_scope, _key, _request, operation) => {
        replayedIdentity = await operation(prisma);
        return replayedIdentity;
      }),
    };
    const session = {
      cookie: {},
      regenerate: (callback: (error?: Error) => void) => callback(),
      save: (callback: (error?: Error) => void) => callback(),
    };
    const request = {
      ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" },
      sessionID: "browser-session-after-regeneration", session,
    } as unknown as Request;
    const service = new BookingAccessService(prisma as never, crypto, phone, redis as never, idempotency as never);

    const idempotencyKey = "booking-access-key-123";
    const result = await service.exchange(request, rawAccessToken, "010-0000-7147", idempotencyKey);

    expect(result).toMatchObject({ familyBookingId: familyBookingPublicId });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect(request.session).toMatchObject({
      bookingManagementSessionId: managementPublicId,
      bookingManagementExpiresAt: result.expiresAt.getTime(),
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
    });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenDigest: expect.any(Uint8Array) },
    }));
    const createInput = create.mock.calls[0]![0];
    expect(Buffer.from(createInput.data.sessionDigest)).toEqual(crypto.digest(request.sessionID));
    expect(JSON.stringify(createInput, (_key, value) => typeof value === "bigint" ? value.toString() : value))
      .not.toContain(rawAccessToken);
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "BOOKING_ACCESS_EXCHANGE", resultCode: "SUCCEEDED" }),
    }));

    const replaySession = {
      cookie: {},
      regenerate: (callback: (error?: Error) => void) => callback(),
      save: (callback: (error?: Error) => void) => callback(),
    };
    const replayRequest = {
      ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" },
      sessionID: "fresh-browser-session-on-replay", session: replaySession,
    } as unknown as Request;
    const replayResult = await service.exchange(
      replayRequest,
      rawAccessToken,
      "010-0000-7147",
      idempotencyKey,
    );

    expect(replayResult).toMatchObject({ familyBookingId: familyBookingPublicId });
    expect(replayRequest.session.bookingManagementSessionId).toBe(replayManagementPublicId);
    expect(create).toHaveBeenCalledTimes(2);
    expect(idempotency.execute).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(redis.client.incr).toHaveBeenCalledTimes(6);
    const durableRequest = idempotency.execute.mock.calls[0]![2];
    expect(durableRequest).toEqual({
      accessDigest: crypto.digest(rawAccessToken).toString("base64url"),
      contactDigest: Buffer.from(protectedContact.digest).toString("base64url"),
    });
    expect(JSON.stringify(durableRequest)).not.toContain(rawAccessToken);
    expect(JSON.stringify(durableRequest)).not.toContain("01000007147");
  });
});
