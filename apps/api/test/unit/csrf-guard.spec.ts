import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { CsrfGuard } from "../../src/common/auth/csrf.guard.js";
import type { AppEnvironment } from "../../src/common/config/environment.js";

/**
 * 테스트 공개 기준 출처
 */
const publicOrigin = "https://npr-survey.example.com";

/**
 * 세션 CSRF 토큰
 */
const csrfToken = "csrf-token-for-unit-test";

/**
 * 신뢰 프록시 1단계 실행 환경
 */
const environment = {
  publicBaseUrl: publicOrigin,
  trustProxy: 1,
} as AppEnvironment;

/**
 * 신뢰 프록시를 거친 정상 CSRF 요청 컨텍스트
 *
 * @param extraHeaders 기본 헤더에 덮어쓸 헤더
 */
function context(extraHeaders: Record<string, string> = {}): ExecutionContext {
  const headers = new Map(Object.entries({
    host: "127.0.0.1:4000",
    origin: publicOrigin,
    "x-forwarded-host": "npr-survey.example.com",
    "x-forwarded-proto": "https",
    "x-forwarded-for": "198.51.100.10",
    "x-csrf-token": csrfToken,
    ...extraHeaders,
  }).map(([key, value]) => [key.toLowerCase(), value]));
  const request = {
    protocol: "http",
    get: (name: string) => headers.get(name.toLowerCase()),
    is: (type: string) => type === "application/json"
      && headers.get("content-type")?.startsWith("application/json") === true,
    socket: { remoteAddress: "127.0.0.1" },
    session: { csrfToken },
  } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

// 본문 유무에 따른 미디어 타입 검사
describe("CsrfGuard body media type", () => {
  // 본문 없는 DELETE 형태 요청은 Content-Type 없이도 출처·토큰 검사 후 통과
  it("accepts a bodyless DELETE-style request without a Content-Type after CSRF validation", () => {
    expect(new CsrfGuard(environment).canActivate(context())).toBe(true);
    expect(new CsrfGuard(environment).canActivate(context({ "content-length": "0" }))).toBe(true);
  });

  // 고정 길이·chunked 본문이 JSON이 아니면 415 JSON_REQUIRED
  it("continues to reject a non-empty non-JSON request", () => {
    let fixedLengthError: unknown;
    try {
      new CsrfGuard(environment).canActivate(context({
        "content-length": "2",
        "content-type": "text/plain",
      }));
    } catch (error) {
      fixedLengthError = error;
    }
    expect(fixedLengthError).toMatchObject({ status: 415, code: "JSON_REQUIRED" });

    let chunkedError: unknown;
    try {
      new CsrfGuard(environment).canActivate(context({
        "transfer-encoding": "chunked",
        "content-type": "text/plain",
      }));
    } catch (error) {
      chunkedError = error;
    }
    expect(chunkedError).toMatchObject({ status: 415, code: "JSON_REQUIRED" });
  });

  // 본문이 있는 JSON 요청은 통과
  it("accepts a non-empty JSON request", () => {
    expect(new CsrfGuard(environment).canActivate(context({
      "content-length": "2",
      "content-type": "application/json; charset=utf-8",
    }))).toBe(true);
  });
});
