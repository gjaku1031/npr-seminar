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

interface ProblemResponse {
  status(statusCode: number): ProblemResponse;
  type(contentType: string): ProblemResponse;
  send(body: unknown): void;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{
      originalUrl?: string;
      method?: string;
      headers?: Record<string, string | undefined>;
    }>();
    const response = http.getResponse<ProblemResponse>();
    const traceId = request.headers?.["x-request-id"]?.slice(0, 128) ?? randomUUID();
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
    /**
     * 5xx 는 **반드시 남긴다.** 응답 본문은 의도적으로 "The server could not complete the
     * request." 한 줄이라, 여기서 기록하지 않으면 운영에서 일어난 500 의 원인을 알 방법이
     * 아예 없다. 4xx 는 정상적인 거절이므로 남기지 않는다(잡음이 되고 본문에 이유가 있다).
     *
     * 남기는 것은 traceId·메서드·경로·스택뿐이다. 요청 본문·헤더·쿼리는 개인정보와 시크릿이
     * 지나는 자리라 절대 싣지 않는다.
     */
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

  private pathname(value: string | undefined): string {
    if (value === undefined) return "";
    try { return new URL(value, "http://redacted.invalid").pathname; } catch { return value.split("?", 1)[0] ?? ""; }
  }
}
