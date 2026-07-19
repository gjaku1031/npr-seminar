import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { type Request } from "express";
import type { AppEnvironment } from "../config/environment.js";
import { DomainError } from "../errors/domain-error.js";
import { effectiveRequestOrigin } from "../http/effective-origin.js";

@Injectable()
export class CsrfGuard implements CanActivate {
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // A bodyless unsafe request (for example the OpenAPI-documented scanner
    // DELETE endpoints) has no media type to validate.  Requiring a
    // Content-Type header for it rejects otherwise valid browser requests
    // before the origin and CSRF-token checks can run.  Requests that actually
    // carry bytes remain JSON-only.
    if (this.hasBody(request) && !request.is("application/json")) {
      throw new DomainError(415, "JSON_REQUIRED", "JSON content type is required.");
    }
    const origin = request.get("origin");
    const expected = this.expectedOrigin();
    const effective = effectiveRequestOrigin(request, this.environment);
    if (origin !== expected || effective !== expected) {
      throw new DomainError(403, "CSRF_ORIGIN_INVALID", "The request origin is invalid.");
    }
    const supplied = request.get("x-csrf-token");
    const expectedToken = request.session.csrfToken;
    if (supplied === undefined || expectedToken === undefined) this.invalid();
    const left = Buffer.from(supplied, "utf8");
    const right = Buffer.from(expectedToken, "utf8");
    if (left.length !== right.length || !timingSafeEqual(left, right)) this.invalid();
    return true;
  }

  private expectedOrigin(): string {
    if (this.environment.publicBaseUrl === undefined) {
      throw new DomainError(503, "PUBLIC_ORIGIN_NOT_CONFIGURED", "The public request origin is not configured.");
    }
    return new URL(this.environment.publicBaseUrl).origin;
  }

  private hasBody(request: Request): boolean {
    if (request.get("transfer-encoding") !== undefined) return true;
    const contentLength = request.get("content-length");
    if (contentLength !== undefined) {
      // Treat malformed lengths as body-bearing so they fail closed at the
      // JSON media-type check or the HTTP parser.
      return !/^(?:0|[1-9][0-9]*)$/u.test(contentLength) || contentLength !== "0";
    }
    return false;
  }

  private invalid(): never {
    throw new DomainError(403, "CSRF_INVALID", "The CSRF token is invalid.");
  }
}
