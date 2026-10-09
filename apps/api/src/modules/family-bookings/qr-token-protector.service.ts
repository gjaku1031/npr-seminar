import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";

/**
 * 암호문 형식 버전
 */
const FORMAT_VERSION = 1;

/**
 * AES-GCM IV 길이(바이트)
 */
const IV_BYTES = 12;

/**
 * AES-GCM 인증 태그 길이(바이트)
 */
const TAG_BYTES = 16;

/**
 * QR 토큰 암호화 AAD. 다른 용도 암호문과 섞이지 않게 함
 */
const AAD = Buffer.from("npr-seminar:qr-token:v1", "utf8");

/**
 * QR 원문 토큰 암호화 보관
 *
 * 다이제스트만으로는 QR을 다시 보여 줄 수 없어 관리 화면 재표시용으로 원문을 AES-256-GCM으로 보관
 */
@Injectable()
export class QrTokenProtector {
  /**
   * 실행 환경 주입. QR 암호화 키를 읽음
   */
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  /**
   * QR 원문 암호화
   *
   * @returns 버전 1바이트 + IV + 태그 + 암호문
   * @throws {DomainError} 503 키 미설정
   */
  public protect(rawToken: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(rawToken, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
  }

  /**
   * QR 원문 복호화. 결과가 base64url 43자 형식이어야 함
   *
   * @throws {DomainError} 500 형식·인증 실패, 503 키 미설정
   */
  public reveal(value: Uint8Array): string {
    const packed = Buffer.from(value);
    if (packed.length < 1 + IV_BYTES + TAG_BYTES + 1 || packed[0] !== FORMAT_VERSION) this.invalid();
    const iv = packed.subarray(1, 1 + IV_BYTES);
    const tag = packed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const ciphertext = packed.subarray(1 + IV_BYTES + TAG_BYTES);
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key(), iv);
      decipher.setAAD(AAD);
      decipher.setAuthTag(tag);
      const rawToken = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      if (!/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) this.invalid();
      return rawToken;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      return this.invalid();
    }
  }

  /**
   * QR 암호화 키
   *
   * @throws {DomainError} 503 QR_ENCRYPTION_NOT_CONFIGURED
   */
  private key(): Buffer {
    const configured = this.environment.qrEncryptionKey;
    if (configured === undefined) {
      throw new DomainError(503, "QR_ENCRYPTION_NOT_CONFIGURED", "QR recovery encryption is not configured.");
    }
    return Buffer.from(configured, "base64");
  }

  /**
   * 저장된 QR 암호문 복구 불가 오류 발생
   *
   * @throws {DomainError} 500 QR_CIPHERTEXT_INVALID
   */
  private invalid(): never {
    throw new DomainError(500, "QR_CIPHERTEXT_INVALID", "The stored QR credential cannot be recovered.");
  }
}
