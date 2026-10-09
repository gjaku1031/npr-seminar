import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { DomainError } from "../errors/domain-error.js";
import { type AppEnvironment } from "../config/environment.js";

/**
 * 보호 처리한 연락처
 */
export interface ProtectedPhone {
  /**
   * AES-256-GCM 암호문. 버전 1바이트 + IV 12바이트 + 태그 16바이트 + 본문
   */
  readonly ciphertext: Buffer;

  /**
   * 조회용 HMAC-SHA256 다이제스트. 같은 번호는 같은 값
   */
  readonly digest: Buffer;

  /**
   * 화면 표시용 끝 4자리
   */
  readonly last4: string;
}

/**
 * 연락처와 발송 페이로드의 암호화·복호화
 *
 * 연락처는 루트 키로 직접, 문자·시트 페이로드는 HKDF로 용도별 파생 키와 AAD를 써서 서로 섞이지 않게 함
 */
@Injectable()
export class PhoneProtector {
  /**
   * 실행 환경 주입. 암호화·HMAC 키를 읽음
   */
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  /**
   * 연락처를 숫자만 남긴 형태로 정규화
   *
   * @returns 8~15자리 숫자 문자열
   * @throws {DomainError} 400 PHONE_INVALID 길이 범위 밖
   */
  public normalize(value: string): string {
    const digits = value.normalize("NFKC").replaceAll(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      throw new DomainError(400, "PHONE_INVALID", "The contact number is invalid.");
    }
    return digits;
  }

  /**
   * 연락처 정규화 후 암호문·다이제스트·끝 4자리 생성
   *
   * @throws {DomainError} 400 번호 형식 오류, 503 키 미설정·형식 오류
   */
  public protect(value: string): ProtectedPhone {
    const normalized = this.normalize(value);
    const encryptionKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const hmacKey = this.key(this.environment.phoneHmacKey, "PHONE_HMAC_KEY");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: Buffer.concat([Buffer.from([1]), iv, tag, encrypted]),
      digest: createHmac("sha256", hmacKey).update(normalized).digest(),
      last4: normalized.slice(-4),
    };
  }

  /**
   * 연락처 암호문 복호화 후 정규화
   *
   * @throws {DomainError} 500 암호문 손상, 503 키 오류
   */
  public reveal(ciphertext: Uint8Array): string {
    const plaintext = this.decrypt(ciphertext, this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY"));
    return this.normalize(plaintext);
  }

  /**
   * 문자 본문·제목 암호화. 문자 전용 파생 키와 AAD 사용
   */
  public encryptSmsPayload(value: string): Buffer {
    const rootKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const key = Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), "npr-sms-payload-v1", 32));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("npr-sms-payload-v1", "utf8"));
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
  }

  /**
   * 문자 페이로드 복호화
   *
   * @throws {DomainError} 500 암호문 손상·용도 불일치
   */
  public decryptSmsPayload(ciphertext: Uint8Array): string {
    const rootKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const key = Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), "npr-sms-payload-v1", 32));
    return this.decrypt(ciphertext, key, "npr-sms-payload-v1");
  }

  /**
   * 시트 반영 페이로드 암호화. 시트 전용 파생 키와 AAD 사용
   */
  public encryptSheetPayload(value: string): Buffer {
    const rootKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const key = Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), "npr-sheet-payload-v1", 32));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("npr-sheet-payload-v1", "utf8"));
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
  }

  /**
   * 시트 반영 페이로드 복호화
   *
   * @throws {DomainError} 500 암호문 손상·용도 불일치
   */
  public decryptSheetPayload(ciphertext: Uint8Array): string {
    const rootKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const key = Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), "npr-sheet-payload-v1", 32));
    return this.decrypt(ciphertext, key, "npr-sheet-payload-v1");
  }

  /**
   * 버전 1 묶음 암호문 복호화
   *
   * 길이·버전 확인 후 IV·태그 분리. 인증 실패는 원인 노출 없이 같은 오류로 변환
   *
   * @param aad 파생 키 용도 문자열. 연락처는 생략
   * @throws {DomainError} 500 CIPHERTEXT_INVALID
   */
  private decrypt(ciphertext: Uint8Array, key: Buffer, aad?: string): string {
    const packed = Buffer.from(ciphertext);
    if (packed.length < 30 || packed[0] !== 1) {
      throw new DomainError(500, "CIPHERTEXT_INVALID", "Encrypted contact data is invalid.");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(1, 13));
    if (aad !== undefined) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(packed.subarray(13, 29));
    try {
      return Buffer.concat([decipher.update(packed.subarray(29)), decipher.final()]).toString("utf8");
    } catch {
      throw new DomainError(500, "CIPHERTEXT_INVALID", "Encrypted contact data is invalid.");
    }
  }

  /**
   * base64 키를 32바이트 버퍼로 변환
   *
   * @param name 오류 메시지에 쓸 환경 변수 이름
   * @throws {DomainError} 503 미설정 또는 32바이트 아님
   */
  private key(value: string | undefined, name: string): Buffer {
    if (value === undefined) {
      throw new DomainError(503, "CRYPTO_NOT_CONFIGURED", `${name} is not configured.`);
    }
    const decoded = Buffer.from(value, "base64");
    if (decoded.length !== 32) {
      throw new DomainError(503, "CRYPTO_CONFIGURATION_INVALID", `${name} must decode to 32 bytes.`);
    }
    return decoded;
  }
}
