import { Injectable } from "@nestjs/common";
import iconv from "iconv-lite";
import { DomainError } from "../../common/errors/domain-error.js";

/**
 * 문자 길이 분류 결과
 */
export interface SmsPayloadClassification {
  /**
   * 메시지 유형
   */
  readonly messageType: "SMS" | "LMS";

  /**
   * 본문 EUC-KR 바이트 수
   */
  readonly messageBytes: number;

  /**
   * 제목 EUC-KR 바이트 수. 제목 없으면 null
   */
  readonly titleBytes: number | null;
}

/**
 * 문자 본문·제목 길이 정책
 *
 * EUC-KR 기준 본문 1~2,000바이트, 90바이트 이하는 SMS·초과는 LMS. 제목은 LMS에서만 1~44바이트
 */
@Injectable()
export class SmsMessagePolicy {
  /**
   * NFC 정규화 후 유형·바이트 수 계산
   *
   * @param titleInput LMS 제목. null·빈 문자열은 제목 없음
   * @throws {DomainError} 400 EUC-KR 표현 불가 문자, 길이 범위 밖, SMS에 제목 지정
   */
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

  /**
   * EUC-KR 바이트 수
   *
   * 글자 단위로 인코딩 왕복이 같은지 확인해 대체 문자로 바뀌는 글자를 거부
   *
   * @throws {DomainError} 400 표현 불가 문자
   */
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
