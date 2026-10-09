import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { QrTokenProtector } from "../../src/modules/family-bookings/qr-token-protector.service.js";

/**
 * QR 암호화 키를 설정한 보호기
 *
 * @param key base64 키. undefined면 키 미설정
 */
function protector(key = Buffer.alloc(32, 11).toString("base64")) {
  return new QrTokenProtector({ qrEncryptionKey: key } as AppEnvironment);
}

// QR 토큰 AEAD 암호화
describe("QR token AEAD protection", () => {
  // 원문을 복구하고 암호문은 매번 달라지며 원문을 포함하지 않음
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

  // 인증 태그가 변조되면 거부
  it("rejects a tampered authentication tag", () => {
    const service = protector();
    const ciphertext = service.protect(randomBytes(32).toString("base64url"));
    ciphertext[20] = ciphertext[20]! ^ 1;
    expect(() => service.reveal(ciphertext)).toThrowError(expect.objectContaining({ code: "QR_CIPHERTEXT_INVALID" }));
  });

  // API 전용 키가 없으면 안전하게 실패
  it("fails closed when the API-only key is unavailable", () => {
    const service = new QrTokenProtector({} as AppEnvironment);
    expect(() => service.protect(randomBytes(32).toString("base64url")))
      .toThrowError(expect.objectContaining({ code: "QR_ENCRYPTION_NOT_CONFIGURED" }));
  });
});
