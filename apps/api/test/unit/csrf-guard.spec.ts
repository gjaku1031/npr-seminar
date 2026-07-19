import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { CsrfGuard } from "../../src/common/auth/csrf.guard.js";
import type { AppEnvironment } from "../../src/common/config/environment.js";

const publicOrigin = "https://npr-survey.example.com";
const csrfToken = "csrf-token-for-unit-test";
const environment = {
  publicBaseUrl: publicOrigin,
  trustProxy: 1,
} as AppEnvironment;

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

describe("CsrfGuard body media type", () => {
  it("accepts a bodyless DELETE-style request without a Content-Type after CSRF validation", () => {
    expect(new CsrfGuard(environment).canActivate(context())).toBe(true);
    expect(new CsrfGuard(environment).canActivate(context({ "content-length": "0" }))).toBe(true);
  });

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

  it("accepts a non-empty JSON request", () => {
    expect(new CsrfGuard(environment).canActivate(context({
      "content-length": "2",
      "content-type": "application/json; charset=utf-8",
    }))).toBe(true);
  });
});
