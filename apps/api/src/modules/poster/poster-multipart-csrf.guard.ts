import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { effectiveRequestOrigin } from "../../common/http/effective-origin.js";

/**
 * 포스터 업로드 전용 CSRF 가드
 *
 * 일반 CsrfGuard는 JSON만 허용하므로 multipart/form-data 요청을 따로 검사
 * 출처 일치와 x-csrf-token 상수 시간 비교는 CsrfGuard와 같음
 */
@Injectable()
export class PosterMultipartCsrfGuard implements CanActivate {
  /**
   * 실행 환경 주입. 공개 기준 URL과 신뢰 프록시 설정을 읽음
   */
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  /**
   * multipart 형식·출처·CSRF 토큰 확인
   *
   * @throws {DomainError} 415 multipart 아님, 403 출처·토큰 불일치, 503 공개 출처 미설정
   */
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

  /**
   * CSRF 토큰 불일치 오류 발생
   *
   * @throws {DomainError} 403 CSRF_INVALID
   */
  private invalid(): never {
    throw new DomainError(403, "CSRF_INVALID", "The CSRF token is invalid.");
  }
}
