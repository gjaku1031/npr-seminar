import { randomBytes, randomUUID } from "node:crypto";
import type { Request } from "express";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { BookingAccessService } from "../../src/modules/family-bookings/booking-access.service.js";
import { BookingCryptoService } from "../../src/modules/family-bookings/booking-crypto.service.js";
import { BookingAccessExchangeDto } from "../../src/modules/family-bookings/booking-access.controller.js";

/**
 * 연락처 암호화 키를 가진 테스트 실행 환경
 */
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

// 예약 관리 링크 교환과 읽기 세션 발급
describe("booking access exchange", () => {
  // 길이 범위 안의 형식 오류 토큰도 DTO를 통과해 서비스의 IP 제한과 INVALID 감사를 거침
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
    const evaluate = vi.fn().mockResolvedValue(1);
    const redis = {
      prefix: "npr:",
      client: { eval: evaluate },
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
    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate.mock.calls[0]?.[1].keys[0]).toContain("booking-access:ip:");
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultCode: "INVALID" }),
    }));
  });

  // 형식 오류 토큰도 형식 거부 전에 시도 제한·감사 기록
  it("rate-limits and audits malformed tokens before format rejection", async () => {
    const auditCreate = vi.fn().mockResolvedValue({});
    const redis = {
      prefix: "npr:",
      client: { eval: vi.fn().mockResolvedValue(31) },
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

  // 토큰·세션은 다이제스트만 저장하고 30분 예약 범위 세션 발급. 같은 키 재요청도 새 세션 발급
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
      client: { eval: vi.fn().mockResolvedValue(1) },
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
    expect(redis.client.eval).toHaveBeenCalledTimes(6);
    const durableRequest = idempotency.execute.mock.calls[0]![2];
    expect(durableRequest).toEqual({
      accessDigest: crypto.digest(rawAccessToken).toString("base64url"),
      contactDigest: Buffer.from(protectedContact.digest).toString("base64url"),
    });
    expect(JSON.stringify(durableRequest)).not.toContain(rawAccessToken);
    expect(JSON.stringify(durableRequest)).not.toContain("01000007147");
  });

  // 연락처 소유 확인 후 읽기·QR 세션 발급. 전체 연락처는 저장하지 않음
  it("establishes a contact-owned read/QR session without persisting the full contact", async () => {
    const crypto = new BookingCryptoService();
    const phone = new PhoneProtector(environment());
    const protectedContact = phone.protect("01000007147");
    const familyBookingPublicId = randomUUID();
    const managementPublicId = randomUUID();
    const credential = {
      id: 25n,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 60_000),
      familyBooking: {
        id: 27n,
        publicId: familyBookingPublicId,
        contactDigest: protectedContact.digest,
      },
    };
    const authAuditCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      bookingAccessCredential: { findFirst: vi.fn().mockResolvedValue(credential) },
      bookingManagementSession: {
        create: vi.fn().mockResolvedValue({ id: 29n, publicId: managementPublicId }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      authAudit: { create: authAuditCreate },
    };
    const redis = {
      prefix: "npr:",
      client: { eval: vi.fn().mockResolvedValue(1) },
    };
    const idempotency = {
      replay: vi.fn().mockResolvedValue(null),
      execute: vi.fn().mockImplementation(async (_scope, _key, _request, operation) => operation(prisma)),
    };
    const session = {
      cookie: {},
      regenerate: (callback: (error?: Error) => void) => callback(),
      save: (callback: (error?: Error) => void) => callback(),
    };
    const request = {
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      sessionID: "contact-owned-read-session",
      session,
    } as unknown as Request;
    const service = new BookingAccessService(
      prisma as never,
      crypto,
      phone,
      redis as never,
      idempotency as never,
    );

    const result = await service.establishContactReadSession(
      request,
      familyBookingPublicId,
      "010-0000-7147",
      "contact-read-key-123",
    );

    expect(result).toMatchObject({ familyBookingId: familyBookingPublicId });
    expect(request.session).toMatchObject({
      bookingManagementSessionId: managementPublicId,
      bookingManagementExpiresAt: result.expiresAt.getTime(),
      csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
    });
    expect(prisma.bookingAccessCredential.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        familyBooking: {
          publicId: familyBookingPublicId,
          status: { in: ["RESERVED", "CHECKED_IN"] },
        },
        status: "ACTIVE",
      }),
    }));
    expect(idempotency.execute).toHaveBeenCalledWith(
      "BOOKING_CONTACT_READ_SESSION",
      "contact-read-key-123",
      {
        familyBookingId: familyBookingPublicId,
        contactDigest: Buffer.from(protectedContact.digest).toString("base64url"),
      },
      expect.any(Function),
    );
    expect(authAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: "BOOKING_CONTACT_READ_SESSION",
        resultCode: "SUCCEEDED",
      }),
    }));
    expect(JSON.stringify(idempotency.execute.mock.calls)).not.toContain("01000007147");
  });

  // 예약 없음과 연락처 불일치에 같은 일반 오류 반환
  it("returns one generic error for a missing booking or mismatched contact", async () => {
    const crypto = new BookingCryptoService();
    const phone = new PhoneProtector(environment());
    const authAuditCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      bookingAccessCredential: { findFirst: vi.fn().mockResolvedValue(null) },
      authAudit: { create: authAuditCreate },
    };
    const redis = {
      prefix: "npr:",
      client: { eval: vi.fn().mockResolvedValue(1) },
    };
    const idempotency = { replay: vi.fn().mockResolvedValue(null) };
    const request = {
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      session: {},
    } as unknown as Request;
    const service = new BookingAccessService(
      prisma as never,
      crypto,
      phone,
      redis as never,
      idempotency as never,
    );

    await expect(service.establishContactReadSession(
      request,
      randomUUID(),
      "010-0000-7147",
      "contact-read-invalid-123",
    )).rejects.toMatchObject({ status: 401, code: "BOOKING_READ_SESSION_INVALID" });
    expect(authAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: "BOOKING_CONTACT_READ_SESSION",
        resultCode: "INVALID",
      }),
    }));
  });

  // 미참석·취소 예약은 같은 일반 읽기 세션 오류
  it.each(["NO_SHOW", "CANCELLED"])(
    "returns the same generic read-session error for a %s booking",
    async (bookingStatus) => {
      const crypto = new BookingCryptoService();
      const phone = new PhoneProtector(environment());
      const findFirst = vi.fn().mockResolvedValue(null);
      const authAuditCreate = vi.fn().mockResolvedValue({});
      const familyBookingPublicId = randomUUID();
      const prisma = {
        bookingAccessCredential: { findFirst },
        authAudit: { create: authAuditCreate },
      };
      const redis = { prefix: "npr:", client: { eval: vi.fn().mockResolvedValue(1) } };
      const idempotency = { replay: vi.fn().mockResolvedValue(null) };
      const request = {
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
        session: {},
      } as unknown as Request;
      const service = new BookingAccessService(
        prisma as never,
        crypto,
        phone,
        redis as never,
        idempotency as never,
      );

      await expect(service.establishContactReadSession(
        request,
        familyBookingPublicId,
        "010-0000-7147",
        `contact-read-${bookingStatus.toLowerCase()}-key`,
      )).rejects.toMatchObject({
        status: 401,
        code: "BOOKING_READ_SESSION_INVALID",
        message: "The booking or contact is invalid.",
      });
      expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          familyBooking: {
            publicId: familyBookingPublicId,
            status: { in: ["RESERVED", "CHECKED_IN"] },
          },
        }),
      }));
      expect(authAuditCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ resultCode: "INVALID" }),
      }));
    },
  );
});
