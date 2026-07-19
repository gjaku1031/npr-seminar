import type { Request } from "express";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { effectiveRequestOrigin } from "../../src/common/http/effective-origin.js";
import { SameOriginGuard } from "../../src/common/auth/same-origin.guard.js";

const environment = { trustProxy: 1 } as AppEnvironment;

function request(headers: Record<string, string>, remoteAddress = "127.0.0.1"): Request {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    protocol: "http",
    get: (name: string) => normalized.get(name.toLowerCase()),
    socket: { remoteAddress },
  } as unknown as Request;
}

describe("effective request origin", () => {
  it("accepts one trusted loopback proxy hop", () => {
    const origin = effectiveRequestOrigin(request({
      host: "127.0.0.1:4000",
      "x-forwarded-host": "pve-release.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-for": "198.51.100.10",
    }), environment);
    expect(origin).toBe("https://pve-release.example.com");
  });

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

  it("preserves the explicit forwarded port for exact origin comparison", () => {
    expect(effectiveRequestOrigin(request({
      host: "127.0.0.1:4000", "x-forwarded-host": "pve-release.example.com:8443", "x-forwarded-proto": "https",
    }), environment)).toBe("https://pve-release.example.com:8443");
  });

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
