// RFC 9457 problem+json 정규화(계약 components/schemas/Problem)
// 네트워크 실패·비정상 응답·problem 응답을 하나의 ApiError로 좁혀 화면이 status·code로만 분기하게 함
// 서버 detail은 영어라 화면에 그대로 쓰지 않고 각 기능이 code에 맞는 한국어 문구를 고름

/**
 * 필드별 검증 오류
 */
export interface ProblemFieldError {
  /**
   * 필드 이름
   */
  field: string;

  /**
   * 오류 코드
   */
  code: string;
}

/**
 * problem+json 본문
 */
export interface Problem {
  /**
   * 문제 유형 URI
   */
  type: string;

  /**
   * 제목
   */
  title: string;

  /**
   * HTTP 상태
   */
  status: number;

  /**
   * 상세(영어)
   */
  detail: string;

  /**
   * 요청 경로
   */
  instance: string;

  /**
   * 안정 오류 코드
   */
  code: string;

  /**
   * 서버 로그 추적 ID
   */
  traceId: string;

  /**
   * 필드별 오류
   */
  errors?: ProblemFieldError[];
}

/**
 * API 오류 종류
 */
export type ApiErrorKind =

  /**
   * 요청이 나가지 못했거나 응답을 받지 못함
   */
  | "network"

  /**
   * 호출자가 AbortSignal로 취소
   */
  | "aborted"

  /**
   * problem+json을 받은 정상적인 도메인 실패
   */
  | "problem"

  /**
   * problem+json이 아닌 HTTP 오류(프록시·게이트웨이 등)
   */
  | "unexpected";

/**
 * 화면이 분기에 쓰는 API 오류
 */
export class ApiError extends Error {
  /**
   * 오류 종류
   */
  readonly kind: ApiErrorKind;

  /**
   * HTTP 상태. 네트워크·취소는 0
   */
  readonly status: number;

  /**
   * 오류 코드
   */
  readonly code: string;

  /**
   * 원본 problem 본문. 없으면 null
   */
  readonly problem: Problem | null;

  /**
   * 추적 ID. problem이 없으면 null
   */
  readonly traceId: string | null;

  /**
   * 종류·상태·코드·문구와 선택 problem 본문으로 생성
   */
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

  /**
   * 필드별 검증 오류. 없으면 빈 배열
   */
  get fieldErrors(): ProblemFieldError[] {
    return this.problem?.errors ?? [];
  }
}

/**
 * ApiError 여부
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * 호출자가 취소한 요청 여부. 화면에 오류로 표시하면 안 됨
 */
export function isAborted(error: unknown): boolean {
  return isApiError(error) ? error.kind === "aborted" : error instanceof DOMException && error.name === "AbortError";
}

/**
 * status·code·title을 가진 problem 형태인지 여부
 */
function isProblemShape(value: unknown): value is Problem {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.status === "number" && typeof candidate.code === "string" && typeof candidate.title === "string";
}

/**
 * 응답을 ApiError로 변환. problem+json이면 그대로, 아니면 상태만 살린 unexpected
 */
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
            // problem 본문이 깨졌으면 아래 unexpected로 처리
    }
  }

  return new ApiError({
    kind: "unexpected",
    status: response.status,
    code: `HTTP_${response.status}`,
    message: `요청이 실패했습니다. (HTTP ${response.status})`,
  });
}

/**
 * 화면에 바로 쓸 수 있는 한국어 기본 오류 문구. 기능별 code 분기가 우선
 */
export function defaultErrorMessage(error: unknown): string {
  if (!isApiError(error)) return "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

  switch (error.kind) {
    case "aborted":
      return "요청이 취소되었습니다.";
    case "network":
      return "네트워크에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
    default:
      break;
  }

  switch (error.status) {
    case 400:
      return "입력값을 다시 확인해 주세요.";
    case 401:
      return "인증이 만료되었습니다. 다시 로그인해 주세요.";
    case 403:
      return "권한이 없습니다.";
    case 404:
      return "대상을 찾을 수 없습니다.";
    case 409:
      return "다른 작업과 충돌했습니다. 새로고침한 뒤 다시 시도해 주세요.";
    case 410:
      return "만료된 요청입니다.";
    case 429:
      return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    case 503:
      return "서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "요청이 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}
