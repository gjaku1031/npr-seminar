import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { SmsMessagePolicy } from "./sms-message-policy.service.js";

export type SmsSource = "OTP" | "BOOKING_CONFIRMED" | "BOOKING_UPDATED" | "BOOKING_CANCELLED" | "FIRST_CHECK_IN" | "ADMIN_GROUP" | "SURVEY";
export type SmsBranch = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

export interface EnqueueSmsInput {
  readonly eventKey: string;
  readonly source: SmsSource;
  readonly branch: SmsBranch;
  readonly seminarSessionPublicId?: string | null;
  readonly familyBookingPublicId?: string | null;
  readonly recipientCiphertext: Uint8Array;
  readonly recipientDigest: Uint8Array;
  readonly recipientLast4: string;
  readonly message: string;
  readonly title?: string | null;
  readonly actorSubject?: string | null;
  readonly safeMetadata?: Readonly<Record<string, string | number | boolean | null>>;
  /**
   * 이 시각 전에는 워커가 집지 않는다 — 예약 발송의 전부다.
   *
   * 워커는 이미 `status='PENDING' and next_attempt_at <= now()` 로만 집으므로, 별도의 스케줄러도
   * 상태값도 필요 없다. 미래 시각을 넣으면 그때까지 큐에 조용히 앉아 있다가 평소 경로로 나간다.
   * 생략하면 기본값(now)이라 즉시 발송이다.
   */
  readonly notBefore?: Date | null;
}

@Injectable()
export class SmsOutboxService {
  public constructor(
    private readonly phoneProtector: PhoneProtector,
    private readonly policy: SmsMessagePolicy,
  ) {}

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

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
    copy.set(value);
    return copy;
  }
}
