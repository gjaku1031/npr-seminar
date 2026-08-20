/**
 * 회차 어댑터의 **정규화 심장**만 값으로 확인한다 (node:test + tsx).
 * fetch 를 타는 목록 함수는 훅·통합에서 다루고, 여기서는 목록 항목의 operationsSummary 를
 * 서버 원시 필드명(…BookingCount)에서 화면 이름(…Count)으로 옮기는 규칙만 본다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  normalizeAdminSeminarSession,
  normalizeSessionOperationsSummary,
  updateAdminSeminarSession,
} from "./admin-seminars";
import { resetCsrfToken } from "./client";
import type { AdminSeminarSession } from "./contract";

describe("normalizeSessionOperationsSummary — 서버 …BookingCount 를 화면 …Count 로 옮긴다", () => {
  it("다섯 건수를 이름만 바꿔 그대로 실어 준다(값 계산 없음)", () => {
    const summary = normalizeSessionOperationsSummary({
      activeBookingCount: 18,
      checkedInBookingCount: 7,
      uncheckedBookingCount: 11,
      cancelledBookingCount: 4,
      noShowBookingCount: 2,
      attendedPeopleCount: 0,
    });
    assert.deepEqual(summary, {
      activeCount: 18,
      checkedInCount: 7,
      uncheckedCount: 11,
      cancelledCount: 4,
      noShowCount: 2,
      attendedPeopleCount: 0,
    });
  });

  it("집계가 없으면(방어 경로) 0 으로 채운다 — 좌석 원장 근사를 만들지 않는다", () => {
    assert.deepEqual(normalizeSessionOperationsSummary(undefined), {
      activeCount: 0,
      checkedInCount: 0,
      uncheckedCount: 0,
      cancelledCount: 0,
      noShowCount: 0,
      attendedPeopleCount: 0,
    });
  });
});

describe("normalizeAdminSeminarSession — operationsSummary 만 정규화하고 나머지는 보존한다", () => {
  const rawBase = {
    seminarSessionId: "sess-1",
    seminarId: "sem-1",
    scope: "ALL" as const,
    branch: null,
    startsAt: "2026-08-21T01:00:00.000Z",
    endsAt: "2026-08-21T03:00:00.000Z",
    location: "서울시 교통회관 (올림픽로 319)",
    bookingOpensAt: "2026-08-01T00:00:00.000Z",
    bookingClosesAt: "2026-08-20T00:00:00.000Z",
    status: "OPEN" as const,
    guestBookingEnabled: false,
    version: 5,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };

  it("항목마다 자기 operationsSummary 를 화면 이름으로 준다", () => {
    const session = normalizeAdminSeminarSession({
      ...rawBase,
      operationsSummary: {
        activeBookingCount: 130,
        checkedInBookingCount: 40,
        uncheckedBookingCount: 90,
        cancelledBookingCount: 6,
        noShowBookingCount: 3,
        attendedPeopleCount: 0,
      },
    });
    assert.equal(session.operationsSummary.activeCount, 130);
    assert.equal(session.operationsSummary.uncheckedCount, 90);
    // 나머지 필드는 그대로 보존된다.
    assert.equal(session.seminarSessionId, "sess-1");
    assert.equal(session.status, "OPEN");
  });
});

describe("updateAdminSeminarSession — 비재원생 토글 PATCH", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetCsrfToken();
  });

  const patchResponse: AdminSeminarSession = {
    seminarSessionId: "sess-9",
    seminarId: "sem-1",
    scope: "BRANCH",
    branch: "CAMPUS_A",
    startsAt: "2026-08-21T01:00:00.000Z",
    endsAt: "2026-08-21T03:00:00.000Z",
    location: "서울시 교통회관 (올림픽로 319)",
    bookingOpensAt: "2026-08-01T00:00:00.000Z",
    bookingClosesAt: "2026-08-20T00:00:00.000Z",
    status: "OPEN",
    guestBookingEnabled: true,
    operationsSummary: { activeCount: 0, checkedInCount: 0, uncheckedCount: 0, cancelledCount: 0, noShowCount: 0, attendedPeopleCount: 0 },
    version: 4,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };

  function serve(): { url: string | null; method: string | null; body: string | null; idempotencyKey: string | null } {
    const captured = { url: null as string | null, method: null as string | null, body: null as string | null, idempotencyKey: null as string | null };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        return new Response(JSON.stringify({ csrfToken: "t", expiresAt: "2999-01-01T00:00:00.000Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      captured.url = url;
      captured.method = init?.method ?? null;
      captured.body = typeof init?.body === "string" ? init.body : null;
      captured.idempotencyKey = new Headers(init?.headers).get("Idempotency-Key");
      return new Response(JSON.stringify(patchResponse), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return captured;
  }

  it("정확한 경로·본문(guestBookingEnabled+expectedVersion)·멱등 키로 PATCH 한다", async () => {
    const captured = serve();

    const result = await updateAdminSeminarSession(
      "sess-9",
      { guestBookingEnabled: true, expectedVersion: 4 },
      { idempotencyKey: "op-toggle-1" },
    );

    assert.equal(captured.method, "PATCH");
    assert.equal(captured.url?.endsWith("/admin/seminar-sessions/sess-9"), true);
    assert.deepEqual(JSON.parse(captured.body!), { guestBookingEnabled: true, expectedVersion: 4 });
    assert.equal(captured.idempotencyKey, "op-toggle-1");
    // 응답 guestBookingEnabled 를 그대로 보존한다.
    assert.equal(result.guestBookingEnabled, true);
  });
});
