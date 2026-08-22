"use client";

/**
 * 브라우저 전용 Nest API 어댑터 코어 (계약 packages/contracts/openapi.yaml).
 *
 * 경계:
 * - `apps/api` 를 import 하지 않는다. 타입은 계약을 보고 이 패키지에서 다시 선언한다.
 * - same-origin `/api/v1` 만 호출한다. 계약이 Origin 헤더와 same-origin 검사를 요구하지만
 *   `Origin` 은 forbidden header 라 코드가 설정할 수 없다 — 브라우저가 붙이는 값을 그대로 쓴다.
 * - 세션은 HttpOnly 쿠키다. 토큰·세션·평문 시크릿을 storage 나 URL 에 절대 쓰지 않는다.
 *
 * CSRF: GET /api/v1/auth/csrf 로 부트스트랩하고 **메모리에만** 캐시한다.
 * 세션 identity 가 바뀌면(로그인·페어링 claim) 토큰이 무효가 되므로 `resetCsrfToken()` 으로 버린다.
 */

import { ApiError, toApiError } from "./problem";
import { ADMIN_SESSION_EXPIRED_EVENT } from "./session-events";

const API_BASE = "/api/v1";

/** 계약: 인증/페어링 성공 시 세션이 재생성돼 기존 토큰이 무효해진다. */
interface CsrfTokenResponse {
  csrfToken: string;
  expiresAt: string;
}

interface CachedCsrf {
  token: string;
  /** epoch ms. 만료 직전에는 새로 받는다. */
  expiresAtMs: number;
}

/** 메모리 전용 — 절대 localStorage/sessionStorage 로 내보내지 않는다. */
let csrfCache: CachedCsrf | null = null;
let csrfInFlight: Promise<string> | null = null;

const CSRF_EXPIRY_SKEW_MS = 10_000;

export function resetCsrfToken(): void {
  csrfCache = null;
  csrfInFlight = null;
}

/**
 * 세션 재생성 응답이 새 토큰을 함께 주는 경우(페어링 claim) 왕복 없이 심는다.
 * expiresAt 을 모르므로 짧게 잡고, 만료되면 정상 부트스트랩으로 돌아간다.
 */
export function adoptCsrfToken(token: string, expiresAt?: string): void {
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  csrfCache = {
    token,
    expiresAtMs: Number.isNaN(expiresAtMs) ? Date.now() + 60_000 : expiresAtMs,
  };
  csrfInFlight = null;
}

function isCsrfFresh(cache: CachedCsrf | null): cache is CachedCsrf {
  return cache !== null && cache.expiresAtMs - CSRF_EXPIRY_SKEW_MS > Date.now();
}

/** 동시 호출이 겹쳐도 부트스트랩은 한 번만 나간다. */
async function getCsrfToken(signal?: AbortSignal): Promise<string> {
  if (isCsrfFresh(csrfCache)) return csrfCache.token;
  if (csrfInFlight) return csrfInFlight;

  const request = (async () => {
    const response = await runFetch(`${API_BASE}/auth/csrf`, { method: "GET", signal });
    if (!response.ok) throw await toApiError(response);

    const body = (await response.json()) as CsrfTokenResponse;
    csrfCache = { token: body.csrfToken, expiresAtMs: Date.parse(body.expiresAt) };
    return body.csrfToken;
  })();

  csrfInFlight = request;
  try {
    return await request;
  } finally {
    if (csrfInFlight === request) csrfInFlight = null;
  }
}

/** 사전 인증 세션과 CSRF 토큰을 미리 확보한다 (공개 페어링 claim 전 필수). */
export async function bootstrapCsrf(signal?: AbortSignal): Promise<void> {
  await getCsrfToken(signal);
}

/** fetch 자체 실패(오프라인·CORS·취소)를 ApiError 로 좁힌다. */
async function runFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: "include", ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError({ kind: "aborted", status: 0, code: "ABORTED", message: "요청이 취소되었습니다." });
    }
    throw new ApiError({
      kind: "network",
      status: 0,
      code: "NETWORK_ERROR",
      message: "네트워크에 연결할 수 없습니다.",
    });
  }
}

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  method?: ApiMethod;
  /**
   * 계약이 상태 변경이 아닌 POST로 명시한 공개 조회에만 사용한다.
   *
   * 이 경계는 CSRF 부트스트랩과 세션 쿠키 전송을 모두 생략한다. 일반 POST/PUT/PATCH/DELETE의
   * 기본 CSRF·credentials 정책은 그대로 유지되며, 현재 허용 대상은 예약 연락처 조회뿐이다.
   */
  readOnlyPost?: true;
  /**
   * 요청 본문. GET/DELETE 는 보통 생략한다.
   * - 기본은 JSON 직렬화한다(`Content-Type: application/json`).
   * - **`FormData`** 를 그대로 넘기면(포스터 업로드 등) Content-Type 을 코드가 정하지 않고
   *   브라우저가 `multipart/form-data; boundary=…` 를 직접 만들게 둔다 — 필드 경계가 손상되지
   *   않게 하려면 이 헤더를 사람이 손대면 안 된다.
   */
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /**
   * 계약이 `x-idempotency: required` 인 엔드포인트에서 **호출부가 반드시** 넘긴다.
   *
   * 여기서 즉석 UUID를 만들지 않는다: 응답이 유실된 뒤의 재시도가 새 키를 달고 나가면
   * 서버가 별개 조작으로 처리해 중복 변경이 생긴다. 키 수명은 조작을 소유한
   * 훅/컴포넌트가 `useOperationKey()` 로 관리한다 (shared/api/idempotency.ts).
   */
  idempotencyKey?: string;
  /**
   * 계약 `bookingProof` 시큐리티 스킴 → `X-Booking-Proof` 헤더.
   *
   * 임의 헤더를 열어주지 않고 **이 한 가지 시크릿만** 받는다. 값은 호출부 메모리에서
   * 곧바로 넘어와야 하며, 저장·로깅·URL 노출이 금지된다. 여기서도 값을 로그에 남기지 않는다.
   */
  bookingProof?: string;
  /**
   * 계약이 `If-Match` 로 낙관적 잠금 version 을 요구하는 엔드포인트에서만 넘긴다
   * (현재는 DELETE /admin/sms/templates/{templateId}). 값을 그대로 `If-Match` 헤더에 싣는다.
   *
   * 임의 헤더를 열어주지 않고 **이 한 자리만** 받는다. Idempotency-Key 처럼 CSRF 재시도에서도
   * 같은 값이 다시 나가야 서버가 리플레이로 인식한다 — send 클로저가 매번 options 에서 다시 읽는다.
   */
  ifMatchVersion?: string;
}

function buildUrl(path: string, query: ApiRequestOptions["query"]): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }

  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function parseOk<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return undefined as T;
  return (await response.json()) as T;
}

const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * `readOnlyPost` 경계의 **유일한** 허용 경로 — 계약이 상태 변경이 아닌 POST 로 명시한 공개
 * 연락처 조회(POST /public/family-bookings/lookup)뿐이다. 다른 어떤 경로도(쿼리/경로 변형 포함)
 * 이 무세션·무CSRF 경계를 탈 수 없다: apiRequest 가 fetch·CSRF 이전에 동기적으로 거절한다.
 */
const READ_ONLY_POST_PATH = "/public/family-bookings/lookup";

/**
 * 계약을 따르는 단일 호출 지점.
 *
 * 상태 변경 요청에는 X-CSRF-Token 을 붙이고, CSRF 가 만료돼 403 이 오면
 * 토큰을 한 번만 새로 받아 재시도한다 (Idempotency-Key 는 그대로 유지해
 * 서버가 재시도를 리플레이로 인식하게 한다).
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const url = buildUrl(path, options.query);
  const readOnlyPost = options.readOnlyPost === true;
  if (readOnlyPost && method !== "POST") {
    throw new TypeError("readOnlyPost is only valid for POST requests.");
  }
  // 무세션·무CSRF 경계는 딱 하나의 경로에만 열어 둔다. 정확히 일치하지 않으면(다른 POST 경로,
  // 쿼리 문자열이 붙은 경로, 경로 조작 등) fetch·CSRF 이전에 프로그래머 오류로 거절한다.
  if (
    readOnlyPost &&
    (path !== READ_ONLY_POST_PATH || url !== `${API_BASE}${READ_ONLY_POST_PATH}`)
  ) {
    throw new TypeError("readOnlyPost is only valid for the family-booking lookup path.");
  }
  if (
    readOnlyPost &&
    (options.idempotencyKey !== undefined ||
      options.bookingProof !== undefined ||
      options.ifMatchVersion !== undefined)
  ) {
    throw new TypeError("readOnlyPost cannot carry mutation credentials.");
  }
  const needsCsrf = MUTATING_METHODS.has(method) && !readOnlyPost;
  // 아래 CSRF 재시도를 포함해 모든 재시도가 이 키를 그대로 다시 보낸다.
  const idempotencyKey = options.idempotencyKey;
  // FormData 본문(포스터 업로드)은 브라우저가 multipart 경계를 채우도록 Content-Type 을 코드가
  // 설정하지 않는다. 본문은 매 시도 동일하므로 한 번만 판정한다 — CSRF 재시도도 같은 body 를
  // 그대로 다시 싣는다(FormData 는 fetch 가 시도마다 새로 직렬화하므로 재전송이 안전하다).
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;

  const send = async (csrfToken: string | null): Promise<Response> => {
    const headers = new Headers({ Accept: "application/json" });
    // JSON 본문에만 Content-Type 을 붙인다. FormData 는 브라우저가 boundary 까지 채운다.
    if (options.body !== undefined && !isFormDataBody) headers.set("Content-Type", "application/json");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    // If-Match(낙관적 잠금 version) — CSRF 재시도에서도 같은 값이 다시 나가도록 여기서 붙인다.
    if (options.ifMatchVersion) headers.set("If-Match", options.ifMatchVersion);
    // 시크릿 — 요청 헤더에만 싣고 어디에도 남기지 않는다.
    if (options.bookingProof) headers.set("X-Booking-Proof", options.bookingProof);

    return runFetch(url, {
      method,
      headers,
      // 공개 read-only POST는 관리자·예약 링크 세션 쿠키에 기대지 않고 보내지 않는다.
      ...(readOnlyPost ? { credentials: "omit" as const } : {}),
      signal: options.signal,
      body:
        options.body === undefined
          ? undefined
          : isFormDataBody
            ? (options.body as FormData)
            : JSON.stringify(options.body),
    });
  };

  let response = await send(needsCsrf ? await getCsrfToken(options.signal) : null);

  if (needsCsrf && response.status === 403) {
    const error = await toApiError(response.clone());
    if (isCsrfFailure(error)) {
      resetCsrfToken();
      response = await send(await getCsrfToken(options.signal));
    }
  }

  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/admin/") && typeof window !== "undefined") {
      window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    }
    throw await toApiError(response);
  }
  return parseOk<T>(response);
}

/** 403 이 CSRF 때문인지 진짜 권한 부족인지 구분한다 — 권한 부족은 재시도하지 않는다. */
function isCsrfFailure(error: ApiError): boolean {
  return error.code.includes("CSRF");
}

/* ── 바이너리 다운로드 (계약 roster.xlsx 등) ─────────────────────────────────
 *
 * `apiRequest` 는 JSON 만 파싱한다(`parseOk` 가 non-JSON 응답을 undefined 로 떨어뜨린다).
 * XLSX 같은 바이너리 응답은 Blob 으로 받아야 하므로 GET 전용 다운로드 경로를 따로 둔다.
 * 상태 변경이 아니므로 CSRF 는 붙이지 않는다. 파일명은 서버 `Content-Disposition` 에서 읽되,
 * **안전 판정과 대체 이름은 호출부(어댑터)가 정한다** — 여기서는 원문만 파싱해 넘긴다.
 *
 * ★ 명단 XLSX 은 전체 연락처를 담는 ADMIN 전용 민감 데이터다 — Blob 내용을 로깅하지 않는다.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface BinaryDownload {
  blob: Blob;
  /** `Content-Disposition` 에서 읽은 파일명 원문(디코딩만 함). 없으면 null. */
  filename: string | null;
  /** 응답 `Content-Type`. 없으면 null. */
  contentType: string | null;
}

export interface ApiDownloadOptions {
  query?: ApiRequestOptions["query"];
  signal?: AbortSignal;
  /** 기대하는 바이너리 형식의 Accept 헤더. 생략하면 octet-stream. */
  accept?: string;
}

/** 계약을 따르는 단일 바이너리 GET 지점 — same-origin `/api/v1` 만 부른다. */
export async function apiDownload(path: string, options: ApiDownloadOptions = {}): Promise<BinaryDownload> {
  const url = buildUrl(path, options.query);
  const headers = new Headers({ Accept: options.accept ?? "application/octet-stream" });
  const response = await runFetch(url, { method: "GET", headers, signal: options.signal });
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/admin/") && typeof window !== "undefined") {
      window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    }
    throw await toApiError(response);
  }

  const blob = await response.blob();
  return {
    blob,
    filename: parseContentDispositionFilename(response.headers.get("content-disposition")),
    contentType: response.headers.get("content-type"),
  };
}

/**
 * `Content-Disposition` 의 파일명을 읽는다. RFC 5987 `filename*=UTF-8''<pct-encoded>` 를 먼저 보고
 * (한글 등 비 ASCII 를 담는 정식 자리), 없으면 따옴표 있는/없는 `filename=` 을 본다. 어느 쪽도
 * 없거나 디코딩이 실패하면 null 을 준다 — 지어내지 않는다.
 *
 * ★ 여기서는 **원문만** 돌려준다. 경로 분리자 검사·확장자 검사 같은 안전 판정과 대체 이름
 *   선택은 어댑터가 정한다(다운로드마다 규칙이 다르다).
 */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (header === null) return null;

  // filename*=UTF-8''... (RFC 5987) — 비 ASCII 를 담는 정식 자리라 우선한다.
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(header);
  if (extended?.[1] !== undefined) {
    try {
      const decoded = decodeURIComponent(extended[1].trim());
      if (decoded !== "") return decoded;
    } catch {
      // 디코딩 실패면 아래 평범한 filename= 으로 넘어간다.
    }
  }

  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  if (quoted?.[1] !== undefined) return quoted[1].trim() === "" ? null : quoted[1].trim();

  // 따옴표 없는 filename= (세미콜론 전까지). filename*= 는 위에서 이미 처리했다.
  const bare = /filename\s*=\s*([^;"]+)/i.exec(header);
  if (bare?.[1] !== undefined) {
    const value = bare[1].trim();
    if (value !== "") return value;
  }

  return null;
}
