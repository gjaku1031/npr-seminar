import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

@Injectable()
export class BookingCryptoService {
  public digest(value: string | Uint8Array): Buffer {
    return createHash("sha256").update(value).digest();
  }

  public issueQr(): { rawToken: string; digest: Buffer } {
    const rawToken = randomBytes(32).toString("base64url");
    return { rawToken, digest: this.digest(rawToken) };
  }

  public issueBookingAccess(): { rawToken: string; digest: Buffer } {
    const rawToken = randomBytes(32).toString("base64url");
    return { rawToken, digest: this.digest(rawToken) };
  }

  public stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, nested) => {
      if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
        return Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
      }
      return nested;
    });
  }
}
