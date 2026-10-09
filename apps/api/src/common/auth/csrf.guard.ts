import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { type Request } from "express";
import type { AppEnvironment } from "../config/environment.js";
import { DomainError } from "../errors/domain-error.js";
import { effectiveRequestOrigin } from "../http/effective-origin.js";

/**
 * 세션 쿠키 기반 변경 요청의 CSRF 방어 가드
 *
 * 1. 본문이 있으면 JSON 미디어 타입만 허용
 * 2. Origin 헤더와 프록시 반영 실제 요청 출처가 모두 공개 기준 출처와 같은지 확인
 * 3. x-csrf-token 헤더를 세션 토큰과 상수 시간 비교
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  /**
   * 실행 환경 주입. 공개 기준 URL과 신뢰 프록시 설정을 읽음
   */
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  /**
   * 요청 허용 여부 판단
   *
   * @returns 모든 검사를 통과하면 true
   * @throws {DomainError} 415 JSON 아닌 본문, 403 출처·토큰 불일치, 503 공개 출처 미설정
   */
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // 본문 없는 변경 요청(예: 스캐너 DELETE)은 검사할 미디어 타입이 없음
    // Content-Type을 요구하면 정상 브라우저 요청이 출처·토큰 검사 전에 거부되므로 제외
    // 실제 본문이 있는 요청은 JSON만 허용
    if (this.hasBody(request) && !request.is("application/json")) {
      throw new DomainError(415, "JSON_REQUIRED", "JSON content type is required.");
    }
    // Origin 헤더와 프록시 헤더 반영 출처가 모두 공개 기준 출처와 같아야 함
    const origin = request.get("origin");
    const expected = this.expectedOrigin();
    const effective = effectiveRequestOrigin(request, this.environment);
    if (origin !== expected || effective !== expected) {
      throw new DomainError(403, "CSRF_ORIGIN_INVALID", "The request origin is invalid.");
    }
    // 세션 CSRF 토큰과 길이 확인 후 상수 시간 비교. 둘 중 하나라도 없으면 거부
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
   * 요청 본문 존재 여부 판단
   *
   * Transfer-Encoding이 있거나 Content-Length가 0이 아니면 본문 있음
   */
  private hasBody(request: Request): boolean {
    if (request.get("transfer-encoding") !== undefined) return true;
    const contentLength = request.get("content-length");
    if (contentLength !== undefined) {
      // 형식이 잘못된 길이는 본문 있음으로 간주해 JSON 검사나 HTTP 파서에서 거부되게 함
      return !/^(?:0|[1-9][0-9]*)$/u.test(contentLength) || contentLength !== "0";
    }
    return false;
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
