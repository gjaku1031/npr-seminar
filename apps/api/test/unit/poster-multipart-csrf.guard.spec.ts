import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { PosterMultipartCsrfGuard } from "../../src/modules/poster/poster-multipart-csrf.guard.js";

/**
 * 테스트 공개 기준 출처
 */
const origin = "https://seminar.example.test";

/**
 * 세션 CSRF 토큰
 */
const token = "poster-csrf-token";

/**
 * 신뢰 프록시 1단계 실행 환경
 */
const environment = { publicBaseUrl: origin, trustProxy: 1 } as AppEnvironment;

/**
 * 정상 multipart 업로드 요청 컨텍스트
 *
 * @param overrides 덮어쓸 헤더
 */
function context(overrides: Record<string, string> = {}): ExecutionContext {
  const headers = new Map(Object.entries({
    host: "127.0.0.1:4000",
    origin,
    "content-type": "multipart/form-data; boundary=poster-boundary",
    "x-csrf-token": token,
    "x-forwarded-host": "seminar.example.test",
    "x-forwarded-proto": "https",
    "x-forwarded-for": "198.51.100.8",
    ...overrides,
  }).map(([key, value]) => [key.toLowerCase(), value]));
  const request = {
    protocol: "http",
    get: (name: string) => headers.get(name.toLowerCase()),
    is: (type: string) => type === "multipart/form-data"
      && headers.get("content-type")?.startsWith("multipart/form-data") === true,
    socket: { remoteAddress: "127.0.0.1" },
    session: { csrfToken: token },
  } as unknown as Request;
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

// 포스터 업로드 CSRF 가드
describe("PosterMultipartCsrfGuard", () => {
  // 같은 출처 multipart 업로드와 세션 CSRF 토큰만 허용
  it("accepts only same-origin multipart uploads with the session CSRF token", () => {
    expect(new PosterMultipartCsrfGuard(environment).canActivate(context())).toBe(true);
  });

  // JSON 요청, 다른 출처, 잘못된 토큰은 거부
  it("rejects JSON, cross-origin, and invalid-token uploads", () => {
    expect(() => new PosterMultipartCsrfGuard(environment).canActivate(context({
      "content-type": "application/json",
    }))).toThrow(expect.objectContaining({ status: 415, code: "POSTER_MULTIPART_REQUIRED" }));
    expect(() => new PosterMultipartCsrfGuard(environment).canActivate(context({
      origin: "https://attacker.example",
    }))).toThrow(expect.objectContaining({ status: 403, code: "CSRF_ORIGIN_INVALID" }));
    expect(() => new PosterMultipartCsrfGuard(environment).canActivate(context({
      "x-csrf-token": "wrong-token",
    }))).toThrow(expect.objectContaining({ status: 403, code: "CSRF_INVALID" }));
  });
});
