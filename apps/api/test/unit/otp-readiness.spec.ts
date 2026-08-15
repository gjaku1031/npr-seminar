import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { DomainError } from "../../src/common/errors/domain-error.js";
import { OtpController } from "../../src/modules/family-bookings/otp.controller.js";
import { OtpService } from "../../src/modules/family-bookings/otp.service.js";

const baseEnvironment: AppEnvironment = {
  appEnv: "test", processRole: "api", port: 4000,
  phoneEncryptionKey: "BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=",
  phoneHmacKey: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=",
  smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
  smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined }, smsAligoTestMode: true,
  googleSheetsEnabled: false, trustProxy: 0, tongSyncEnabled: false,
  sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
};

function service(environment: AppEnvironment): OtpService {
  return new OtpService(
    {} as never, {} as never, new PhoneProtector(environment), {} as never, {} as never, {} as never, environment,
  );
}

describe("OTP delivery readiness", () => {
  it("fails closed when SMS is disabled or the recipient is not allowlisted", async () => {
    await expect(service(baseEnvironment).create({} as Request, "01012345678", "FAMILY_BOOKING", "valid-key-1", "CAMPUS_A"))
      .rejects.toMatchObject({ code: "SMS_UNAVAILABLE" });
    const enabled = { ...baseEnvironment, smsEnabled: true };
    await expect(service(enabled).create({} as Request, "01012345678", "FAMILY_BOOKING", "valid-key-2", "CAMPUS_A"))
      .rejects.toMatchObject({ code: "SMS_UNAVAILABLE" });
  });

  it("requires a valid idempotency key before invoking the OTP service", () => {
    const create = vi.fn();
    const controller = new OtpController({ create } as unknown as OtpService);
    expect(() => controller.create({} as Request, { contact: "01012345678", purpose: "FAMILY_BOOKING", branch: "CAMPUS_A" }, "short"))
      .toThrowError(DomainError);
    expect(create).not.toHaveBeenCalled();
  });
});
