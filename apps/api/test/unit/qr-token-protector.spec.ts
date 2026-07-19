import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { QrTokenProtector } from "../../src/modules/family-bookings/qr-token-protector.service.js";

function protector(key = Buffer.alloc(32, 11).toString("base64")) {
  return new QrTokenProtector({ qrEncryptionKey: key } as AppEnvironment);
}

describe("QR token AEAD protection", () => {
  it("recovers a token while producing randomized ciphertext that does not contain the raw token", () => {
    const raw = randomBytes(32).toString("base64url");
    const service = protector();
    const first = service.protect(raw);
    const second = service.protect(raw);
    expect(first.equals(second)).toBe(false);
    expect(first.includes(Buffer.from(raw))).toBe(false);
    expect(service.reveal(first)).toBe(raw);
    expect(service.reveal(second)).toBe(raw);
  });

  it("rejects a tampered authentication tag", () => {
    const service = protector();
    const ciphertext = service.protect(randomBytes(32).toString("base64url"));
    ciphertext[20] = ciphertext[20]! ^ 1;
    expect(() => service.reveal(ciphertext)).toThrowError(expect.objectContaining({ code: "QR_CIPHERTEXT_INVALID" }));
  });

  it("fails closed when the API-only key is unavailable", () => {
    const service = new QrTokenProtector({} as AppEnvironment);
    expect(() => service.protect(randomBytes(32).toString("base64url")))
      .toThrowError(expect.objectContaining({ code: "QR_ENCRYPTION_NOT_CONFIGURED" }));
  });
});
