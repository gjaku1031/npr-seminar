import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { DomainError } from "../errors/domain-error.js";
import { type AppEnvironment } from "../config/environment.js";

export interface ProtectedPhone {
  readonly ciphertext: Buffer;
  readonly digest: Buffer;
  readonly last4: string;
}

@Injectable()
export class PhoneProtector {
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  public normalize(value: string): string {
    const digits = value.normalize("NFKC").replaceAll(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      throw new DomainError(400, "PHONE_INVALID", "The contact number is invalid.");
    }
    return digits;
  }

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

  public reveal(ciphertext: Uint8Array): string {
    const plaintext = this.decrypt(ciphertext, this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY"));
    return this.normalize(plaintext);
  }

  public encryptSmsPayload(value: string): Buffer {
    const rootKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const key = Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), "npr-sms-payload-v1", 32));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("npr-sms-payload-v1", "utf8"));
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
  }

  public decryptSmsPayload(ciphertext: Uint8Array): string {
    const rootKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const key = Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), "npr-sms-payload-v1", 32));
    return this.decrypt(ciphertext, key, "npr-sms-payload-v1");
  }

  public encryptSheetPayload(value: string): Buffer {
    const rootKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const key = Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), "npr-sheet-payload-v1", 32));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("npr-sheet-payload-v1", "utf8"));
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
  }

  public decryptSheetPayload(ciphertext: Uint8Array): string {
    const rootKey = this.key(this.environment.phoneEncryptionKey, "PHONE_ENCRYPTION_KEY");
    const key = Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), "npr-sheet-payload-v1", 32));
    return this.decrypt(ciphertext, key, "npr-sheet-payload-v1");
  }

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
