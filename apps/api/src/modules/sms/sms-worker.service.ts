import { Injectable } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { AligoGateway, type SmsGatewayResult } from "./aligo.gateway.js";

/** DB에서 lease와 함께 받은 암호화된 발송 행. 평문은 발송 중 메모리에서만 꺼낸다. */
interface ClaimedSms {
  readonly id: bigint;
  readonly lease_token: string;
  readonly attempt_count: number;
  readonly branch_code: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  readonly recipient_ciphertext: Uint8Array;
  readonly message_ciphertext: Uint8Array;
  readonly title_ciphertext: Uint8Array | null;
  readonly message_type: "SMS" | "LMS";
}

/** 문자 아웃박스를 소유권 표식으로 집어 Aligo에 전달하고 결과를 기록한다. */
@Injectable()
export class SmsWorkerService {
  private static readonly maxAttempts = 5;

  public constructor(
    private readonly prisma: PrismaService,
    private readonly phoneProtector: PhoneProtector,
    private readonly gateway: AligoGateway,
  ) {}

  /** 만료 lease를 정리한 뒤 최대 50건을 처리한다. 반환값은 성공 건수가 아닌 claim한 행 수다. */
  public async runOnce(batchSize = 10): Promise<number> {
    await this.reconcileExpiredLeases();
    const claimed = await this.claim(Math.min(Math.max(batchSize, 1), 50));
    await Promise.all(claimed.map((row) => this.process(row)));
    return claimed.length;
  }

  /** 전송 시각이 된 PENDING 행만 SKIP LOCKED로 집어 30초 CLAIMED lease를 부여한다. */
  private async claim(limit: number): Promise<ClaimedSms[]> {
    return this.prisma.$queryRaw<ClaimedSms[]>`
      with candidates as (
        select id from sms_outbox
         where status='PENDING' and next_attempt_at <= now()
         order by next_attempt_at,id
         for update skip locked
         limit ${limit}
      )
      update sms_outbox o
         set status='CLAIMED',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '30 seconds',updated_at=now()
        from candidates c where o.id=c.id
      returning o.id,o.lease_token,o.attempt_count,o.branch_code,o.recipient_ciphertext,
                o.message_ciphertext,o.title_ciphertext,o.message_type`;
  }

  /** 외부 호출 전 CLAIMED 만료는 재대기시키고, SENDING 만료는 중복 전송을 피하도록 DELIVERY_UNKNOWN으로 확정한다. */
  private async reconcileExpiredLeases(): Promise<void> {
    await this.prisma.smsOutbox.updateMany({
      where: { status: "CLAIMED", leaseExpiresAt: { lt: new Date() } },
      data: { status: "PENDING", leaseToken: null, leaseExpiresAt: null, nextAttemptAt: new Date(), lastErrorCode: "WORKER_PRE_SEND_LEASE_EXPIRED" },
    });
    await this.prisma.$executeRaw`
      with expired as (
        update sms_outbox
           set status='DELIVERY_UNKNOWN',lease_token=null,lease_expires_at=null,
               last_error_code='WORKER_LEASE_EXPIRED',updated_at=now()
         where status='SENDING' and lease_expires_at < now()
        returning id,attempt_count
      )
      insert into sms_attempts(sms_outbox_id,attempt_no,result,error_code,safe_metadata)
      select id,attempt_count,'DELIVERY_UNKNOWN','WORKER_LEASE_EXPIRED','{}'::jsonb from expired
      on conflict(sms_outbox_id,attempt_no) do nothing`;
  }

  /** 평문을 복호화한 뒤 소유권을 다시 확인해 SENDING으로 전환하고 {@link AligoGateway.send}를 호출한다. */
  private async process(row: ClaimedSms): Promise<void> {
    let recipient: string;
    let message: string;
    let title: string | null;
    try {
      recipient = this.phoneProtector.reveal(row.recipient_ciphertext);
      message = this.phoneProtector.decryptSmsPayload(row.message_ciphertext);
      title = row.title_ciphertext === null ? null : this.phoneProtector.decryptSmsPayload(row.title_ciphertext);
    } catch {
      await this.failClaimed(row, "SMS_PAYLOAD_DECRYPTION_FAILED");
      return;
    }
    const sending = await this.prisma.smsOutbox.updateMany({
      where: { id: row.id, status: "CLAIMED", leaseToken: row.lease_token },
      data: { status: "SENDING", attemptCount: { increment: 1 }, leaseExpiresAt: new Date(Date.now() + 30_000) },
    });
    if (sending.count !== 1) return;
    const result = await this.gateway.send({ branch: row.branch_code, recipient, message, messageType: row.message_type, title });
    await this.finish({ ...row, attempt_count: row.attempt_count + 1 }, result);
  }

  /** 발송 전 복호화 실패만 현재 lease의 영구 실패로 기록한다. 외부 전송은 시도하지 않는다. */
  private async failClaimed(row: ClaimedSms, errorCode: string): Promise<void> {
    await this.prisma.smsOutbox.updateMany({
      where: { id: row.id, status: "CLAIMED", leaseToken: row.lease_token },
      data: { status: "FAILED_PERMANENT", leaseToken: null, leaseExpiresAt: null, lastErrorCode: errorCode },
    });
  }

  /**
   * 현재 SENDING lease만 완료한다. 결과와 시도 내역을 한 트랜잭션에 기록한다.
   * RETRYABLE만 지수 지연 재대기하며 총 시도 5회에 도달하면 DEAD로 남긴다.
   */
  private async finish(row: ClaimedSms, result: SmsGatewayResult): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.smsOutbox.findFirst({
        where: { id: row.id, status: "SENDING", leaseToken: row.lease_token },
        select: { id: true },
      });
      if (current === null) return;
      const exhausted = result.kind === "RETRYABLE" && row.attempt_count >= SmsWorkerService.maxAttempts;
      const status = exhausted ? "DEAD" : result.kind === "RETRYABLE" ? "PENDING" : result.kind;
      const auditResult = exhausted ? "DEAD" : result.kind;
      const retryDelaySeconds = Math.min(300, 5 * 2 ** Math.max(0, row.attempt_count - 1) + Math.floor(Math.random() * 5));
      await transaction.smsAttempt.create({
        data: {
          smsOutboxId: row.id,
          attemptNo: row.attempt_count,
          result: auditResult,
          ...(result.kind === "SENT" ? {
            providerResultCode: result.providerResultCode,
            providerMessageId: result.providerMessageId,
          } : {
            errorCode: result.errorCode,
            ...(result.providerResultCode === undefined ? {} : { providerResultCode: result.providerResultCode }),
          }),
          safeMetadata: {},
        },
      });
      await transaction.smsOutbox.update({
        where: { id: row.id },
        data: {
          status,
          leaseToken: null,
          leaseExpiresAt: null,
          ...(result.kind === "RETRYABLE" && !exhausted ? { nextAttemptAt: new Date(Date.now() + retryDelaySeconds * 1_000) } : {}),
          ...(result.kind === "SENT" ? {
            providerMessageId: result.providerMessageId,
            providerResultCode: result.providerResultCode,
            providerMessageType: result.providerMessageType,
            lastErrorCode: null,
          } : { lastErrorCode: exhausted ? "RETRY_EXHAUSTED" : result.errorCode }),
        },
      });
    });
  }
}
