import { Injectable } from "@nestjs/common";
import iconv from "iconv-lite";
import { DomainError } from "../../common/errors/domain-error.js";

export interface SmsPayloadClassification {
  readonly messageType: "SMS" | "LMS";
  readonly messageBytes: number;
  readonly titleBytes: number | null;
}

@Injectable()
export class SmsMessagePolicy {
  public classify(messageInput: string, titleInput?: string | null): SmsPayloadClassification {
    const message = messageInput.normalize("NFC");
    const messageBytes = this.bytes(message, "SMS_MESSAGE_UNREPRESENTABLE");
    if (messageBytes < 1 || messageBytes > 2_000) {
      throw new DomainError(400, "SMS_MESSAGE_SIZE_INVALID", "The message must be 1 to 2,000 EUC-KR bytes.");
    }
    const messageType = messageBytes <= 90 ? "SMS" : "LMS";
    const title = titleInput?.normalize("NFC") ?? null;
    if (messageType === "SMS" && title !== null && title.length > 0) {
      throw new DomainError(400, "SMS_TITLE_NOT_ALLOWED", "A title is only allowed for LMS messages.");
    }
    const titleBytes = title === null || title.length === 0 ? null : this.bytes(title, "SMS_TITLE_UNREPRESENTABLE");
    if (titleBytes !== null && (titleBytes < 1 || titleBytes > 44)) {
      throw new DomainError(400, "SMS_TITLE_SIZE_INVALID", "The LMS title must be 1 to 44 EUC-KR bytes.");
    }
    return { messageType, messageBytes, titleBytes };
  }

  private bytes(value: string, errorCode: string): number {
    for (const character of value) {
      const encoded = iconv.encode(character, "euc-kr");
      if (iconv.decode(encoded, "euc-kr") !== character) {
        throw new DomainError(400, errorCode, "The SMS payload contains characters that cannot be represented in EUC-KR.");
      }
    }
    return iconv.encode(value, "euc-kr").byteLength;
  }
}
