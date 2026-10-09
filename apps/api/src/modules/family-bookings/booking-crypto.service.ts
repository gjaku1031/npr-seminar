import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

/**
 * 예약 토큰 발급과 다이제스트 계산
 */
@Injectable()
export class BookingCryptoService {
  /**
   * SHA-256 다이제스트
   */
  public digest(value: string | Uint8Array): Buffer {
    return createHash("sha256").update(value).digest();
  }

  /**
   * QR 토큰 발급
   *
   * @returns 32바이트 임의값의 base64url 원문(43자)과 다이제스트
   */
  public issueQr(): { rawToken: string; digest: Buffer } {
    const rawToken = randomBytes(32).toString("base64url");
    return { rawToken, digest: this.digest(rawToken) };
  }

  /**
   * 예약 관리 링크 토큰 발급
   *
   * @returns 32바이트 임의값의 base64url 원문(43자)과 다이제스트
   */
  public issueBookingAccess(): { rawToken: string; digest: Buffer } {
    const rawToken = randomBytes(32).toString("base64url");
    return { rawToken, digest: this.digest(rawToken) };
  }

  /**
   * 객체 키를 정렬한 결정적 JSON 문자열. 멱등 요청 비교용
   */
  public stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, nested) => {
      if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
        return Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
      }
      return nested;
    });
  }
}
