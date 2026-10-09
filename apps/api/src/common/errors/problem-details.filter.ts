import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DomainError } from "./domain-error.js";

/**
 * 필터가 쓰는 Express 응답 최소 형태
 */
interface ProblemResponse {
  /**
   * 상태 코드 설정
   */
  status(statusCode: number): ProblemResponse;

  /**
   * Content-Type 설정
   */
  type(contentType: string): ProblemResponse;

  /**
   * 본문 전송
   */
  send(body: unknown): void;
}

/**
 * 모든 예외를 RFC 9457 problem+json 응답으로 변환하는 전역 필터
 *
 * 5xx는 내부 메시지를 숨기고 고정 문구 반환. traceId는 x-request-id(최대 128자) 또는 새 UUID
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  /**
   * 5xx 원인 기록용 로거
   */
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  /**
   * 예외를 상태·코드·상세로 분류해 응답
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{
      originalUrl?: string;
      method?: string;
      headers?: Record<string, string | undefined>;
    }>();
    const response = http.getResponse<ProblemResponse>();
    const traceId = request.headers?.["x-request-id"]?.slice(0, 128) ?? randomUUID();
    // 상태·코드 결정: DomainError 우선, Nest HttpException, 그 외 500
    const status = exception instanceof DomainError
      ? exception.status
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = exception instanceof DomainError
      ? exception.code
      : exception instanceof HttpException
        ? "HTTP_REQUEST_REJECTED"
        : "INTERNAL_ERROR";
    const detail = status >= 500
      ? "The server could not complete the request."
      : exception instanceof Error
        ? exception.message
        : "The request could not be completed.";
    // 5xx는 반드시 기록함. 응답 본문은 고정 문구라 여기서 남기지 않으면 원인을 알 수 없음
    // 4xx는 정상 거절이고 본문에 이유가 있어 기록하지 않음
    // traceId·메서드·경로·스택만 기록. 요청 본문·헤더·쿼리는 개인정보·비밀 값이 지나므로 남기지 않음
    if (status >= 500) {
      const method = request.method ?? "?";
      const path = this.pathname(request.originalUrl);
      this.logger.error(
        `${method} ${path} → ${status} ${code} (traceId=${traceId})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).type("application/problem+json").send({
      type: `https://npr-seminar.invalid/problems/${code.toLowerCase()}`,
      title: code.replaceAll("_", " "),
      status,
      detail,
      instance: this.pathname(request.originalUrl),
      code,
      traceId,
    });
  }

  /**
   * 쿼리 제거한 경로
   *
   * URL 해석 실패 시 `?` 앞부분, 값이 없으면 빈 문자열
   */
  private pathname(value: string | undefined): string {
    if (value === undefined) return "";
    try { return new URL(value, "http://redacted.invalid").pathname; } catch { return value.split("?", 1)[0] ?? ""; }
  }
}
