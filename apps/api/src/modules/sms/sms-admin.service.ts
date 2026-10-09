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

/**
 * 관리자 발송 대상 구분
 *
 * - BOOKED_FAMILIES: 예약·체크인 가족
 * - RESERVED_FAMILIES: 체크인 전 예약 가족
 * - CHECKED_IN_FAMILIES: 체크인한 가족
 * - CANCELLED_FAMILIES: 취소한 가족. 마지막으로 해제된 학생 기준
 * - TEST_ACCOUNTS: 테스트 예약만. 실제 가족에게 닿지 않고 발송 경로를 확인하기 위한 대상
 */
export type SmsAudience =
  | "BOOKED_FAMILIES"
  | "RESERVED_FAMILIES"
  | "CHECKED_IN_FAMILIES"
  | "CANCELLED_FAMILIES"
  | "TEST_ACCOUNTS";

/**
 * 발송 대상·내용 요청
 */
interface TargetRequest {
  /**
   * 지점
   */
  readonly branch: SmsBranch;

  /**
   * 회차 공개 ID
   */
  readonly seminarSessionId: string;

  /**
   * 대상 구분
   */
  readonly audience: SmsAudience;

  /**
   * 템플릿 ID. 직접 입력과 함께 쓸 수 없음
   */
  readonly templateId?: string;

  /**
   * 직접 입력 본문
   */
  readonly message?: string;

  /**
   * 직접 입력 LMS 제목
   */
  readonly title?: string;
}

/**
 * 템플릿 또는 직접 입력으로 확정한 발송 내용
 */
interface ResolvedPayload {
  /**
   * 치환 전 본문
   */
  readonly messageTemplate: string;

  /**
   * 치환 전 제목. 없으면 null
   */
  readonly titleTemplate: string | null;

  /**
   * 템플릿 ID. 직접 입력이면 null
   */
  readonly templateId: string | null;

  /**
   * 템플릿 이름. 직접 입력이면 "직접 입력"
   */
  readonly templateName: string;

  /**
   * 템플릿 버전. 직접 입력이면 null
   */
  readonly templateVersion: string | null;

  /**
   * 템플릿 용도. 직접 입력이면 null이고 전체 변수 허용
   */
  readonly purpose: SmsTemplatePurpose | null;
}

/**
 * 치환·분류까지 마친 수신 대상 1건
 */
interface PreparedTarget {
  /**
   * 예약 공개 ID
   */
  readonly publicId: string;

  /**
   * 예약 버전. previewToken 계산에 포함
   */
  readonly version: bigint;

  /**
   * 연락처 암호문
   */
  readonly contactCiphertext: Uint8Array;

  /**
   * 연락처 다이제스트
   */
  readonly contactDigest: Uint8Array;

  /**
   * 연락처 끝 4자리
   */
  readonly contactLast4: string;

  /**
   * 대상 학생 이름. 여러 명이면 쉼표로 연결
   */
  readonly studentName: string;

  /**
   * 치환된 본문
   */
  readonly message: string;

  /**
   * 치환된 제목
   */
  readonly title: string | null;

  /**
   * 문자 유형·바이트 수
   */
  readonly classification: SmsPayloadClassification;
}

/**
 * 배치별 발송 집계 행
 */
interface BatchAggregateRow {
  /**
   * 배치 ID
   */
  readonly batch_id: string;

  /**
   * 발송 원인
   */
  readonly source: string;

  /**
   * 템플릿 ID
   */
  readonly template_id: string | null;

  /**
   * 템플릿 이름
   */
  readonly template_name: string | null;

  /**
   * 대상 구분
   */
  readonly audience: string | null;

  /**
   * 회차 공개 ID
   */
  readonly seminar_session_id: string | null;

  /**
   * 지점
   */
  readonly branch: string;

  /**
   * 발송 요청 주체
   */
  readonly actor_subject: string | null;

  /**
   * 수신 건수
   */
  readonly recipient_count: number;

  /**
   * 발송 성공 건수
   */
  readonly success_count: number;

  /**
   * 최종 실패 건수. 차단·불명·소진 포함
   */
  readonly failure_count: number;

  /**
   * 대기·처리 중 건수
   */
  readonly pending_count: number;

  /**
   * 워커 처리 중 건수
   */
  readonly processing_count: number;

  /**
   * 최초 적재 시각
   */
  readonly created_at: Date;

  /**
   * 마지막 변경 시각
   */
  readonly updated_at: Date;
}

/**
 * 템플릿 응답
 */
export interface SmsTemplateView {
  /**
   * 템플릿 공개 ID
   */
  readonly templateId: string;

  /**
   * 템플릿 키
   */
  readonly key: string;

  /**
   * 표시 이름
   */
  readonly name: string;

  /**
   * 용도
   */
  readonly purpose: string;

  /**
   * LMS 제목
   */
  readonly title: string | null;

  /**
   * 본문
   */
  readonly body: string;

  /**
   * 활성 여부
   */
  readonly active: boolean;

  /**
   * 용도별 기본 템플릿 여부
   */
  readonly isDefault: boolean;

  /**
   * 낙관적 잠금 버전(숫자 문자열)
   */
  readonly version: string;

  /**
   * 생성 시각
   */
  readonly createdAt: Date;

  /**
   * 변경 시각
   */
  readonly updatedAt: Date;
}

/**
 * 템플릿 삭제 결과
 */
export interface SmsTemplateRemovalResult {
  /**
   * 템플릿 공개 ID
   */
  readonly templateId: string;

  /**
   * 처리 방식. 사용 이력 없으면 DELETED, 있으면 ARCHIVED
   */
  readonly disposition: "DELETED" | "ARCHIVED";

  /**
   * 발송 이력에서 사용된 횟수
   */
  readonly usageCount: number;

  /**
   * 보관된 템플릿. 삭제했으면 null
   */
  readonly archivedTemplate: SmsTemplateView | null;
}

/**
 * 템플릿 생성·변경·삭제 공용 advisory lock 이름
 */
const TEMPLATE_LOCK_NAME = "npr:sms-templates";

/**
 * 지점별 문의 전화번호. {문의전화} 치환 값
 */
const INQUIRY_PHONE: Readonly<Record<SmsBranch, string>> = {
  CAMPUS_A: "02-000-0001",
  CAMPUS_B: "02-000-0002",
  CAMPUS_C: "02-000-0003",
};

/**
 * 최종 실패로 집계하는 발송 상태
 */
const TERMINAL_FAILURE_STATUSES = [
  "BLOCKED_DISABLED", "BLOCKED_ALLOWLIST", "FAILED_PERMANENT", "DELIVERY_UNKNOWN", "DEAD",
] as const;

/**
 * 관리자 문자 템플릿 관리와 그룹 발송
 */
@Injectable()
export class SmsAdminService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 멱등 처리
     */
    private readonly idempotency: IdempotencyService,

    /**
     * 문자 대기열 적재
     */
    private readonly outbox: SmsOutboxService,

    /**
     * 문자 길이 정책
     */
    private readonly policy: SmsMessagePolicy,

    /**
     * 템플릿 렌더러
     */
    private readonly renderer: SmsTemplateRenderer,

    /**
     * 실행 환경. 발송 설정·공개 기준 URL
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * API 프로세스의 문자 설정 상태
   *
   * 실제 공급자 호출은 워커 전용이라 adapterAvailable은 항상 false
   */
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
   * 편집 가능한 다섯 용도의 공개 정책
   *
   * FIRST_CHECK_IN은 저장·렌더링은 허용하지만 화면 목록에는 포함하지 않음
   */
  public templatePolicy(): SmsTemplatePolicyView {
    return SMS_TEMPLATE_EDITING_POLICY;
  }

  /**
   * 템플릿 전체 목록. 활성 우선, 키 오름차순. 보관된 행 포함
   */
  public async listTemplates() {
    const rows = await this.prisma.smsTemplate.findMany({ orderBy: [{ active: "desc" }, { key: "asc" }] });
    return { items: rows.map((row) => this.mapTemplate(row)) };
  }

  /**
   * 공개 ID로 템플릿 조회
   *
   * @throws {DomainError} 404 SMS_TEMPLATE_NOT_FOUND
   */
  public async getTemplate(templateId: string) {
    const row = await this.prisma.smsTemplate.findUnique({ where: { publicId: templateId } });
    if (row === null) this.fail(404, "SMS_TEMPLATE_NOT_FOUND");
    return this.mapTemplate(row);
  }

  /**
   * 템플릿 생성
   *
   * 본문·제목·용도 변수를 먼저 검증한 뒤 멱등 실행
   * 템플릿 잠금 아래 키 중복 확인과 기본 지정을 직렬화하고, 생성과 멱등 응답을 함께 커밋
   * 기본으로 지정하면 같은 용도의 기존 기본을 해제. 용도의 첫 활성 기본이 없으면 자동으로 기본
   *
   * @throws {DomainError} 400 변수·길이 오류, 409 키 중복·멱등 키 재사용
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
   * 템플릿 변경
   *
   * 버전이 일치할 때만 반영. 용도별 기본 템플릿 교체도 템플릿 잠금 아래 처리
   * 현재 기본을 다른 기본 지정 없이 내리거나 용도를 바꾸거나 비활성화하면 409
   * 비활성 행을 기본으로 지정하면 409. 활성 기본이 없는 용도로 옮기면 자동으로 기본
   *
   * @throws {DomainError} 404 없음, 409 버전·기본 지정 충돌, 400 변수·길이 오류
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
      // 변경 후 값으로 변수·길이 재검증
      const nextBody = input.body ?? current.body;
      const nextTitle = input.title === undefined ? current.title : input.title;
      const nextPurpose = input.purpose ?? current.purpose;
      this.validateTemplatePayload(nextBody, nextTitle, nextPurpose as SmsTemplatePurpose);
      const nextActive = input.active ?? current.active;
      // 기본 템플릿은 다른 템플릿을 기본으로 지정하기 전까지 내릴 수 없음
      if (current.isDefault && (
        nextPurpose !== current.purpose || !nextActive || input.isDefault === false
      )) {
        this.fail(409, "SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED");
      }
      // 새 기본 지정 시 같은 용도의 기존 기본 해제, 활성 기본이 없는 용도면 자동 기본
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
   * 템플릿 삭제 또는 보관
   *
   * 버전·기본 지정 여부·사용 이력을 템플릿 CRUD 공용 잠금 아래 확인
   * 사용 이력이 없으면 삭제, 있으면 비활성 보관. 결과와 멱등 기록을 함께 커밋
   * 발송 대기열 적재는 이 잠금을 쓰지 않아 사용 이력 조회와 발송 사이의 직렬화까지는 보장하지 않음
   *
   * @param version If-Match로 받은 현재 버전
   * @throws {DomainError} 400 버전 형식 오류, 404 없음, 409 버전 충돌·기본 템플릿
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
        // 생성·변경·기본 재지정·삭제가 같은 트랜잭션 잠금을 사용
        // 기본 여부 확인, 이력 확인, 삭제·보관 결정을 하나의 직렬화된 수명 주기 단계로 만듦
        await this.lockTemplates(transaction);
        const current = await transaction.smsTemplate.findUnique({ where: { publicId: templateId } });
        if (current === null) this.fail(404, "SMS_TEMPLATE_NOT_FOUND");
        if (current.version.toString() !== version) this.fail(409, "SMS_TEMPLATE_VERSION_CONFLICT");
        if (current.isDefault) this.fail(409, "SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED");

        // 발송 기록 메타데이터의 templateId로 사용 이력 계산
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

        // 이력이 있으면 비활성 보관. 이미 비활성이면 그대로 응답
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
   * 대상별 수신 인원 집계. 발송 전 화면에 누구에게 몇 명 나가는지 보여 주는 읽기 전용 값
   *
   * 근사하지 않고 실제 발송이 쓰는 targets()를 대상마다 실행해 결과 수를 셈
   * 예약 상태만으로 세면 실제와 어긋남. 취소 대상은 마지막 해제 시각으로 학생을 다시 추려 0명이 되는 예약이 있음
   * preview()와 달리 previewToken·본문을 만들지 않음. 캠퍼스·회차 변경마다 호출되므로 발송 자격을 남기면 안 됨
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

  /**
   * 발송 미리보기
   *
   * 실제 대상 선택·변수 치환·문자 분류를 계산하고 발송 검증용 previewToken과 최대 10개 표본 반환
   * 저장·발송은 하지 않음
   */
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
   * 그룹 발송 등록
   *
   * 같은 트랜잭션에서 대상과 previewToken을 다시 계산해 미리보기와 같을 때만 암호화된 대기열 행 적재
   * 예약 발송은 대기열 행의 next_attempt_at으로 표현. 실제 전송은 워커가 수행
   *
   * @param input scheduledAt은 예약 발송 시각(ISO 8601). 생략하면 즉시 발송
   * @returns 배치 ID와 적재 건수
   * @throws {DomainError} 409 미리보기 이후 대상·내용 변경, 예약 시각 범위 밖
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
      // 배치 ID+예약 ID를 이벤트 키로 써서 같은 배치 안 중복 적재 방지
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

  /**
   * 발송 이력 조회
   *
   * 조건에 맞는 개별 행과 배치 집계를 함께 반환. 배치 건수를 개별 행에서 다시 합산하지 않음
   *
   * @param filters limit은 1~200, 기본 50
   */
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

  /**
   * 발송 1건과 시도 기록 조회. 수신 번호는 마스킹
   *
   * @throws {DomainError} 404 SMS_MESSAGE_NOT_FOUND
   */
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

  /**
   * 대상별 치환 본문·문자 유형을 계산하고 previewToken 생성
   *
   * 토큰은 지점·회차·대상·회차 버전·템플릿 버전과 대상별 예약 버전·연락처·치환 결과의 SHA-256
   * 저장·전송은 하지 않음
   *
   * @param transaction 발송 등록 시 같은 트랜잭션에서 재계산하기 위한 클라이언트
   */
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
    // 공통 정보와 대상별 결과를 순서대로 해시해 미리보기 이후 변경을 감지
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

  /**
   * 템플릿 ID 또는 직접 입력 중 하나로 발송 내용 확정
   *
   * 템플릿은 활성 행만 허용
   *
   * @throws {DomainError} 400 두 방식 혼합·둘 다 없음, 404 템플릿 없음
   */
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
   * 예약 발송 배치 취소. 아직 나가지 않은 건만 대상
   *
   * 잘못 잡은 대량 예약 발송을 멈추기 위한 기능
   * PENDING만 취소함. CLAIMED·SENDING은 워커가 이미 점유해 상태를 바꾸면 lease 불변식이 깨지고, SENT는 이미 도착함
   * 운영자가 모두 막았다고 오해하지 않도록 취소 건수와 이미 처리된 건수를 함께 반환
   *
   * @throws {DomainError} 404 SMS_BATCH_NOT_FOUND
   */
  public async cancelScheduledBatch(batchId: string, actor: string, key: string) {
    return this.idempotency.execute("SMS_BATCH_CANCEL", key, { batchId }, async (transaction) => {
      // 취소 전 상태별 건수 집계
      const rows = await transaction.$queryRaw<Array<{ status: string; count: bigint }>>`
        select status,count(*)::bigint count
          from sms_outbox
         where safe_metadata->>'batchId' = ${batchId}
         group by status`;
      if (rows.length === 0) this.fail(404, "SMS_BATCH_NOT_FOUND");

      // PENDING만 CANCELLED로 전환
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
   * 예약 발송 시각 검증
   *
   * 과거 시각은 거부. 예약으로 눌렀는데 즉시 나가면 의도와 반대이며, 즉시 발송은 예약을 비우면 됨. 시계 오차 1분 허용
   * 오타로 먼 미래에 나가는 대기열을 남기지 않도록 180일 상한
   *
   * @returns 예약 시각. 생략하면 null(즉시 발송)
   * @throws {DomainError} 400 형식 오류, 409 과거·180일 초과
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

  /**
   * 실제 수신 가족 선택
   *
   * 지점·회차·대상 상태·테스트 구분으로 예약을 고르고, 대상별 관련 학생 이름을 묶음
   * 관련 학생이 없는 예약은 제외. 예약 공개 ID 오름차순
   *
   * @throws {DomainError} 404 회차 없음, 409 학생 이름 누락
   */
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
        // 실제 발송이 테스트 예약에, 테스트 발송이 실제 가족에게 닿지 않도록 분리
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

  /**
   * 대상 구분별 관련 학생 선택
   *
   * 취소 대상은 마지막 해제 시각에 해제된 학생만, 나머지는 현재 활성 학생만 지점 기준으로 선택
   */
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

  /**
   * 대상 구분을 예약 상태 집합으로 변환. 테스트 여부는 targets()가 별도 조건으로 제한
   */
  private audienceStatuses(audience: SmsAudience): string[] {
    switch (audience) {
      case "BOOKED_FAMILIES": return ["RESERVED", "CHECKED_IN"];
      case "RESERVED_FAMILIES": return ["RESERVED"];
      case "CHECKED_IN_FAMILIES": return ["CHECKED_IN"];
      case "CANCELLED_FAMILIES": return ["CANCELLED"];
      // 테스트 예약은 취소 외 모든 상태가 대상. 재테스트 중 어느 상태에서든 발송을 확인하기 위함
      case "TEST_ACCOUNTS": return ["RESERVED", "CHECKED_IN", "NO_SHOW"];
    }
  }

  /**
   * 배치 ID별 발송 집계
   *
   * 대기열을 한 번만 집계해 수신·성공·실패·대기 수 반환. 상태 필터는 해당 상태 행이 하나라도 있는 배치
   */
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

  /**
   * 배치 상태 결정
   *
   * 대기 행이 있으면 처리 중 행 유무로 PROCESSING·QUEUED, 없으면 실패 수로 COMPLETED·FAILED·PARTIAL
   * 불명·차단 결과는 성공으로 세지 않음
   */
  private batchStatus(row: BatchAggregateRow): "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED" {
    if (row.pending_count > 0) return row.processing_count > 0 ? "PROCESSING" : "QUEUED";
    if (row.failure_count === 0) return "COMPLETED";
    if (row.success_count === 0) return "FAILED";
    return "PARTIAL";
  }

  /**
   * 템플릿 변수와 길이·문자 표현 가능성 검증
   *
   * 제목 길이는 LMS로 분류되는 46자 더미 본문과 함께 계산
   *
   * @throws {DomainError} 400 렌더러·길이 정책 위반
   */
  private validateTemplatePayload(body: string, title: string | null, purpose?: SmsTemplatePurpose): SmsPayloadClassification {
    this.renderer.validate(body, "message", purpose);
    if (title !== null) this.renderer.validate(title, "title", purpose);
    const bodyClassification = this.policy.classify(body);
    const titleBytes = title === null || title.length === 0
      ? null
      : this.policy.classify("가".repeat(46), title).titleBytes;
    return { ...bodyClassification, titleBytes };
  }

  /**
   * 예약 확인 링크
   *
   * @returns 공개 기준 URL의 /booking/{예약 ID}. 기준 URL 미설정이면 빈 문자열
   */
  private bookingUrl(familyBookingId: string): string {
    if (this.environment.publicBaseUrl === undefined) return "";
    const base = new URL(this.environment.publicBaseUrl);
    return new URL(`/booking/${encodeURIComponent(familyBookingId)}`, base.origin).toString();
  }

  /**
   * 회차 일시 문자 표기. `YYYY.MM.DD(요일) HH:mm`, 서울 시간
   */
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

  /**
   * 템플릿 공용 트랜잭션 advisory lock
   *
   * 생성·변경·삭제를 직렬화해 용도별 기본 템플릿 불변식 유지
   */
  private async lockTemplates(transaction: Prisma.TransactionClient): Promise<void> {
    await transaction.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${TEMPLATE_LOCK_NAME}::text, 0::bigint))`;
  }

  /**
   * 최댓값. 빈 목록이면 null
   */
  private maximum(values: readonly number[]): number | null {
    return values.length === 0 ? null : Math.max(...values);
  }

  /**
   * 템플릿 행을 응답 형태로 변환
   */
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

  /**
   * 대기열 행을 이력 응답으로 변환. 수신 번호 마스킹, 메타데이터에서 배치·템플릿 정보 추출
   */
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

  /**
   * JSON 객체 메타데이터. 객체가 아니면 빈 객체
   */
  private safeMetadata(value: Prisma.JsonValue): Readonly<Record<string, Prisma.JsonValue | undefined>> {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  /**
   * 메타데이터 문자열 값. 문자열이 아니면 null
   */
  private metadataString(metadata: Readonly<Record<string, Prisma.JsonValue | undefined>>, key: string): string | null {
    const value = metadata[key];
    return typeof value === "string" ? value : null;
  }

  /**
   * 끝 4자리만 남긴 수신 번호 마스킹
   */
  private mask(last4: string): string {
    return `***-****-${last4}`;
  }

  /**
   * 문자 관리 작업 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The SMS operation could not be completed.");
  }
}
