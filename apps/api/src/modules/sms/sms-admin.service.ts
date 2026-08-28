import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { SmsMessagePolicy, type SmsPayloadClassification } from "./sms-message-policy.service.js";
import { SmsOutboxService, type SmsBranch, type SmsSource } from "./sms-outbox.service.js";
import { SmsTemplateRenderer } from "./sms-template-renderer.service.js";
import type { SmsTemplatePurpose } from "./sms-template-renderer.service.js";
import { SMS_TEMPLATE_EDITING_POLICY, type SmsTemplatePolicyView } from "./sms-template-policy.js";

export type SmsAudience =
  | "BOOKED_FAMILIES"
  | "RESERVED_FAMILIES"
  | "CHECKED_IN_FAMILIES"
  | "CANCELLED_FAMILIES"
  /** 테스트 예약만. 발송 경로를 실제 가족에게 닿지 않고 확인하기 위한 대상이다. */
  | "TEST_ACCOUNTS";

interface TargetRequest {
  readonly branch: SmsBranch;
  readonly seminarSessionId: string;
  readonly audience: SmsAudience;
  readonly templateId?: string;
  readonly message?: string;
  readonly title?: string;
}

interface ResolvedPayload {
  readonly messageTemplate: string;
  readonly titleTemplate: string | null;
  readonly templateId: string | null;
  readonly templateName: string;
  readonly templateVersion: string | null;
  readonly purpose: SmsTemplatePurpose | null;
}

interface PreparedTarget {
  readonly publicId: string;
  readonly version: bigint;
  readonly contactCiphertext: Uint8Array;
  readonly contactDigest: Uint8Array;
  readonly contactLast4: string;
  readonly studentName: string;
  readonly message: string;
  readonly title: string | null;
  readonly classification: SmsPayloadClassification;
}

interface BatchAggregateRow {
  readonly batch_id: string;
  readonly source: string;
  readonly template_id: string | null;
  readonly template_name: string | null;
  readonly audience: string | null;
  readonly seminar_session_id: string | null;
  readonly branch: string;
  readonly actor_subject: string | null;
  readonly recipient_count: number;
  readonly success_count: number;
  readonly failure_count: number;
  readonly pending_count: number;
  readonly processing_count: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface SmsTemplateView {
  readonly templateId: string;
  readonly key: string;
  readonly name: string;
  readonly purpose: string;
  readonly title: string | null;
  readonly body: string;
  readonly active: boolean;
  readonly isDefault: boolean;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SmsTemplateRemovalResult {
  readonly templateId: string;
  readonly disposition: "DELETED" | "ARCHIVED";
  readonly usageCount: number;
  readonly archivedTemplate: SmsTemplateView | null;
}

const TEMPLATE_LOCK_NAME = "npr:sms-templates";
const INQUIRY_PHONE: Readonly<Record<SmsBranch, string>> = {
  SONGPA: "02-413-2652",
  WIRYE: "02-425-2652",
  GWANGJIN: "02-422-2652",
};
const TERMINAL_FAILURE_STATUSES = [
  "BLOCKED_DISABLED", "BLOCKED_ALLOWLIST", "FAILED_PERMANENT", "DELIVERY_UNKNOWN", "DEAD",
] as const;

/** 문자 템플릿 편집 정책 조회와 관리자 템플릿·발송 업무를 처리한다. */
@Injectable()
export class SmsAdminService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: SmsOutboxService,
    private readonly policy: SmsMessagePolicy,
    private readonly renderer: SmsTemplateRenderer,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /** API 프로세스의 문자 설정 상태를 반환한다. provider 발송은 워커가 맡으므로 adapterAvailable은 false다. */
  public readiness() {
    const sendersConfigured = Object.values(this.environment.smsSenders).every((value) => value !== undefined);
    return {
      enabled: this.environment.smsEnabled,
      configured: this.environment.aligoIdentifier !== undefined && this.environment.aligoKey !== undefined && sendersConfigured,
      allowlistEnabled: this.environment.smsRecipientAllowlistEnabled,
      testMode: this.environment.smsAligoTestMode,
      adapterAvailable: false,
      workerOnly: true,
    };
  }

  /**
   * {@link SMS_TEMPLATE_EDITING_POLICY}에서 편집 가능한 다섯 용도의 공개 정책을 반환한다.
   * FIRST_CHECK_IN은 저장·렌더링 허용을 유지하면서 화면 목록에는 포함하지 않는다.
   */
  public templatePolicy(): SmsTemplatePolicyView {
    return SMS_TEMPLATE_EDITING_POLICY;
  }

  /** 활성 템플릿을 먼저 정렬한 전체 목록을 반환한다. 보관된 행도 관리자 조회에는 포함한다. */
  public async listTemplates() {
    const rows = await this.prisma.smsTemplate.findMany({ orderBy: [{ active: "desc" }, { key: "asc" }] });
    return { items: rows.map((row) => this.mapTemplate(row)) };
  }

  /** 공개 ID로 템플릿을 조회하고 없으면 SMS_TEMPLATE_NOT_FOUND(404)를 던진다. */
  public async getTemplate(templateId: string) {
    const row = await this.prisma.smsTemplate.findUnique({ where: { publicId: templateId } });
    if (row === null) this.fail(404, "SMS_TEMPLATE_NOT_FOUND");
    return this.mapTemplate(row);
  }

  /**
   * 본문·제목·용도 변수를 검증한 뒤 멱등 키와 전체 입력으로 템플릿을 생성한다.
   * {@link lockTemplates}로 기본 지정과 키 중복 확인을 직렬화하며, 생성과 멱등 응답은 함께 커밋된다.
   */
  public createTemplate(
    input: { key: string; name: string; purpose: SmsSource; title?: string; body: string; isDefault?: boolean },
    actor: string,
    key: string,
  ) {
    const classification = this.validateTemplatePayload(input.body, input.title ?? null, input.purpose);
    return this.idempotency.execute("SMS_TEMPLATE_CREATE", key, input, async (transaction) => {
      await this.lockTemplates(transaction);
      const duplicate = await transaction.smsTemplate.findUnique({ where: { key: input.key }, select: { id: true } });
      if (duplicate !== null) this.fail(409, "SMS_TEMPLATE_KEY_CONFLICT");
      const defaultCount = await transaction.smsTemplate.count({
        where: { purpose: input.purpose, active: true, isDefault: true },
      });
      const isDefault = input.isDefault === true || defaultCount === 0;
      if (input.isDefault === true) {
        await transaction.smsTemplate.updateMany({
          where: { purpose: input.purpose, isDefault: true },
          data: { isDefault: false, version: { increment: 1 }, updatedBy: actor },
        });
      }
      const row = await transaction.smsTemplate.create({ data: {
        key: input.key,
        name: input.name,
        purpose: input.purpose,
        title: input.title ?? null,
        body: input.body,
        isDefault,
        createdBy: actor,
        updatedBy: actor,
      } });
      return { ...this.mapTemplate(row), classification };
    }, 201);
  }

  /**
   * 버전이 일치할 때만 변경을 커밋한다. 용도별 기본 템플릿 교체도 {@link lockTemplates} 아래 처리한다.
   * 현재 기본을 다른 기본 지정 없이 내리면 409, 비활성 행을 기본으로 지정하면 409를 반환한다.
   */
  public updateTemplate(
    templateId: string,
    input: { name?: string; purpose?: SmsSource; title?: string | null; body?: string; active?: boolean; isDefault?: boolean; version: string },
    actor: string,
    key: string,
  ) {
    return this.idempotency.execute("SMS_TEMPLATE_UPDATE", key, { templateId, ...input }, async (transaction) => {
      await this.lockTemplates(transaction);
      const current = await transaction.smsTemplate.findUnique({ where: { publicId: templateId } });
      if (current === null) this.fail(404, "SMS_TEMPLATE_NOT_FOUND");
      if (current.version.toString() !== input.version) this.fail(409, "SMS_TEMPLATE_VERSION_CONFLICT");
      const nextBody = input.body ?? current.body;
      const nextTitle = input.title === undefined ? current.title : input.title;
      const nextPurpose = input.purpose ?? current.purpose;
      this.validateTemplatePayload(nextBody, nextTitle, nextPurpose as SmsTemplatePurpose);
      const nextActive = input.active ?? current.active;
      if (current.isDefault && (
        nextPurpose !== current.purpose || !nextActive || input.isDefault === false
      )) {
        this.fail(409, "SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED");
      }
      let nextDefault = input.isDefault ?? current.isDefault;
      if (input.isDefault === true) {
        if (!nextActive) this.fail(409, "SMS_DEFAULT_TEMPLATE_MUST_BE_ACTIVE");
        await transaction.smsTemplate.updateMany({
          where: { purpose: nextPurpose, isDefault: true, NOT: { id: current.id } },
          data: { isDefault: false, version: { increment: 1 }, updatedBy: actor },
        });
        nextDefault = true;
      } else if (nextActive && !nextDefault) {
        const defaultCount = await transaction.smsTemplate.count({
          where: { purpose: nextPurpose, active: true, isDefault: true, NOT: { id: current.id } },
        });
        if (defaultCount === 0) nextDefault = true;
      }
      const row = await transaction.smsTemplate.update({
        where: { id: current.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.body === undefined ? {} : { body: input.body }),
          ...(input.active === undefined ? {} : { active: input.active }),
          isDefault: nextDefault,
          version: { increment: 1 },
          updatedBy: actor,
        },
      });
      return this.mapTemplate(row);
    });
  }

  /**
   * 버전·기본 지정 여부·사용 이력을 템플릿 CRUD가 공유하는 잠금 아래 확인한다.
   * 발송 아웃박스 생성은 이 잠금을 쓰지 않으므로 사용 이력 조회와 발송의 직렬화까지 보장하지 않는다.
   * 사용 이력이 없으면 삭제하고 있으면 비활성 보관하며, 결과와 멱등 기록을 함께 커밋한다.
   */
  public removeTemplate(
    templateId: string,
    version: string,
    actor: string,
    key: string,
  ): Promise<SmsTemplateRemovalResult> {
    if (!/^\d{1,20}$/u.test(version)) this.fail(400, "SMS_TEMPLATE_VERSION_REQUIRED");
    return this.idempotency.execute(
      "SMS_TEMPLATE_REMOVE",
      key,
      { templateId, version },
      async (transaction) => {
        // Every create, update, default reassignment, and removal takes the same
        // transaction-scoped lock. This makes the default check, history check,
        // and delete/archive decision one serializable template lifecycle step.
        await this.lockTemplates(transaction);
        const current = await transaction.smsTemplate.findUnique({ where: { publicId: templateId } });
        if (current === null) this.fail(404, "SMS_TEMPLATE_NOT_FOUND");
        if (current.version.toString() !== version) this.fail(409, "SMS_TEMPLATE_VERSION_CONFLICT");
        if (current.isDefault) this.fail(409, "SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED");

        const usageCount = await transaction.smsOutbox.count({
          where: { safeMetadata: { path: ["templateId"], equals: current.publicId } },
        });
        if (usageCount === 0) {
          await transaction.smsTemplate.delete({ where: { id: current.id } });
          return {
            templateId: current.publicId,
            disposition: "DELETED" as const,
            usageCount,
            archivedTemplate: null,
          };
        }

        const archived = current.active
          ? await transaction.smsTemplate.update({
            where: { id: current.id },
            data: {
              active: false,
              isDefault: false,
              version: { increment: 1 },
              updatedBy: actor,
            },
          })
          : current;
        return {
          templateId: archived.publicId,
          disposition: "ARCHIVED" as const,
          usageCount,
          archivedTemplate: this.mapTemplate(archived),
        };
      },
    );
  }

  /**
   * 대상별 수신 인원 — 발송 전에 "누구에게 몇 명 나가는지"를 화면이 미리 보여 주기 위한 읽기 전용 집계.
   *
   * ★ 근사하지 않는다. 실제 발송이 쓰는 targets() 를 대상마다 그대로 돌려 그 결과 수를 센다.
   *   예약 상태만으로 세면 실제와 어긋난다 — 취소 대상은 마지막 해제 시각으로 학생을 다시
   *   추리고, 그 결과 대상이 0명이 되는 예약이 있기 때문이다. 발송 직전에 보여 준 숫자와
   *   실제로 나간 수가 다르면 그 숫자는 없느니만 못하다.
   *
   * preview() 와 달리 previewToken 을 만들지 않고 본문도 렌더하지 않는다 — 화면이 캠퍼스·회차를
   * 바꿀 때마다 부르는 값이라, 발송 자격을 남기면 안 된다.
   */
  public async audienceCounts(input: { branch: SmsBranch; seminarSessionId: string }) {
    const audiences: SmsAudience[] = [
      "BOOKED_FAMILIES",
      "RESERVED_FAMILIES",
      "CHECKED_IN_FAMILIES",
      "CANCELLED_FAMILIES",
      "TEST_ACCOUNTS",
    ];
    const counted = await Promise.all(audiences.map(async (audience) => {
      const { rows } = await this.targets({ ...input, audience });
      return [audience, rows.length] as const;
    }));
    return {
      branch: input.branch,
      seminarSessionId: input.seminarSessionId,
      counts: counted.map(([audience, recipientCount]) => ({ audience, recipientCount })),
    };
  }

  /** 실제 대상 선택·변수 치환·문자 분류를 계산하고 발송 검증용 previewToken과 최대 10개 표본을 돌려준다. */
  public async preview(input: TargetRequest) {
    const prepared = await this.prepare(input);
    const maximumMessageBytes = this.maximum(prepared.rows.map((row) => row.classification.messageBytes));
    const maximumTitleBytes = this.maximum(prepared.rows
      .map((row) => row.classification.titleBytes)
      .filter((value): value is number => value !== null));
    const samples = prepared.rows.slice(0, 10).map((row) => ({
      familyBookingId: row.publicId,
      maskedRecipient: this.mask(row.contactLast4),
      message: row.message,
      title: row.title,
      messageType: row.classification.messageType,
      messageBytes: row.classification.messageBytes,
      titleBytes: row.classification.titleBytes,
    }));
    return {
      branch: input.branch,
      seminarSessionId: input.seminarSessionId,
      audience: input.audience,
      recipientCount: prepared.rows.length,
      previewToken: prepared.previewToken,
      maskedRecipients: samples.map((sample) => sample.maskedRecipient),
      templateId: prepared.payload.templateId,
      templateName: prepared.payload.templateName,
      messageTemplate: prepared.payload.messageTemplate,
      titleTemplate: prepared.payload.titleTemplate,
      samples,
      maximumMessageType: prepared.rows.length === 0
        ? null
        : prepared.rows.some((row) => row.classification.messageType === "LMS") ? "LMS" : "SMS",
      maximumMessageBytes,
      maximumTitleBytes,
    };
  }

  /**
   * 예약은 아웃박스 행의 next_attempt_at으로 표현된다. 같은 트랜잭션에서 대상과 previewToken을
   * 다시 계산해 일치할 때만 암호화 아웃박스를 기록한다. 외부 문자 전송은 워커가 맡는다.
   * @param input.scheduledAt 예약 발송 시각(ISO). 생략하면 즉시 발송이다.
   */
  public enqueue(
    input: TargetRequest & { previewToken: string; scheduledAt?: string },
    actor: string,
    key: string,
    source: "ADMIN_GROUP",
  ) {
    return this.idempotency.execute(`SMS_${source}_ENQUEUE`, key, input, async (transaction) => {
      const prepared = await this.prepare(input, transaction);
      if (prepared.previewToken !== input.previewToken) this.fail(409, "SMS_PREVIEW_TOKEN_CHANGED");
      const notBefore = this.scheduledSendTime(input.scheduledAt);
      const batchId = randomUUID();
      for (const row of prepared.rows) {
        await this.outbox.enqueue(transaction, {
          eventKey: `${source}:${batchId}:${row.publicId}`,
          source,
          branch: input.branch,
          seminarSessionPublicId: input.seminarSessionId,
          familyBookingPublicId: row.publicId,
          recipientCiphertext: row.contactCiphertext,
          recipientDigest: row.contactDigest,
          recipientLast4: row.contactLast4,
          message: row.message,
          title: row.title,
          actorSubject: actor,
          notBefore,
          safeMetadata: {
            batchId,
            scheduledAt: notBefore === null ? null : notBefore.toISOString(),
            templateId: prepared.payload.templateId,
            templateName: prepared.payload.templateName,
            templateVersion: prepared.payload.templateVersion,
            templatePurpose: prepared.payload.purpose,
            audience: input.audience,
            seminarSessionId: input.seminarSessionId,
            branch: input.branch,
          },
        });
      }
      return {
        batchId,
        queuedCount: prepared.rows.length,
        previewToken: prepared.previewToken,
        status: "QUEUED",
        source,
        templateId: prepared.payload.templateId,
        templateName: prepared.payload.templateName,
      };
    }, 202);
  }

  /** 조건에 맞는 개별 아웃박스와 배치 집계를 조회한다. 배치 건수를 개별 행과 다시 합산하지 않는다. */
  public async history(filters: {
    status?: string;
    source?: string;
    branch?: string;
    seminarSessionId?: string;
    batchId?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const [rows, batches] = await Promise.all([
      this.prisma.smsOutbox.findMany({
        where: {
          ...(filters.status === undefined ? {} : { status: filters.status }),
          ...(filters.source === undefined ? {} : { source: filters.source }),
          ...(filters.branch === undefined ? {} : { branchCode: filters.branch }),
          ...(filters.seminarSessionId === undefined ? {} : { seminarSessionPublicId: filters.seminarSessionId }),
          ...(filters.batchId === undefined ? {} : {
            safeMetadata: { path: ["batchId"], equals: filters.batchId },
          }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
      this.batchHistory(filters, limit),
    ]);
    return { batches, items: rows.map((row) => this.mapOutbox(row)) };
  }

  /** 발송 행과 시도 기록을 조회한다. 없으면 SMS_MESSAGE_NOT_FOUND(404)를 던지고 수신 번호는 마스킹한다. */
  public async detail(messageId: string) {
    const row = await this.prisma.smsOutbox.findUnique({
      where: { publicId: messageId },
      include: { attempts: { orderBy: { attemptNo: "asc" } } },
    });
    if (row === null) this.fail(404, "SMS_MESSAGE_NOT_FOUND");
    return {
      ...this.mapOutbox(row),
      attempts: row.attempts.map((attempt) => ({
        eventId: attempt.eventId,
        attemptNo: attempt.attemptNo,
        result: attempt.result,
        providerResultCode: attempt.providerResultCode,
        providerMessageId: attempt.providerMessageId,
        errorCode: attempt.errorCode,
        occurredAt: attempt.occurredAt,
      })),
    };
  }

  /** 대상별 치환 본문·문자 종류와 예약/템플릿 버전을 묶어 프리뷰 토큰을 만든다. 저장·전송은 하지 않는다. */
  private async prepare(input: TargetRequest, transaction: Prisma.TransactionClient | PrismaService = this.prisma) {
    const payload = await this.payload(input, transaction);
    this.validateTemplatePayload(payload.messageTemplate, payload.titleTemplate, payload.purpose ?? undefined);
    const targetSet = await this.targets(input, transaction);
    const rows: PreparedTarget[] = targetSet.rows.map((row) => {
      const context = {
        studentName: row.studentName,
        seminarTitle: targetSet.session.seminarTitle,
        sessionDateTime: this.formatSessionDateTime(targetSet.session.startsAt),
        place: targetSet.session.place,
        bookingUrl: this.bookingUrl(row.publicId),
        inquiryPhone: INQUIRY_PHONE[input.branch],
      };
      const message = this.renderer.render(payload.messageTemplate, context, "message", payload.purpose ?? undefined);
      const title = payload.titleTemplate === null ? null : this.renderer.render(payload.titleTemplate, context, "title", payload.purpose ?? undefined);
      return { ...row, message, title, classification: this.policy.classify(message, title) };
    });
    const digest = createHash("sha256");
    digest.update(JSON.stringify({
      branch: input.branch,
      seminarSessionId: input.seminarSessionId,
      audience: input.audience,
      sessionVersion: targetSet.session.version.toString(),
      seminarTitle: targetSet.session.seminarTitle,
      startsAt: targetSet.session.startsAt.toISOString(),
      place: targetSet.session.place,
      messageTemplate: payload.messageTemplate,
      titleTemplate: payload.titleTemplate,
      templateId: payload.templateId,
      templateName: payload.templateName,
      templateVersion: payload.templateVersion,
    }));
    for (const row of rows) {
      digest.update("\n");
      digest.update(JSON.stringify({
        familyBookingId: row.publicId,
        version: row.version.toString(),
        contactDigest: Buffer.from(row.contactDigest).toString("base64url"),
        studentName: row.studentName,
        message: row.message,
        title: row.title,
        messageType: row.classification.messageType,
        messageBytes: row.classification.messageBytes,
        titleBytes: row.classification.titleBytes,
      }));
    }
    return { payload, rows, previewToken: digest.digest("base64url") };
  }

  /** 템플릿 ID 또는 직접 입력 중 하나를 확정한다. 템플릿은 활성 행만 허용하며 혼합 입력은 400이다. */
  private async payload(
    input: TargetRequest,
    transaction: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ResolvedPayload> {
    if (input.templateId !== undefined) {
      if (input.message !== undefined || input.title !== undefined) this.fail(400, "SMS_CONTENT_SOURCE_INVALID");
      const template = await transaction.smsTemplate.findFirst({
        where: { publicId: input.templateId, active: true },
      });
      if (template === null) this.fail(404, "SMS_TEMPLATE_NOT_FOUND");
      return {
        messageTemplate: template.body,
        titleTemplate: template.title,
        templateId: template.publicId,
        templateName: template.name,
        templateVersion: template.version.toString(),
        purpose: template.purpose as SmsTemplatePurpose,
      };
    }
    if (input.message === undefined) this.fail(400, "SMS_CONTENT_SOURCE_INVALID");
    return {
      messageTemplate: input.message,
      titleTemplate: input.title ?? null,
      templateId: null,
      templateName: "직접 입력",
      templateVersion: null,
      purpose: null,
    };
  }

  /**
   * 예약 발송을 취소한다 — 아직 나가지 않은 것만.
   *
   * 예약 발송에 취소가 없으면, 잘못 잡은 600명짜리 발송을 멈출 방법이 없다. 그게 이 기능이
   * 존재하는 이유다.
   *
   * **PENDING 만 취소한다.** CLAIMED·SENDING 은 워커가 이미 손에 쥔 것이라 여기서 상태를
   * 바꾸면 lease 불변식이 깨지고, SENT 는 이미 사람에게 도착했다 — 보낸 문자를 취소할 수는
   * 없으므로 그런 척하지 않는다. 그래서 몇 건이 취소됐고 몇 건이 이미 손을 떠났는지 함께
   * 돌려준다: 운영자가 "다 막았다"고 오해하면 안 된다.
   */
  public async cancelScheduledBatch(batchId: string, actor: string, key: string) {
    return this.idempotency.execute("SMS_BATCH_CANCEL", key, { batchId }, async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ status: string; count: bigint }>>`
        select status,count(*)::bigint count
          from sms_outbox
         where safe_metadata->>'batchId' = ${batchId}
         group by status`;
      if (rows.length === 0) this.fail(404, "SMS_BATCH_NOT_FOUND");

      const cancelled = await transaction.$executeRaw`
        update sms_outbox
           set status='CANCELLED',
               last_error_code='ADMIN_CANCELLED_BEFORE_SEND',
               updated_at=now()
         where safe_metadata->>'batchId' = ${batchId}
           and status='PENDING'`;

      const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
      const alreadyLeft = rows
        .filter((row) => row.status !== "PENDING")
        .reduce((sum, row) => sum + Number(row.count), 0);
      return {
        batchId,
        cancelledCount: cancelled,
        alreadyLeftCount: alreadyLeft,
        totalCount: total,
        actorSubject: actor,
      };
    });
  }

  /**
   * 예약 발송 시각 검증. 없으면 null(즉시 발송).
   *
   * 과거 시각은 거절한다 — "예약"이라고 눌렀는데 즉시 나가면 운영자가 의도한 것과 정반대다.
   * 지금 보내려면 예약을 비우면 된다. 시계 오차를 감안해 1분 여유만 준다.
   *
   * 상한도 둔다. 오타 하나(2026 → 2036)로 문자가 10년 뒤에 나가는 큐를 남기지 않는다.
   */
  private scheduledSendTime(value: string | undefined): Date | null {
    if (value === undefined) return null;
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) this.fail(400, "SMS_SCHEDULED_AT_INVALID");
    const now = Date.now();
    if (at.getTime() < now - 60_000) this.fail(409, "SMS_SCHEDULED_AT_IN_PAST");
    if (at.getTime() > now + 180 * 86_400_000) this.fail(409, "SMS_SCHEDULED_AT_TOO_FAR");
    return at;
  }

  /** 지점·회차·대상 상태와 테스트 구분으로 실제 수신 가족을 고른다. 회차가 없거나 학생명이 비면 오류다. */
  private async targets(input: TargetRequest, transaction: Prisma.TransactionClient | PrismaService = this.prisma) {
    const session = await transaction.seminarSession.findUnique({
      where: { publicId: input.seminarSessionId },
      select: {
        id: true,
        version: true,
        startsAt: true,
        place: true,
        seminar: { select: { title: true } },
      },
    });
    if (session === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
    const statuses = this.audienceStatuses(input.audience);
    const bookings = await transaction.familyBooking.findMany({
      where: {
        sessionId: session.id,
        status: { in: statuses },
        // 실제 발송이 테스트 행에 닿아서도, 테스트 발송이 실제 가족에게 닿아서도 안 된다.
        isTest: input.audience === "TEST_ACCOUNTS",
        students: { some: input.audience === "CANCELLED_FAMILIES"
          ? { branchCodeAtBooking: input.branch, releasedAt: { not: null } }
          : { branchCodeAtBooking: input.branch, active: true } },
      },
      select: {
        publicId: true,
        version: true,
        contactCiphertext: true,
        contactDigest: true,
        contactLast4: true,
        students: {
          select: {
            id: true,
            active: true,
            releasedAt: true,
            branchCodeAtBooking: true,
            studentNameSnapshot: true,
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: [{ publicId: "asc" }],
    });
    const rows = bookings.flatMap((booking) => {
      const relevant = this.relevantStudents(input.audience, booking.students, input.branch);
      if (relevant.length === 0) return [];
      const studentName = [...new Set(relevant.map((student) => student.studentNameSnapshot.trim()).filter(Boolean))].join(", ");
      if (studentName.length === 0) this.fail(409, "SMS_STUDENT_NAME_MISSING");
      return [{
        publicId: booking.publicId,
        version: booking.version,
        contactCiphertext: booking.contactCiphertext,
        contactDigest: booking.contactDigest,
        contactLast4: booking.contactLast4,
        studentName,
      }];
    });
    return {
      rows,
      session: {
        version: session.version,
        seminarTitle: session.seminar.title,
        startsAt: session.startsAt,
        place: session.place,
      },
    };
  }

  /** 취소 대상은 마지막 해제 시각의 학생만, 나머지는 현재 활성 학생만 지점별로 선택한다. */
  private relevantStudents(
    audience: SmsAudience,
    students: readonly {
      id: bigint;
      active: boolean;
      releasedAt: Date | null;
      branchCodeAtBooking: string;
      studentNameSnapshot: string;
    }[],
    branch: SmsBranch,
  ) {
    if (audience !== "CANCELLED_FAMILIES") {
      return students.filter((student) => student.active && student.branchCodeAtBooking === branch);
    }
    const latestReleasedAt = students.reduce<number | null>((latest, student) => {
      const releasedAt = student.releasedAt?.getTime() ?? null;
      return releasedAt === null ? latest : Math.max(latest ?? releasedAt, releasedAt);
    }, null);
    if (latestReleasedAt === null) return [];
    return students.filter((student) => student.branchCodeAtBooking === branch
      && student.releasedAt?.getTime() === latestReleasedAt);
  }

  /** 대상 구분을 예약 상태 집합으로 바꾼다. 테스트 예약은 실제 가족과 별도 조건으로 제한된다. */
  private audienceStatuses(audience: SmsAudience): string[] {
    switch (audience) {
      case "BOOKED_FAMILIES": return ["RESERVED", "CHECKED_IN"];
      case "RESERVED_FAMILIES": return ["RESERVED"];
      case "CHECKED_IN_FAMILIES": return ["CHECKED_IN"];
      case "CANCELLED_FAMILIES": return ["CANCELLED"];
      // 테스트 예약은 취소 말고 어떤 상태든 대상이다 — 재테스트 도중 어느 상태에 있든
      // 발송을 확인할 수 있어야 한다.
      case "TEST_ACCOUNTS": return ["RESERVED", "CHECKED_IN", "NO_SHOW"];
    }
  }

  /** 아웃박스를 배치 ID로 한 번만 집계해 수신·성공·실패·대기 수를 반환한다. */
  private async batchHistory(
    filters: { status?: string; source?: string; branch?: string; seminarSessionId?: string; batchId?: string },
    limit: number,
  ) {
    const source = filters.source ?? null;
    const branch = filters.branch ?? null;
    const seminarSessionId = filters.seminarSessionId ?? null;
    const batchId = filters.batchId ?? null;
    const status = filters.status ?? null;
    const rows = await this.prisma.$queryRaw<BatchAggregateRow[]>`
      select
        safe_metadata->>'batchId' as batch_id,
        max(source) as source,
        max(safe_metadata->>'templateId') as template_id,
        max(safe_metadata->>'templateName') as template_name,
        max(safe_metadata->>'audience') as audience,
        max(seminar_session_public_id::text) as seminar_session_id,
        max(branch_code) as branch,
        max(actor_subject) as actor_subject,
        count(*)::integer as recipient_count,
        count(*) filter (where status='SENT')::integer as success_count,
        count(*) filter (where status=any(${[...TERMINAL_FAILURE_STATUSES]}::text[]))::integer as failure_count,
        count(*) filter (where status in ('PENDING','CLAIMED','SENDING'))::integer as pending_count,
        count(*) filter (where status in ('CLAIMED','SENDING'))::integer as processing_count,
        min(created_at) as created_at,
        max(updated_at) as updated_at
      from sms_outbox
      where safe_metadata ? 'batchId'
        and (${source}::text is null or source=${source})
        and (${branch}::text is null or branch_code=${branch})
        and (${seminarSessionId}::uuid is null or seminar_session_public_id=${seminarSessionId}::uuid)
        and (${batchId}::uuid is null or safe_metadata->>'batchId'=${batchId})
      group by safe_metadata->>'batchId'
      having (${status}::text is null or bool_or(status=${status}))
      order by min(created_at) desc, max(id) desc
      limit ${limit}`;
    return rows.map((row) => ({
      batchId: row.batch_id,
      source: row.source,
      templateId: row.template_id,
      templateName: row.template_name ?? "직접 입력",
      audience: row.audience,
      seminarSessionId: row.seminar_session_id,
      branch: row.branch,
      recipientCount: row.recipient_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      pendingCount: row.pending_count,
      status: this.batchStatus(row),
      actorSubject: row.actor_subject,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /** 처리 중 행을 우선해 배치 상태를 고른다. 미확정·차단 결과는 성공으로 세지 않는다. */
  private batchStatus(row: BatchAggregateRow): "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED" {
    if (row.pending_count > 0) return row.processing_count > 0 ? "PROCESSING" : "QUEUED";
    if (row.failure_count === 0) return "COMPLETED";
    if (row.success_count === 0) return "FAILED";
    return "PARTIAL";
  }

  /** 용도별 변수와 메시지 길이·문자 표현 가능성을 검증한다. 위반 시 렌더러/정책 오류를 전달한다. */
  private validateTemplatePayload(body: string, title: string | null, purpose?: SmsTemplatePurpose): SmsPayloadClassification {
    this.renderer.validate(body, "message", purpose);
    if (title !== null) this.renderer.validate(title, "title", purpose);
    const bodyClassification = this.policy.classify(body);
    const titleBytes = title === null || title.length === 0
      ? null
      : this.policy.classify("가".repeat(46), title).titleBytes;
    return { ...bodyClassification, titleBytes };
  }

  private bookingUrl(familyBookingId: string): string {
    if (this.environment.publicBaseUrl === undefined) return "";
    const base = new URL(this.environment.publicBaseUrl);
    return new URL(`/booking/${encodeURIComponent(familyBookingId)}`, base.origin).toString();
  }

  private formatSessionDateTime(value: Date): string {
    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
    return `${part("year")}.${part("month")}.${part("day")}(${part("weekday")}) ${part("hour")}:${part("minute")}`;
  }

  /** 생성·수정·삭제가 공유하는 트랜잭션 단위 advisory lock으로 기본 템플릿 불변식을 직렬화한다. */
  private async lockTemplates(transaction: Prisma.TransactionClient): Promise<void> {
    await transaction.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${TEMPLATE_LOCK_NAME}::text, 0::bigint))`;
  }

  private maximum(values: readonly number[]): number | null {
    return values.length === 0 ? null : Math.max(...values);
  }

  private mapTemplate(row: {
    publicId: string;
    key: string;
    name: string;
    purpose: string;
    title: string | null;
    body: string;
    active: boolean;
    isDefault: boolean;
    version: bigint;
    createdAt: Date;
    updatedAt: Date;
  }): SmsTemplateView {
    return {
      templateId: row.publicId,
      key: row.key,
      name: row.name,
      purpose: row.purpose,
      title: row.title,
      body: row.body,
      active: row.active,
      isDefault: row.isDefault,
      version: row.version.toString(),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapOutbox(row: {
    publicId: string;
    source: string;
    branchCode: string;
    seminarSessionPublicId: string | null;
    familyBookingPublicId: string | null;
    recipientLast4: string;
    messageType: string;
    messageBytes: number;
    status: string;
    attemptCount: number;
    providerMessageId: string | null;
    providerResultCode: number | null;
    lastErrorCode: string | null;
    actorSubject: string | null;
    safeMetadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const metadata = this.safeMetadata(row.safeMetadata);
    return {
      messageId: row.publicId,
      batchId: this.metadataString(metadata, "batchId"),
      source: row.source,
      branch: row.branchCode,
      seminarSessionId: row.seminarSessionPublicId,
      familyBookingId: row.familyBookingPublicId,
      templateId: this.metadataString(metadata, "templateId"),
      templateName: this.metadataString(metadata, "templateName"),
      audience: this.metadataString(metadata, "audience"),
      maskedRecipient: this.mask(row.recipientLast4),
      messageType: row.messageType,
      messageBytes: row.messageBytes,
      status: row.status,
      attemptCount: row.attemptCount,
      providerMessageId: row.providerMessageId,
      providerResultCode: row.providerResultCode,
      lastErrorCode: row.lastErrorCode,
      actorSubject: row.actorSubject,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private safeMetadata(value: Prisma.JsonValue): Readonly<Record<string, Prisma.JsonValue | undefined>> {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  private metadataString(metadata: Readonly<Record<string, Prisma.JsonValue | undefined>>, key: string): string | null {
    const value = metadata[key];
    return typeof value === "string" ? value : null;
  }

  private mask(last4: string): string {
    return `***-****-${last4}`;
  }

  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The SMS operation could not be completed.");
  }
}
