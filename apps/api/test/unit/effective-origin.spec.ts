import type { Request } from "express";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { effectiveRequestOrigin } from "../../src/common/http/effective-origin.js";
import { SameOriginGuard } from "../../src/common/auth/same-origin.guard.js";

/**
 * 신뢰 프록시 1단계 실행 환경
 */
const environment = { trustProxy: 1 } as AppEnvironment;

/**
 * 헤더와 원격 주소를 가진 최소 요청
 *
 * @param remoteAddress 기본 루프백
 */
function request(headers: Record<string, string>, remoteAddress = "127.0.0.1"): Request {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    protocol: "http",
    get: (name: string) => normalized.get(name.toLowerCase()),
    socket: { remoteAddress },
  } as unknown as Request;
}

// 프록시 헤더 기반 실제 요청 출처 계산
describe("effective request origin", () => {
  // 루프백 프록시 1단계의 전달 헤더로 공개 출처 계산
  it("accepts one trusted loopback proxy hop", () => {
    const origin = effectiveRequestOrigin(request({
      host: "127.0.0.1:4000",
      "x-forwarded-host": "pve-release.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-for": "198.51.100.10",
    }), environment);
    expect(origin).toBe("https://pve-release.example.com");
  });

  // 루프백이 아닌 원격 주소, 여러 값이 든 전달 헤더, IP가 아닌 X-Forwarded-For는 null
  it("rejects spoofed untrusted and multi-hop forwarding", () => {
    const headers = {
      host: "127.0.0.1:4000",
      "x-forwarded-host": "pve-release.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-for": "198.51.100.10",
    };
    expect(effectiveRequestOrigin(request(headers, "10.0.0.5"), environment)).toBeNull();
    expect(effectiveRequestOrigin(request({ ...headers, "x-forwarded-host": "pve-release.example.com,evil.example" }), environment)).toBeNull();
    expect(effectiveRequestOrigin(request({ ...headers, "x-forwarded-proto": "https,http" }), environment)).toBeNull();
    expect(effectiveRequestOrigin(request({ ...headers, "x-forwarded-for": "198.51.100.10,127.0.0.1" }), environment)).toBeNull();
    expect(effectiveRequestOrigin(request({ ...headers, "x-forwarded-for": "not-an-ip" }), environment)).toBeNull();
  });

  // 전달 호스트의 명시 포트를 출처에 유지
  it("preserves the explicit forwarded port for exact origin comparison", () => {
    expect(effectiveRequestOrigin(request({
      host: "127.0.0.1:4000", "x-forwarded-host": "pve-release.example.com:8443", "x-forwarded-proto": "https",
    }), environment)).toBe("https://pve-release.example.com:8443");
  });

  // SameOriginGuard는 정확한 공개 출처만 허용하고 포트가 다르면 거부
  it("accepts the exact public origin and rejects a forwarded port mismatch", () => {
    const configured = { ...environment, publicBaseUrl: "https://pve-release.example.com" } as AppEnvironment;
    const guard = new SameOriginGuard(configured);
    const context = (forwardedHost: string) => ({
      switchToHttp: () => ({ getRequest: () => {
        const value = request({
          host: "127.0.0.1:4000", origin: "https://pve-release.example.com",
          "content-type": "application/json", "x-forwarded-host": forwardedHost, "x-forwarded-proto": "https",
          "x-forwarded-for": "198.51.100.10",
        });
        value.is = () => "application/json";
        return value;
      } }),
    }) as unknown as ExecutionContext;
    expect(guard.canActivate(context("pve-release.example.com"))).toBe(true);
    expect(() => guard.canActivate(context("pve-release.example.com:8443"))).toThrowError(/origin is invalid/u);
  });
});
