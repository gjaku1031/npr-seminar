import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { effectiveRequestOrigin } from "../../common/http/effective-origin.js";

@Injectable()
export class PosterMultipartCsrfGuard implements CanActivate {
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.is("multipart/form-data")) {
      throw new DomainError(415, "POSTER_MULTIPART_REQUIRED", "A multipart/form-data upload is required.");
    }
    const expected = this.expectedOrigin();
    if (request.get("origin") !== expected || effectiveRequestOrigin(request, this.environment) !== expected) {
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

  private invalid(): never {
    throw new DomainError(403, "CSRF_INVALID", "The CSRF token is invalid.");
  }
}
