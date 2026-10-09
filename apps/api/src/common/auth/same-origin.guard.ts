import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { AppEnvironment } from "../config/environment.js";
import { DomainError } from "../errors/domain-error.js";
import { effectiveRequestOrigin } from "../http/effective-origin.js";

/**
 * 세션 없는 공개 변경 요청의 동일 출처 가드
 *
 * CSRF 토큰 대신 JSON 미디어 타입과 Origin 일치만 확인. 본문 없는 요청도 JSON 필수
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  /**
   * 실행 환경 주입. 공개 기준 URL과 신뢰 프록시 설정을 읽음
   */
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  /**
   * JSON 미디어 타입과 출처 일치 확인
   *
   * @throws {DomainError} 415 JSON 아님, 403 출처 불일치, 503 공개 출처 미설정
   */
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

  /**
   * 공개 기준 URL의 출처
   *
   * @throws {DomainError} 503 공개 기준 URL 미설정 시
   */
  private expectedOrigin(): string {
    if (this.environment.publicBaseUrl === undefined) {
      throw new DomainError(503, "PUBLIC_ORIGIN_NOT_CONFIGURED", "The public request origin is not configured.");
    }
    return new URL(this.environment.publicBaseUrl).origin;
  }
}
