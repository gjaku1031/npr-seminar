"use client";

/**
 * 관리자 문자 어댑터 (계약 tag: Admin SMS) — `/api/v1/admin/sms/*`.
 *
 * 계약이 확정돼 정규화 계층이 사라졌다 — 응답을 그대로 읽는다. 이 모듈이 지키는 규칙:
 * - 서버가 이미 센 값을 다시 세지 않는다. 배치 집계는 `batches` 가 유일한 진실이고,
 *   그 배치의 `items` 를 다시 묶으면 같은 건을 두 번 센다.
 * - 발송은 프리뷰가 준 `previewToken` 을 그대로 되돌려 보낸다.
 * - 연락처는 어떤 경로로도 평문이 오지 않는다 — 서버가 `***-****-1234` 로만 준다.
 */

import { apiRequest } from "./client";
import { isApiError } from "./problem";
import type {
  Branch,
  SmsAudience,
  SmsBatchSummary,
  SmsDeliveryStatus,
  SmsEnqueueAccepted,
  SmsGatewayReadiness,
  SmsMessageList,
  SmsMessageSummary,
  SmsPurpose,
  SmsRenderedSample,
  SmsTargetPreview,
  SmsTemplate,
  SmsTemplateCreated,
  SmsTemplateList,
  SmsTemplateRemovalResult,
} from "./contract";

/* ── 게이트웨이 준비 상태 ────────────────────────────────────────────────── */

export async function getSmsGatewayReadiness(signal?: AbortSignal): Promise<SmsGatewayReadiness> {
  return apiRequest<SmsGatewayReadiness>("/admin/sms/gateway-readiness", { method: "GET", signal });
}

/**
 * 발송을 **막아야 하는가**.
 *
 * `configured` 는 HTTP API 프로세스에 provider 시크릿이 있는지일 뿐이고, `adapterAvailable`
 * 은 계약상 그 프로세스에서 항상 false 다 — 실제 발송은 자기 시크릿을 가진 워커가 한다.
 * 이 값들로 버튼을 잠그면 멀쩡한 기능을 끄는 셈이라, 기능 자체가 꺼진 `enabled:false` 만 본다.
 */
export function isSmsSendDisabled(readiness: SmsGatewayReadiness | null): boolean {
  return readiness !== null && readiness.enabled === false;
}

/** 화면에 띄울 짧은 경고 — 없으면 null (문제 없을 때 배너를 만들지 않는다). */
export function smsReadinessWarning(readiness: SmsGatewayReadiness | null): string | null {
  if (readiness === null) return null;
  if (readiness.enabled === false) {
    return "문자 기능이 서버에서 꺼져 있어요. 지금은 발송할 수 없어요.";
  }
  if (readiness.testMode) {
    return "게이트웨이가 테스트 모드예요. 실제 단말로는 발송되지 않을 수 있어요.";
  }
  if (readiness.allowlistEnabled) {
    return "수신 허용목록이 켜져 있어요. 목록에 없는 번호는 차단돼요.";
  }
  return null;
}

/* ── 본문·변수 오류 문구 ─────────────────────────────────────────────────── */

/**
 * 본문/제목/변수 때문에 서버가 거절한 경우의 한국어 문구. 해당 없으면 null.
 *
 * 템플릿 저장·프리뷰·발송이 같은 검증(SmsTemplateRenderer + SmsMessagePolicy)을 통과하므로
 * 문구도 한 곳에서 고른다 — 같은 원인에 화면마다 다른 말을 하지 않기 위해서다.
 */
export function smsContentErrorMessage(error: unknown): string | null {
  if (!isApiError(error)) return null;

  switch (error.code) {
    case "SMS_TEMPLATE_VARIABLE_UNKNOWN":
      return "쓸 수 없는 변수가 있어요. 변수 칩에 있는 것만 사용해 주세요.";
    case "SMS_TEMPLATE_VARIABLE_INVALID":
      return "중괄호 `{}` 짝이 맞지 않아요. 변수는 칩으로 넣어 주세요.";
    // 변수 자리에 채울 값이 서버에 없다 (예: 공개 주소 미설정으로 {QR링크}·{설문링크} 가 빈 값).
    case "SMS_TEMPLATE_VARIABLE_UNRESOLVED":
      return "변수에 채울 값이 서버에 없어요. 해당 변수를 빼고 다시 시도해 주세요.";
    case "SMS_MESSAGE_SIZE_INVALID":
      return "본문은 1~2,000 byte 여야 해요.";
    case "SMS_MESSAGE_UNREPRESENTABLE":
      return "문자로 보낼 수 없는 문자가 있어요 (이모지 등). 지우고 다시 시도해 주세요.";
    case "SMS_TITLE_NOT_ALLOWED":
      return "제목은 LMS(90 byte 초과)에서만 쓸 수 있어요.";
    case "SMS_TITLE_SIZE_INVALID":
      return "제목은 44 byte 이하여야 해요.";
    case "SMS_TITLE_UNREPRESENTABLE":
      return "제목에 문자로 보낼 수 없는 문자가 있어요.";
    // 대상 가족의 학생 이름 스냅샷이 비어 있어 {학생명} 을 채울 수 없다 — 데이터 쪽 문제다.
    case "SMS_STUDENT_NAME_MISSING":
      return "대상 중 학생 이름이 비어 있는 예약이 있어 발송할 수 없어요. 예약 명단을 확인해 주세요.";
    case "SMS_CONTENT_SOURCE_INVALID":
      return "본문과 템플릿 중 하나만 보낼 수 있어요.";
    default:
      return null;
  }
}

/* ── 템플릿 ──────────────────────────────────────────────────────────────── */

export const SMS_TEMPLATE_VERSION_CONFLICT_CODE = "SMS_TEMPLATE_VERSION_CONFLICT";
export const SMS_TEMPLATE_KEY_CONFLICT_CODE = "SMS_TEMPLATE_KEY_CONFLICT";
/** 현재 기본 템플릿을 보관하려면 먼저 다른 템플릿을 기본으로 지정해야 한다. */
export const SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED_CODE = "SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED";
/** 비활성 템플릿은 기본으로 지정할 수 없다. */
export const SMS_DEFAULT_TEMPLATE_MUST_BE_ACTIVE_CODE = "SMS_DEFAULT_TEMPLATE_MUST_BE_ACTIVE";

export async function listSmsTemplates(signal?: AbortSignal): Promise<SmsTemplate[]> {
  const list = await apiRequest<SmsTemplateList>("/admin/sms/templates", { method: "GET", signal });
  return list.items;
}

export interface CreateSmsTemplateInput {
  key: string;
  name: string;
  purpose: SmsPurpose;
  title?: string;
  body: string;
  /** 이 용도의 활성 기본 템플릿으로 만든다. */
  isDefault?: boolean;
}

/** durable 변경 — `idempotencyKey` 는 조작을 소유한 훅이 넘긴다 (여기서 만들지 않는다). */
export async function createSmsTemplate(
  input: CreateSmsTemplateInput,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<SmsTemplateCreated> {
  return apiRequest<SmsTemplateCreated>("/admin/sms/templates", {
    method: "POST",
    body: input,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

export interface UpdateSmsTemplateInput {
  name?: string;
  purpose?: SmsPurpose;
  /** null 은 제목 제거다 — undefined(변경 없음)와 구분해야 해서 명시적으로 받는다. */
  title?: string | null;
  body?: string;
  active?: boolean;
  /** true 면 같은 용도의 활성 기본을 이 템플릿으로 옮긴다(서버가 이전 기본을 동시에 내린다). */
  isDefault?: boolean;
  /** 현재 버전 문자열. 다르면 서버가 409 로 거절한다. */
  version: string;
}

export async function updateSmsTemplate(
  templateId: string,
  input: UpdateSmsTemplateInput,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<SmsTemplate> {
  return apiRequest<SmsTemplate>(`/admin/sms/templates/${encodeURIComponent(templateId)}`, {
    method: "PATCH",
    body: input,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * 템플릿 제거 — 계약 DELETE /admin/sms/templates/{templateId}.
 *
 * 현재 version 을 `If-Match` 헤더로 싣고(낙관적 잠금), durable 변경이라 Idempotency-Key 도 넘긴다.
 * 서버가 결과를 정한다: 사용 이력이 없으면 하드 삭제(`disposition:"DELETED"`, archivedTemplate:null),
 * 이력이 있으면 inactive 로 보관(`disposition:"ARCHIVED"`, archivedTemplate 에 내려간 행). 현재 기본
 * 템플릿은 다른 템플릿을 먼저 기본으로 지정하기 전엔 409(`SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED`)로 거절된다.
 */
export async function removeSmsTemplate(
  templateId: string,
  version: string,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<SmsTemplateRemovalResult> {
  return apiRequest<SmsTemplateRemovalResult>(`/admin/sms/templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
    ifMatchVersion: version,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/* ── 대상별 수신 인원 ────────────────────────────────────────────────────── */

export interface SmsAudienceCount {
  audience: SmsAudience;
  recipientCount: number;
}

export interface SmsTargetCounts {
  branch: Branch;
  seminarSessionId: string;
  counts: SmsAudienceCount[];
}

/**
 * 대상 탭에 붙일 수신 인원 — 발송이 쓰는 것과 **같은 선택 로직**으로 서버가 센 값이다.
 *
 * 프리뷰와 달리 previewToken 을 만들지 않는다. 캠퍼스·회차를 바꿀 때마다 부르는 값이라,
 * 이 호출이 발송 자격을 남기면 안 된다.
 */
export async function countSmsTargets(
  input: { branch: Branch; seminarSessionId: string },
  signal?: AbortSignal,
): Promise<SmsTargetCounts> {
  return apiRequest<SmsTargetCounts>("/admin/sms/targets/counts", {
    method: "GET",
    query: { branch: input.branch, seminarSessionId: input.seminarSessionId },
    signal,
  });
}

/* ── 대상 프리뷰 ─────────────────────────────────────────────────────────── */

export interface SmsTargetRequest {
  branch: Branch;
  seminarSessionId: string;
  audience: SmsAudience;
  /**
   * 계약 oneOf: `templateId` 하나만 보내거나(그때 message·title 금지),
   * `message`(+선택 `title`) 를 보내거나 — 둘 다 보내면 400 이다.
   */
  templateId?: string;
  message?: string;
  title?: string;
}

/**
 * 확인 화면·폰 미리보기가 읽을 대표 표본.
 *
 * 수신자가 0 명이면 `samples` 가 비어 있다 — 그때는 null 을 주고, 화면이 "치환 표본 없음"을
 * 분명히 말하게 한다. 원문(messageTemplate)을 표본인 척 돌려주지 않는다.
 */
export function primarySample(preview: SmsTargetPreview): SmsRenderedSample | null {
  return preview.samples[0] ?? null;
}

/**
 * 대상 프리뷰 — 발송 전 권위 있는 대상 수·치환 표본·바이트/타입·previewToken 을 받는다.
 * 계약상 ephemeral(x-idempotency: exempt) 이라 Idempotency-Key 를 붙이지 않는다.
 */
export async function previewSmsTargets(
  input: SmsTargetRequest,
  signal?: AbortSignal,
): Promise<SmsTargetPreview> {
  return apiRequest<SmsTargetPreview>("/admin/sms/targets/preview", {
    method: "POST",
    body: input,
    signal,
  });
}

/* ── 발송 ────────────────────────────────────────────────────────────────── */

/** 프리뷰 이후 대상·본문·회차가 바뀌어 토큰이 무효해졌다 — **아무것도 큐에 들어가지 않았다**. */
const SMS_PREVIEW_TOKEN_CHANGED_CODE = "SMS_PREVIEW_TOKEN_CHANGED";

/**
 * 실제 발송 — **확인 대화상자에서 사용자가 명시적으로 확인했을 때만** 호출한다.
 *
 * `idempotencyKey` 는 한 번의 발송 시도를 소유한 훅이 만들고, 결과가 미상인 동안 같은 값을
 * 재사용한다. 여기서 키를 만들면 응답 유실 뒤의 재시도가 **문자를 두 번 보낸다**.
 */
export async function enqueueSmsSend(
  input: SmsTargetRequest,
  previewToken: string,
  options: { idempotencyKey: string; signal?: AbortSignal; scheduledAt?: string },
): Promise<SmsEnqueueAccepted> {
  return apiRequest<SmsEnqueueAccepted>("/admin/sms/sends", {
    method: "POST",
    body: options.scheduledAt === undefined
      ? { ...input, previewToken }
      : { ...input, previewToken, scheduledAt: options.scheduledAt },
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

export interface SmsBatchCancellation {
  batchId: string;
  /** 아직 안 나가서 막은 건수. */
  cancelledCount: number;
  /** 이미 워커가 쥐었거나 발송된 건수 — 이건 못 막는다. */
  alreadyLeftCount: number;
  totalCount: number;
}

/**
 * 예약 발송 취소 — 아직 나가지 않은 건만 막는다.
 *
 * 보낸 문자는 되돌릴 수 없으므로, 화면은 `cancelledCount` 와 `alreadyLeftCount` 를 **함께**
 * 말해야 한다. "취소했습니다" 한 줄만 보여 주면 부분 차단을 전부 막은 것으로 읽는다.
 */
export async function cancelSmsBatch(
  batchId: string,
  options: { idempotencyKey: string; signal?: AbortSignal },
): Promise<SmsBatchCancellation> {
  return apiRequest<SmsBatchCancellation>(
    `/admin/sms/sends/${encodeURIComponent(batchId)}/cancel`,
    { method: "POST", idempotencyKey: options.idempotencyKey, signal: options.signal },
  );
}

/**
 * 발송 실패를 화면이 취할 **행동**으로 좁힌다.
 *
 * - `retry-same`: 결과 미상(네트워크·취소·5xx). 서버가 이미 처리했을 수 있으므로 같은 키·같은
 *   토큰으로만 다시 보낸다. 확인 화면에 머문다.
 * - `re-preview`: 토큰이 무효해졌다(409). 큐에 들어간 게 없으니 프리뷰를 버리고 다시 확인받는다.
 *   같은 토큰 재시도를 제안하면 안 된다 — 반드시 실패한다.
 * - `edit`: 그 밖의 확정 4xx. 같은 내용 재시도는 같은 실패다. 고치거나 다시 프리뷰해야 한다.
 */
export type SmsSendFailureAction = "retry-same" | "re-preview" | "edit";

export interface SmsSendFailure {
  action: SmsSendFailureAction;
  message: string;
}

export function classifySmsSendFailure(error: unknown): SmsSendFailure {
  if (!isApiError(error)) {
    return { action: "retry-same", message: "알 수 없는 오류가 발생했어요. 발송 여부를 확인할 수 없어요." };
  }

  if (error.code === SMS_PREVIEW_TOKEN_CHANGED_CODE) {
    return {
      action: "re-preview",
      message: "대상이나 내용이 방금 바뀌어 확인 내용이 만료됐어요. 아무것도 발송하지 않았어요 — 다시 확인해 주세요.",
    };
  }

  // 결과 미상 — 서버가 이미 큐에 넣었을 수 있다. 새 키로 다시 보내면 두 번 나간다.
  if (error.kind === "network" || error.kind === "aborted" || error.status === 0 || error.status >= 500) {
    return {
      action: "retry-same",
      message:
        error.status === 503
          ? "문자 게이트웨이가 지금 응답하지 않아요. 발송 여부를 확인할 수 없어요 — 같은 내용으로 다시 시도해 주세요."
          : "응답을 받지 못해 발송 여부를 확인할 수 없어요. 같은 내용으로 다시 시도해 주세요.",
    };
  }

  // 본문·변수 문제는 고쳐야 풀린다 — 같은 내용 재시도는 같은 실패다.
  const content = smsContentErrorMessage(error);
  if (content !== null) return { action: "edit", message: content };

  switch (error.status) {
    case 404:
      return { action: "re-preview", message: "대상 회차나 템플릿을 찾을 수 없어요. 다시 확인해 주세요." };
    case 401:
      return { action: "edit", message: "인증이 만료됐어요. 다시 로그인해 주세요." };
    case 403:
      return { action: "edit", message: "권한이 없어요." };
    case 429:
      return { action: "re-preview", message: "요청이 너무 잦아요. 잠시 후 다시 확인해 주세요." };
    default:
      return { action: "edit", message: "발송 요청을 서버가 받아들이지 않았어요. 내용을 확인한 뒤 다시 시도해 주세요." };
  }
}

/* ── 이력 ────────────────────────────────────────────────────────────────── */

export interface ListSmsMessagesParams {
  status?: SmsDeliveryStatus;
  source?: SmsPurpose;
  branch?: Branch;
  seminarSessionId?: string;
  batchId?: string;
  /** 계약 최대 200. */
  limit?: number;
}

export async function listSmsMessages(
  params: ListSmsMessagesParams = {},
  signal?: AbortSignal,
): Promise<SmsMessageList> {
  return apiRequest<SmsMessageList>("/admin/sms/messages", {
    method: "GET",
    query: {
      status: params.status,
      source: params.source,
      branch: params.branch,
      seminarSessionId: params.seminarSessionId,
      batchId: params.batchId,
      limit: params.limit,
    },
    signal,
  });
}

/**
 * 배송 상태를 로그가 세는 칸으로 접는다.
 *
 * 서버의 배치 집계와 **같은 기준**을 쓴다 (sms-admin.service.ts batchHistory):
 * 성공 = SENT, 대기 = PENDING·CLAIMED·SENDING, 실패 = 차단·영구실패·미상·DEAD.
 * 기준이 갈리면 배치 행과 미배치 행의 성공률이 서로 다른 뜻이 된다.
 */
export type SmsOutcome = "success" | "failure" | "pending";

export function smsOutcomeOf(status: SmsDeliveryStatus): SmsOutcome {
  switch (status) {
    case "SENT":
      return "success";
    case "PENDING":
    case "CLAIMED":
    case "SENDING":
      return "pending";
    default:
      return "failure";
  }
}

/**
 * 로그 한 줄.
 *
 * 서버 배치(`batches`)는 그대로 한 줄이 되고, 배치에 속하지 않는 행(`batchId:null` — OTP 같은
 * 자동 발송)만 따로 한 줄씩 만든다. 배치의 구성원 행을 다시 묶지 않는다 — 두 번 세게 된다.
 */
export interface SmsLogRow {
  id: string;
  /** 서버 배치면 true. false 면 배치에 속하지 않은 단건이다. */
  batched: boolean;
  source: SmsPurpose;
  branch: Branch;
  seminarSessionId: string | null;
  audience: SmsAudience | null;
  templateName: string | null;
  /** 서버 배치 상태. 단건에는 없다. */
  status: SmsBatchSummary["status"] | null;
  createdAt: string;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  /** 배치가 아닌 단건일 때만 — 마스킹된 수신자. */
  maskedRecipient: string | null;
}

function batchRow(batch: SmsBatchSummary): SmsLogRow {
  return {
    id: batch.batchId,
    batched: true,
    source: batch.source,
    branch: batch.branch,
    seminarSessionId: batch.seminarSessionId,
    audience: batch.audience,
    templateName: batch.templateName,
    status: batch.status,
    createdAt: batch.createdAt,
    // 전부 서버가 SQL 로 센 값이다 — 여기서 더하거나 고치지 않는다.
    recipientCount: batch.recipientCount,
    successCount: batch.successCount,
    failureCount: batch.failureCount,
    pendingCount: batch.pendingCount,
    maskedRecipient: null,
  };
}

function looseRow(item: SmsMessageSummary): SmsLogRow {
  const outcome = smsOutcomeOf(item.status);
  return {
    id: `message:${item.messageId}`,
    batched: false,
    source: item.source,
    branch: item.branch,
    seminarSessionId: item.seminarSessionId,
    audience: item.audience,
    templateName: item.templateName,
    status: null,
    createdAt: item.createdAt,
    recipientCount: 1,
    successCount: outcome === "success" ? 1 : 0,
    failureCount: outcome === "failure" ? 1 : 0,
    pendingCount: outcome === "pending" ? 1 : 0,
    maskedRecipient: item.maskedRecipient,
  };
}

/**
 * 서버 배치 + 미배치 단건을 한 목록으로.
 *
 * 배치에 속한 `items` 는 **버린다** — 그 수치는 이미 `batches` 에 집계돼 있고, 여기서 다시
 * 세면 같은 발송이 두 줄로 잡힌다.
 */
export function toSmsLogRows(list: SmsMessageList): SmsLogRow[] {
  const rows = list.batches.map(batchRow);
  const loose = list.items.filter((item) => item.batchId === null).map(looseRow);
  return [...rows, ...loose].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/**
 * 불러온 이력의 성공률.
 *
 * 분모는 **결과가 확정된 건**뿐이다 — 대기까지 넣으면 발송 직후 성공률이 0% 로 보인다.
 * 확정 건이 없으면 null 이고, 화면은 그때 배지를 그리지 않는다 (100% 라고 쓰지 않는다).
 */
export function smsSuccessRate(rows: readonly SmsLogRow[]): number | null {
  let success = 0;
  let settled = 0;
  for (const row of rows) {
    success += row.successCount;
    settled += row.successCount + row.failureCount;
  }
  if (settled === 0) return null;
  return Math.round((success / settled) * 1000) / 10;
}
