import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";

const FORMAT_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD = Buffer.from("npr-seminar:qr-token:v1", "utf8");

@Injectable()
export class QrTokenProtector {
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  public protect(rawToken: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(rawToken, "utf8"), cipher.final()]);
    return Buffer.concat([Buffer.from([FORMAT_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
  }

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

  private key(): Buffer {
    const configured = this.environment.qrEncryptionKey;
    if (configured === undefined) {
      throw new DomainError(503, "QR_ENCRYPTION_NOT_CONFIGURED", "QR recovery encryption is not configured.");
    }
    return Buffer.from(configured, "base64");
  }

  private invalid(): never {
    throw new DomainError(500, "QR_CIPHERTEXT_INVALID", "The stored QR credential cannot be recovered.");
  }
}
