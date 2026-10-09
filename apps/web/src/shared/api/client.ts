"use client";

// 브라우저 전용 API 호출 코어. 계약은 packages/contracts/openapi.yaml
// - apps/api를 import하지 않고 타입은 계약을 보고 이 패키지에서 다시 선언
// - 같은 출처 `/api/v1`만 호출. 계약이 Origin 헤더 검사를 요구하지만 Origin은 금지 헤더라 브라우저가 붙이는 값을 그대로 씀
// - 세션은 HttpOnly 쿠키. 토큰·세션·평문 비밀 값을 storage나 URL에 쓰지 않음
// CSRF: GET /api/v1/auth/csrf로 받아 메모리에만 캐시. 로그인·페어링으로 세션이 바뀌면 토큰이 무효라 resetCsrfToken()으로 버림

import { ApiError, toApiError } from "./problem";
import { ADMIN_SESSION_EXPIRED_EVENT } from "./session-events";

/**
 * API 기준 경로
 */
const API_BASE = "/api/v1";

/**
 * CSRF 토큰 응답. 인증·페어링 성공 시 세션이 재생성되어 기존 토큰은 무효
 */
interface CsrfTokenResponse {
  /**
   * CSRF 토큰
   */
  csrfToken: string;

  /**
   * 만료 시각
   */
  expiresAt: string;
}

/**
 * 캐시한 CSRF 토큰
 */
interface CachedCsrf {
  /**
   * 토큰
   */
  token: string;

  /**
   * 만료 시각(epoch 밀리초). 만료 직전에는 새로 받음
   */
  expiresAtMs: number;
}

/**
 * CSRF 토큰 메모리 캐시. localStorage·sessionStorage로 내보내지 않음
 */
let csrfCache: CachedCsrf | null = null;

/**
 * 진행 중인 CSRF 발급 요청. 동시 호출이 겹쳐도 한 번만 요청
 */
let csrfInFlight: Promise<string> | null = null;

/**
 * 만료 판단 여유(밀리초)
 */
const CSRF_EXPIRY_SKEW_MS = 10_000;

/**
 * CSRF 토큰 캐시 폐기. 세션 주체가 바뀐 뒤 호출
 */
export function resetCsrfToken(): void {
  csrfCache = null;
  csrfInFlight = null;
}

/**
 * 세션 재생성 응답이 준 새 토큰을 왕복 없이 캐시에 저장(페어링 사용)
 *
 * @param expiresAt 만료 시각. 모르면 1분으로 짧게 잡고 만료되면 정상 발급으로 돌아감
 */
export function adoptCsrfToken(token: string, expiresAt?: string): void {
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  csrfCache = {
    token,
    expiresAtMs: Number.isNaN(expiresAtMs) ? Date.now() + 60_000 : expiresAtMs,
  };
  csrfInFlight = null;
}

/**
 * 만료 여유를 두고도 유효한 캐시인지 여부
 */
function isCsrfFresh(cache: CachedCsrf | null): cache is CachedCsrf {
  return cache !== null && cache.expiresAtMs - CSRF_EXPIRY_SKEW_MS > Date.now();
}

/**
 * CSRF 토큰 확보. 동시 호출이 겹쳐도 발급 요청은 한 번만 보냄
 */
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

/**
 * 사전 인증 세션과 CSRF 토큰 확보. 공개 페어링 사용 전에 필수
 */
export async function bootstrapCsrf(signal?: AbortSignal): Promise<void> {
  await getCsrfToken(signal);
}

/**
 * 쿠키를 포함해 fetch 실행. 오프라인·CORS·취소 같은 fetch 자체 실패는 ApiError로 변환
 *
 * @throws {ApiError} aborted 또는 network 종류
 */
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

/**
 * HTTP 메서드
 */
export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * API 요청 옵션
 */
export interface ApiRequestOptions {
  /**
   * 메서드. 기본 GET
   */
  method?: ApiMethod;

  /**
   * 계약이 상태 변경이 아닌 POST로 명시한 공개 조회 전용 표시
   *
   * CSRF 발급과 세션 쿠키 전송을 모두 생략. 일반 변경 요청의 기본 정책은 그대로이며 현재 허용 대상은 예약 연락처 조회뿐
   */
  readOnlyPost?: true;

  /**
   * 요청 본문. GET·DELETE는 보통 생략
   *
   * 기본은 JSON 직렬화(`Content-Type: application/json`)
   * FormData를 넘기면(포스터 업로드) Content-Type을 코드가 정하지 않고 브라우저가 multipart 경계까지 채우게 둠. 이 헤더를 직접 정하면 필드 경계가 손상됨
   */
  body?: unknown;

  /**
   * 쿼리 값. null·undefined·빈 문자열은 생략
   */
  query?: Record<string, string | number | boolean | null | undefined>;

  /**
   * 취소 신호
   */
  signal?: AbortSignal;

  /**
   * Idempotency-Key. 계약이 멱등 키를 요구하는 엔드포인트에서 호출부가 반드시 전달
   *
   * 여기서 즉석 UUID를 만들지 않음. 응답 유실 후 재시도가 새 키로 나가면 서버가 별개 조작으로 처리해 중복 변경이 생김
   * 키 수명은 조작을 소유한 훅·컴포넌트가 useOperationKey()(shared/api/idempotency.ts)로 관리
   */
  idempotencyKey?: string;

  /**
   * 예약 증명. `X-Booking-Proof` 헤더로 전송
   *
   * 임의 헤더를 열지 않고 이 비밀 값 하나만 받음. 호출부 메모리에서 바로 전달하며 저장·로깅·URL 노출 금지
   */
  bookingProof?: string;

  /**
   * 낙관적 잠금 버전. `If-Match` 헤더로 전송(현재 DELETE /admin/sms/templates/{templateId})
   *
   * 임의 헤더를 열지 않고 이 값 하나만 받음. Idempotency-Key처럼 CSRF 재시도에서도 같은 값이 다시 나가야 서버가 재생으로 인식하므로 send가 매번 options에서 다시 읽음
   */
  ifMatchVersion?: string;
}

/**
 * 기준 경로와 쿼리로 URL 생성. null·undefined·빈 문자열 값은 생략
 */
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

/**
 * 성공 응답 본문 해석
 *
 * @returns JSON 본문. 204·길이 0·JSON이 아닌 응답은 undefined
 */
async function parseOk<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return undefined as T;
  return (await response.json()) as T;
}

/**
 * CSRF 토큰이 필요한 변경 메서드
 */
const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * readOnlyPost를 허용하는 유일한 경로. 공개 연락처 조회(POST /public/family-bookings/lookup)
 *
 * 쿼리·경로 변형을 포함해 다른 어떤 경로도 세션·CSRF 없는 경계를 탈 수 없도록 apiRequest가 fetch 전에 동기적으로 거부
 */
const READ_ONLY_POST_PATH = "/public/family-bookings/lookup";

/**
 * 계약을 따르는 단일 API 호출 지점
 *
 * 변경 요청에는 X-CSRF-Token을 붙이고, CSRF 만료로 403이 오면 토큰을 한 번만 새로 받아 재시도
 * 재시도에도 Idempotency-Key를 그대로 유지해 서버가 재생으로 인식하게 함
 * 관리자 경로의 401은 관리자 세션 만료 이벤트를 발생시킨 뒤 오류를 던짐
 *
 * @throws {TypeError} readOnlyPost 오용
 * @throws {ApiError} HTTP 오류·네트워크 오류
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const url = buildUrl(path, options.query);
  const readOnlyPost = options.readOnlyPost === true;
  if (readOnlyPost && method !== "POST") {
    throw new TypeError("readOnlyPost is only valid for POST requests.");
  }
  // 세션·CSRF 없는 경계는 정확히 한 경로에만 엶. 다른 POST 경로, 쿼리가 붙은 경로, 경로 조작은 fetch·CSRF 전에 프로그래머 오류로 거부
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
  // CSRF 재시도를 포함한 모든 재시도가 이 키를 그대로 다시 보냄
  const idempotencyKey = options.idempotencyKey;
  // FormData 본문(포스터 업로드)은 브라우저가 multipart 경계를 채우도록 Content-Type을 설정하지 않음
  // 본문은 시도마다 같아 한 번만 판정. CSRF 재시도도 같은 본문을 다시 싣고, fetch가 시도마다 새로 직렬화하므로 재전송 안전
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;

  // 요청 1회 전송. 헤더는 시도마다 options에서 다시 구성
  const send = async (csrfToken: string | null): Promise<Response> => {
    const headers = new Headers({ Accept: "application/json" });
    // JSON 본문에만 Content-Type 설정. FormData는 브라우저가 경계까지 채움
    if (options.body !== undefined && !isFormDataBody) headers.set("Content-Type", "application/json");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    // If-Match는 CSRF 재시도에서도 같은 값이 나가도록 여기서 설정
    if (options.ifMatchVersion) headers.set("If-Match", options.ifMatchVersion);
    // 비밀 값은 요청 헤더에만 싣고 어디에도 남기지 않음
    if (options.bookingProof) headers.set("X-Booking-Proof", options.bookingProof);

    return runFetch(url, {
      method,
      headers,
      // 공개 조회 POST는 관리자·예약 링크 세션 쿠키에 기대지 않으므로 보내지 않음
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

  // CSRF 실패 403이면 토큰을 다시 받아 한 번만 재시도
  if (needsCsrf && response.status === 403) {
    const error = await toApiError(response.clone());
    if (isCsrfFailure(error)) {
      resetCsrfToken();
      response = await send(await getCsrfToken(options.signal));
    }
  }

  // 관리자 경로 401은 세션 만료 이벤트를 알린 뒤 오류로 변환
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/admin/") && typeof window !== "undefined") {
      window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    }
    throw await toApiError(response);
  }
  return parseOk<T>(response);
}

/**
 * 403이 CSRF 실패인지 판단. 실제 권한 부족은 재시도하지 않음
 */
function isCsrfFailure(error: ApiError): boolean {
  return error.code.includes("CSRF");
}

// 바이너리 내려받기(명단 roster.xlsx 등)
// apiRequest는 JSON만 해석하므로 XLSX 같은 바이너리 응답은 GET 전용 내려받기 경로로 Blob을 받음
// 상태 변경이 아니라 CSRF를 붙이지 않음. 파일명은 Content-Disposition에서 원문만 해석하고 안전 판정과 대체 이름은 호출부 어댑터가 결정
// 명단 XLSX는 전체 연락처를 담은 관리자 전용 민감 데이터라 Blob 내용을 로깅하지 않음

/**
 * 바이너리 내려받기 결과
 */
export interface BinaryDownload {
  /**
   * 파일 내용
   */
  blob: Blob;

  /**
   * Content-Disposition 파일명 원문(디코딩만 함). 없으면 null
   */
  filename: string | null;

  /**
   * 응답 Content-Type. 없으면 null
   */
  contentType: string | null;
}

/**
 * 바이너리 내려받기 옵션
 */
export interface ApiDownloadOptions {
  /**
   * 쿼리 값
   */
  query?: ApiRequestOptions["query"];

  /**
   * 취소 신호
   */
  signal?: AbortSignal;

  /**
   * 기대하는 바이너리 형식의 Accept 헤더. 생략하면 application/octet-stream
   */
  accept?: string;
}

/**
 * 계약을 따르는 단일 바이너리 GET 지점. 같은 출처 `/api/v1`만 호출
 *
 * @throws {ApiError} HTTP 오류·네트워크 오류. 관리자 경로 401은 세션 만료 이벤트 발생
 */
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
 * Content-Disposition 파일명 해석
 *
 * 비ASCII 이름을 담는 RFC 5987 `filename*=UTF-8''<퍼센트 인코딩>`을 먼저 보고, 없으면 따옴표 있는·없는 `filename=` 사용
 * 원문만 반환. 경로 구분자·확장자 검사 같은 안전 판정과 대체 이름은 내려받기마다 규칙이 달라 어댑터가 결정
 *
 * @returns 파일명. 없거나 디코딩 실패면 지어내지 않고 null
 */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (header === null) return null;

  // RFC 5987 filename*=UTF-8''... 우선. 비ASCII를 담는 정식 위치
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(header);
  if (extended?.[1] !== undefined) {
    try {
      const decoded = decodeURIComponent(extended[1].trim());
      if (decoded !== "") return decoded;
    } catch {
            // 디코딩 실패면 아래 일반 filename=으로 넘어감
    }
  }

  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  if (quoted?.[1] !== undefined) return quoted[1].trim() === "" ? null : quoted[1].trim();

  // 따옴표 없는 filename=(세미콜론 전까지). filename*=는 위에서 처리함
  const bare = /filename\s*=\s*([^;"]+)/i.exec(header);
  if (bare?.[1] !== undefined) {
    const value = bare[1].trim();
    if (value !== "") return value;
  }

  return null;
}
