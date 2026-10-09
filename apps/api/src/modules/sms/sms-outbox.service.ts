import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { SmsMessagePolicy } from "./sms-message-policy.service.js";

/**
 * 문자 발생 원인
 */
export type SmsSource = "OTP" | "BOOKING_CONFIRMED" | "BOOKING_UPDATED" | "BOOKING_CANCELLED" | "FIRST_CHECK_IN" | "ADMIN_GROUP";

/**
 * 지점 코드. A·B·C
 */
export type SmsBranch = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

/**
 * 대기열 적재 입력
 */
export interface EnqueueSmsInput {
  /**
   * 중복 방지 이벤트 키. SHA-256으로 저장하며 같은 키는 한 번만 적재
   */
  readonly eventKey: string;

  /**
   * 발생 원인
   */
  readonly source: SmsSource;

  /**
   * 발신 지점
   */
  readonly branch: SmsBranch;

  /**
   * 관련 회차 공개 ID. 없으면 null
   */
  readonly seminarSessionPublicId?: string | null;

  /**
   * 관련 예약 공개 ID. 없으면 null
   */
  readonly familyBookingPublicId?: string | null;

  /**
   * 수신 번호 암호문
   */
  readonly recipientCiphertext: Uint8Array;

  /**
   * 수신 번호 HMAC 다이제스트
   */
  readonly recipientDigest: Uint8Array;

  /**
   * 수신 번호 끝 4자리
   */
  readonly recipientLast4: string;

  /**
   * 렌더링된 본문
   */
  readonly message: string;

  /**
   * LMS 제목. null·빈 문자열은 제목 없음
   */
  readonly title?: string | null;

  /**
   * 발송 요청 주체. 시스템 발송은 null
   */
  readonly actorSubject?: string | null;

  /**
   * 감사용 비식별 부가 정보
   */
  readonly safeMetadata?: Readonly<Record<string, string | number | boolean | null>>;

  /**
   * 발송 가능 시작 시각. 예약 발송의 유일한 수단
   *
   * 워커가 `status='PENDING' and next_attempt_at <= now()`로만 가져가므로 별도 스케줄러·상태값 불필요
   * 미래 시각이면 그때까지 대기 후 평소 경로로 발송. 생략하면 now로 즉시 발송
   */
  readonly notBefore?: Date | null;
}

/**
 * 문자 발송 대기열(sms_outbox) 적재
 *
 * 호출자 트랜잭션 안에서 적재해 업무 변경과 문자 적재가 함께 커밋·롤백됨
 */
@Injectable()
export class SmsOutboxService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 문자 페이로드 암호화
     */
    private readonly phoneProtector: PhoneProtector,

    /**
     * 길이·유형 분류
     */
    private readonly policy: SmsMessagePolicy,
  ) {}

  /**
   * 문자 1건 적재
   *
   * 본문·제목은 암호화해 저장. 같은 이벤트 키가 이미 있으면 아무것도 하지 않음
   *
   * @param transaction 호출자 트랜잭션
   * @throws {DomainError} 400 문자 길이·문자 집합 정책 위반
   */
  public async enqueue(transaction: Prisma.TransactionClient, input: EnqueueSmsInput): Promise<void> {
    const classification = this.policy.classify(input.message, input.title);
    const eventKeyDigest = createHash("sha256").update(input.eventKey).digest();
    const messageCiphertext = this.phoneProtector.encryptSmsPayload(input.message.normalize("NFC"));
    const title = input.title?.normalize("NFC") ?? null;
    const titleCiphertext = title === null || title.length === 0 ? null : this.phoneProtector.encryptSmsPayload(title);
    const safeMetadata = JSON.stringify(input.safeMetadata ?? {});
    await transaction.$executeRaw`
      insert into sms_outbox(
        event_key_digest,source,branch_code,seminar_session_public_id,family_booking_public_id,
        recipient_ciphertext,recipient_digest,recipient_last4,message_ciphertext,title_ciphertext,
        message_type,message_bytes,title_bytes,actor_subject,safe_metadata,next_attempt_at
      ) values (
        ${this.bytes(eventKeyDigest)},${input.source},${input.branch},${input.seminarSessionPublicId ?? null}::uuid,
        ${input.familyBookingPublicId ?? null}::uuid,${this.bytes(input.recipientCiphertext)},${this.bytes(input.recipientDigest)},
        ${input.recipientLast4},${this.bytes(messageCiphertext)},${titleCiphertext === null ? null : this.bytes(titleCiphertext)},
        ${classification.messageType},${classification.messageBytes},${classification.titleBytes},${input.actorSubject ?? null},
        ${safeMetadata}::jsonb,coalesce(${input.notBefore ?? null}::timestamptz, now())
      ) on conflict(event_key_digest) do nothing`;
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
    copy.set(value);
    return copy;
  }
}
