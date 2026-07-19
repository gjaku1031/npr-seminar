import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { AppEnvironment } from "../config/environment.js";
import { DomainError } from "../errors/domain-error.js";
import { effectiveRequestOrigin } from "../http/effective-origin.js";

@Injectable()
export class SameOriginGuard implements CanActivate {
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.is("application/json")) throw new DomainError(415, "JSON_REQUIRED", "JSON content type is required.");
    const expected = this.expectedOrigin();
    const supplied = request.get("origin");
    const effective = effectiveRequestOrigin(request, this.environment);
    if (supplied !== expected || effective !== expected) {
      throw new DomainError(403, "ORIGIN_INVALID", "The request origin is invalid.");
    }
    return true;
  }

  private expectedOrigin(): string {
    if (this.environment.publicBaseUrl === undefined) {
      throw new DomainError(503, "PUBLIC_ORIGIN_NOT_CONFIGURED", "The public request origin is not configured.");
    }
    return new URL(this.environment.publicBaseUrl).origin;
  }
}
