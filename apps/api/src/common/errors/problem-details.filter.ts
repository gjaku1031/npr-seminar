import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
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
  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ originalUrl?: string; headers?: Record<string, string | undefined> }>();
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
