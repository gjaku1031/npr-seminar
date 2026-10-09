import { Injectable } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { AligoGateway, type SmsGatewayResult } from "./aligo.gateway.js";

/**
 * lease와 함께 가져온 암호화된 발송 행. 평문은 발송 중 메모리에서만 복호화
 */
interface ClaimedSms {
  /**
   * 대기열 행 ID
   */
  readonly id: bigint;

  /**
   * 이번 lease의 소유권 토큰
   */
  readonly lease_token: string;

  /**
   * 지금까지의 시도 횟수
   */
  readonly attempt_count: number;

  /**
   * 발신 지점
   */
  readonly branch_code: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 수신 번호 암호문
   */
  readonly recipient_ciphertext: Uint8Array;

  /**
   * 본문 암호문
   */
  readonly message_ciphertext: Uint8Array;

  /**
   * 제목 암호문. 제목 없으면 null
   */
  readonly title_ciphertext: Uint8Array | null;

  /**
   * 메시지 유형
   */
  readonly message_type: "SMS" | "LMS";
}

/**
 * 문자 대기열 행을 lease 토큰으로 점유해 알리고에 전달하고 결과 기록
 *
 * 상태 전이: PENDING → CLAIMED(외부 호출 전) → SENDING(외부 호출 중) → SENT·FAILED_PERMANENT·DELIVERY_UNKNOWN·BLOCKED_*
 * RETRYABLE은 PENDING으로 재대기, 5회 소진 시 DEAD
 */
@Injectable()
export class SmsWorkerService {
  /**
   * 최대 시도 횟수
   */
  private static readonly maxAttempts = 5;

  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 워커 DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 수신 번호·본문 복호화
     */
    private readonly phoneProtector: PhoneProtector,

    /**
     * 알리고 게이트웨이
     */
    private readonly gateway: AligoGateway,
  ) {}

  /**
   * 만료 lease 정리 후 대기 행 일괄 처리
   *
   * @param batchSize 한 번에 점유할 행 수. 1~50으로 제한
   * @returns 성공 건수가 아니라 점유한 행 수. 0이면 호출자가 대기
   */
  public async runOnce(batchSize = 10): Promise<number> {
    await this.reconcileExpiredLeases();
    const claimed = await this.claim(Math.min(Math.max(batchSize, 1), 50));
    await Promise.all(claimed.map((row) => this.process(row)));
    return claimed.length;
  }

  /**
   * 발송 시각이 된 PENDING 행을 SKIP LOCKED로 점유하고 30초 CLAIMED lease 부여
   *
   * 여러 워커가 동시에 실행돼도 같은 행을 중복 점유하지 않음
   */
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

  /**
   * 만료 lease 정리
   *
   * CLAIMED 만료는 외부 호출 전이라 PENDING으로 되돌림
   * SENDING 만료는 전송됐을 수 있어 중복 발송을 피하려고 DELIVERY_UNKNOWN으로 확정하고 시도 기록 추가
   */
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

  /**
   * 행 1건 발송
   *
   * 1. 평문 복호화. 실패하면 외부 호출 없이 영구 실패
   * 2. lease 토큰이 그대로인지 확인하며 SENDING 전환과 시도 횟수 증가. 소유권을 잃었으면 중단
   * 3. AligoGateway.send 호출 후 결과 기록
   */
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
    // 다른 워커가 lease를 정리·재점유했으면 갱신 0건이므로 전송하지 않음
    const sending = await this.prisma.smsOutbox.updateMany({
      where: { id: row.id, status: "CLAIMED", leaseToken: row.lease_token },
      data: { status: "SENDING", attemptCount: { increment: 1 }, leaseExpiresAt: new Date(Date.now() + 30_000) },
    });
    if (sending.count !== 1) return;
    const result = await this.gateway.send({ branch: row.branch_code, recipient, message, messageType: row.message_type, title });
    await this.finish({ ...row, attempt_count: row.attempt_count + 1 }, result);
  }

  /**
   * 발송 전 복호화 실패를 현재 lease의 영구 실패로 기록. 외부 전송은 시도하지 않음
   */
  private async failClaimed(row: ClaimedSms, errorCode: string): Promise<void> {
    await this.prisma.smsOutbox.updateMany({
      where: { id: row.id, status: "CLAIMED", leaseToken: row.lease_token },
      data: { status: "FAILED_PERMANENT", leaseToken: null, leaseExpiresAt: null, lastErrorCode: errorCode },
    });
  }

  /**
   * 현재 SENDING lease의 결과 확정
   *
   * 결과 상태와 시도 기록을 한 트랜잭션에 저장. lease가 이미 바뀌었으면 아무것도 하지 않음
   * RETRYABLE만 지수 지연(5초×2^(시도-1)+0~4초 지터, 최대 300초) 후 재대기, 총 5회에 도달하면 DEAD
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
      // 시도 기록: 성공이면 공급자 메시지 ID, 실패면 오류 코드
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
      // 대기열 행 상태 확정과 lease 해제
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
