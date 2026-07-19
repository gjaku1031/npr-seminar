import "server-only";
import { SolapiMessageService } from "solapi";
import { serverEnv } from "../config/env";

/**
 * SOLAPI 문자 게이트웨이 — qr-poc(src/lib/sms.ts) 이식 (명세 §12 "문자 게이트웨이" 실서비스 전환).
 *
 * 안전장치 (qr-poc 정책 승계):
 * - 발송 활성: SMS_DISABLED > SMS_ENABLED 명시 > 기본값(프로덕션 배포에서만 on)
 * - 비프로덕션은 SMS_RECIPIENT_ALLOWLIST(쉼표 구분)에 있는 번호로만 발송 — 시드 연락처 오발송 방지
 * - 게이트웨이 비활성/키 없음 → "skipped" (기능은 목업처럼 계속 동작, 로그만 남는다)
 *
 * 발송 실패가 예약·입장 처리를 실패시키지 않는다 — 호출부는 결과 카운트만 로그에 남긴다.
 */

export type SmsSendStatus = "sent" | "skipped" | "failed";

export interface SmsMessage {
  to: string;
  body: string;
}

/** 배치 발송 집계 — SmsLog(ok/fail) 기록용 */
export interface SmsBatchResult {
  requested: number;
  sent: number;
  /** 게이트웨이 비활성·허용목록 제외로 건너뜀 */
  skipped: number;
  failed: number;
  /** 대표 오류(첫 건) — 콘솔 진단용 */
  error?: string;
}

const TRUTHY = new Set(["1", "true", "yes", "y", "on"]);
const FALSY = new Set(["0", "false", "no", "n", "off"]);

let cachedClient: { key: string; client: SolapiMessageService } | null = null;

function parseOptionalBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  return null;
}

function isProductionDeployment(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV)
  );
}

function isSmsEnabled(): boolean {
  const env = serverEnv();
  if (parseOptionalBoolean(env.SMS_DISABLED) === true) return false;
  const explicit = parseOptionalBoolean(env.SMS_ENABLED);
  if (explicit !== null) return explicit;
  return isProductionDeployment();
}

/** 82 국가번호 → 0 접두, 숫자만 — SOLAPI 수신 번호 형식 */
function toSolapiPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length > 10) return `0${digits.slice(2)}`;
  return digits;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "(invalid)";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function getConfig(): { apiKey: string; apiSecret: string; sender: string } | null {
  if (!isSmsEnabled()) return null;
  const env = serverEnv();
  const apiKey = env.SOLAPI_API_KEY?.trim() ?? "";
  const apiSecret = env.SOLAPI_API_SECRET?.trim() ?? "";
  const sender = toSolapiPhone(env.SOLAPI_SENDER ?? "");
  if (!apiKey || !apiSecret || !sender) return null;
  return { apiKey, apiSecret, sender };
}

function getClient(config: { apiKey: string; apiSecret: string }): SolapiMessageService {
  const key = `${config.apiKey}:${config.apiSecret}`;
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = { key, client: new SolapiMessageService(config.apiKey, config.apiSecret) };
  }
  return cachedClient.client;
}

/** 비프로덕션 오발송 방지 허용목록 — null이면 제한 없음 */
function getAllowlist(): Set<string> | null {
  if (isProductionDeployment()) return null;
  const raw = serverEnv().SMS_RECIPIENT_ALLOWLIST;
  const numbers = raw
    ?.split(",")
    .map((phone) => toSolapiPhone(phone))
    .filter(Boolean);
  return numbers?.length ? new Set(numbers) : new Set();
}

type SolapiCounts = {
  groupInfo?: { count?: { registeredSuccess?: unknown; registeredFailed?: unknown } };
  failedMessageList?: unknown;
};

function getSolapiErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const data = error as { errorCode?: unknown; errorMessage?: unknown; message?: unknown };
    const parts = [data.errorCode, data.errorMessage ?? data.message].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (parts.length) return parts.join(" ");
  }
  return "SMS provider request failed.";
}

/**
 * 배치 발송 — 수신자별 본문(변수 치환 결과)을 개별 메시지로 보낸다.
 * SOLAPI 미설정/비활성 시 전량 skipped — 호출부 UX는 목업 시절과 동일하게 유지된다.
 */
export async function sendSmsBatch(messages: SmsMessage[]): Promise<SmsBatchResult> {
  const result: SmsBatchResult = {
    requested: messages.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (messages.length === 0) return result;

  const config = getConfig();
  if (!config) {
    result.skipped = messages.length;
    result.error = "SMS gateway is not enabled or configured.";
    return result;
  }

  const allowlist = getAllowlist();
  const deliverable: Array<{ to: string; from: string; text: string; autoTypeDetect: true }> = [];

  for (const message of messages) {
    const to = toSolapiPhone(message.to);
    if (to.length < 9) {
      result.failed += 1;
      result.error ??= "Invalid recipient phone number.";
      continue;
    }
    if (allowlist && !allowlist.has(to)) {
      console.warn(`[sms] allowlist 제외로 발송 생략: ${maskPhone(to)}`);
      result.skipped += 1;
      continue;
    }
    deliverable.push({ to, from: config.sender, text: message.body, autoTypeDetect: true });
  }

  if (deliverable.length === 0) return result;

  try {
    const response = (await getClient(config).send(deliverable)) as SolapiCounts;
    const success = Number(response.groupInfo?.count?.registeredSuccess ?? 0);
    const failed = Number(response.groupInfo?.count?.registeredFailed ?? 0);
    // 응답 카운트가 없으면(구버전 응답 형태) 전량 성공으로 간주 — 예외는 catch가 잡는다
    result.sent = success > 0 || failed > 0 ? success : deliverable.length;
    result.failed += failed;
    if (failed > 0) {
      result.error ??= "SOLAPI rejected some messages.";
      console.error(`[sms] SOLAPI 일부 거절: 성공 ${success} · 실패 ${failed}`);
    }
  } catch (error) {
    result.failed += deliverable.length;
    result.error = getSolapiErrorMessage(error);
    console.error(`[sms] SOLAPI 발송 실패 (${deliverable.length}건): ${result.error}`);
  }
  return result;
}

/** 단건 발송 편의 래퍼 — 입장 확인 문자 등 */
export async function sendSms(to: string, body: string): Promise<SmsSendStatus> {
  const result = await sendSmsBatch([{ to, body }]);
  if (result.sent > 0) return "sent";
  if (result.failed > 0) return "failed";
  return "skipped";
}
