/**
 * 예약 관리 URL·클립보드 조정 순수 테스트 (node:test + tsx).
 *
 * ⚠️ 이 테스트는 클라이언트 QR 컴포넌트를 import 하지 않는다 — 순수 헬퍼만 본다 (server 존 안전).
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBookingManagementUrl, copyManagementUrl } from "./booking-management-url";

describe("buildBookingManagementUrl — 안전한 관리 URL 만 만든다", () => {
  it("오리진 + /booking/{id} 절대 URL 을 만든다", () => {
    assert.equal(
      buildBookingManagementUrl("https://npr.example", "fb-123"),
      "https://npr.example/booking/fb-123",
    );
  });

  it("familyBookingId 를 encodeURIComponent 로 이스케이프한다", () => {
    assert.equal(
      buildBookingManagementUrl("https://npr.example", "fb/1 2?x#y"),
      "https://npr.example/booking/fb%2F1%202%3Fx%23y",
    );
  });

  it("query 도 hash 도 붙지 않는다", () => {
    const url = buildBookingManagementUrl("https://npr.example", "fb-123");
    assert.equal(url.includes("?"), false);
    assert.equal(url.includes("#"), false);
  });

  it("입력값을 변형하지 않는다", () => {
    const origin = "https://npr.example";
    const id = "fb-123";
    buildBookingManagementUrl(origin, id);
    assert.equal(origin, "https://npr.example");
    assert.equal(id, "fb-123");
  });
});

describe("copyManagementUrl — 1차/폴백 조정", () => {
  const URL = "https://npr.example/booking/fb-123";

  it("1차 성공 시 정확한 관리 URL 을 받고 폴백은 부르지 않는다", async () => {
    let primaryArg: string | undefined;
    let fallbackCalled = false;
    const ok = await copyManagementUrl(URL, {
      primary: async (text) => {
        primaryArg = text;
      },
      fallback: () => {
        fallbackCalled = true;
        return true;
      },
    });
    assert.equal(ok, true);
    assert.equal(primaryArg, URL);
    assert.equal(fallbackCalled, false);
  });

  it("1차 reject 시 정확한 URL 로 폴백을 시도한다", async () => {
    let fallbackArg: string | undefined;
    const ok = await copyManagementUrl(URL, {
      primary: async () => {
        throw new Error("denied");
      },
      fallback: (text) => {
        fallbackArg = text;
        return true;
      },
    });
    assert.equal(ok, true);
    assert.equal(fallbackArg, URL);
  });

  it("1차 부재(불가) 시 정확한 URL 로 폴백을 시도한다", async () => {
    let fallbackArg: string | undefined;
    const ok = await copyManagementUrl(URL, {
      fallback: (text) => {
        fallbackArg = text;
        return true;
      },
    });
    assert.equal(ok, true);
    assert.equal(fallbackArg, URL);
  });

  it("둘 다 실패하면 false 를 돌려준다 (컴포넌트가 오류를 띄우게)", async () => {
    const ok = await copyManagementUrl(URL, {
      primary: async () => {
        throw new Error("denied");
      },
      fallback: () => false,
    });
    assert.equal(ok, false);
  });

  it("폴백이 던져도 false 로 삼킨다", async () => {
    const ok = await copyManagementUrl(URL, {
      primary: async () => {
        throw new Error("denied");
      },
      fallback: () => {
        throw new Error("dom gone");
      },
    });
    assert.equal(ok, false);
  });
});
