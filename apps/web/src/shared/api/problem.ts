/**
 * RFC 9457 problem+json 정규화 (계약 components/schemas/Problem).
 *
 * 네트워크 실패·비정상 응답·problem 응답을 하나의 ApiError로 좁혀서
 * 화면이 status/code만 보고 분기할 수 있게 한다. 서버 detail은 영어라
 * 화면에 그대로 쓰지 않고, 각 기능이 code에 맞는 한국어 문구를 고른다.
 */

export interface ProblemFieldError {
  field: string;
  code: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string;
  errors?: ProblemFieldError[];
}

export type ApiErrorKind =
  /** 요청 자체가 나가지 못했거나 응답을 받지 못함 */
  | "network"
  /** 호출자가 AbortSignal로 취소 */
  | "aborted"
  /** problem+json 을 받은 정상적인 도메인 실패 */
  | "problem"
  /** HTTP 오류지만 problem+json 이 아님 (프록시·게이트웨이 등) */
  | "unexpected";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly problem: Problem | null;
  readonly traceId: string | null;

  constructor(init: {
    kind: ApiErrorKind;
    status: number;
    code: string;
    message: string;
    problem?: Problem | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.problem = init.problem ?? null;
    this.traceId = init.problem?.traceId ?? null;
  }

  get fieldErrors(): ProblemFieldError[] {
    return this.problem?.errors ?? [];
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** 호출자가 취소한 요청 — 화면에 오류로 띄우면 안 된다. */
export function isAborted(error: unknown): boolean {
  return isApiError(error) ? error.kind === "aborted" : error instanceof DOMException && error.name === "AbortError";
}

function isProblemShape(value: unknown): value is Problem {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.status === "number" && typeof candidate.code === "string" && typeof candidate.title === "string";
}

/** problem+json 이면 그대로, 아니면 status만 살린 unexpected 로 좁힌다. */
export async function toApiError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/problem+json")) {
    try {
      const body: unknown = await response.json();
      if (isProblemShape(body)) {
        return new ApiError({
          kind: "problem",
          status: body.status,
          code: body.code,
          message: body.title,
          problem: body,
        });
      }
    } catch {
      // problem 본문이 깨졌으면 아래 unexpected 로 떨어뜨린다.
    }
  }

  return new ApiError({
    kind: "unexpected",
    status: response.status,
    code: `HTTP_${response.status}`,
    message: `요청이 실패했어요. (HTTP ${response.status})`,
  });
}

/** 어떤 실패든 화면에 바로 쓸 수 있는 한국어 기본 문구. 기능별 code 분기가 우선한다. */
export function defaultErrorMessage(error: unknown): string {
  if (!isApiError(error)) return "알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";

  switch (error.kind) {
    case "aborted":
      return "요청이 취소됐어요.";
    case "network":
      return "네트워크에 연결할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
    default:
      break;
  }

  switch (error.status) {
    case 400:
      return "입력값을 다시 확인해 주세요.";
    case 401:
      return "인증이 만료됐어요. 다시 로그인해 주세요.";
    case 403:
      return "권한이 없어요.";
    case 404:
      return "대상을 찾을 수 없어요.";
    case 409:
      return "다른 작업과 충돌했어요. 새로고침한 뒤 다시 시도해 주세요.";
    case 410:
      return "만료된 요청이에요.";
    case 429:
      return "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
    case 503:
      return "서버가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요.";
    default:
      return "요청이 실패했어요. 잠시 후 다시 시도해 주세요.";
  }
}
