import { Injectable } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { AligoGateway, type SmsGatewayResult } from "./aligo.gateway.js";

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

@Injectable()
export class SmsWorkerService {
  private static readonly maxAttempts = 5;

  public constructor(
    private readonly prisma: PrismaService,
    private readonly phoneProtector: PhoneProtector,
    private readonly gateway: AligoGateway,
  ) {}

  public async runOnce(batchSize = 10): Promise<number> {
    await this.reconcileExpiredLeases();
    const claimed = await this.claim(Math.min(Math.max(batchSize, 1), 50));
    await Promise.all(claimed.map((row) => this.process(row)));
    return claimed.length;
  }

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

  private async failClaimed(row: ClaimedSms, errorCode: string): Promise<void> {
    await this.prisma.smsOutbox.updateMany({
      where: { id: row.id, status: "CLAIMED", leaseToken: row.lease_token },
      data: { status: "FAILED_PERMANENT", leaseToken: null, leaseExpiresAt: null, lastErrorCode: errorCode },
    });
  }

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
