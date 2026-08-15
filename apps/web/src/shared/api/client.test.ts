/**
 * 바이너리 다운로드 코어 테스트 (node:test + tsx).
 *
 * 여기서 지키려는 것 둘:
 *   1. `parseContentDispositionFilename` 이 RFC5987 을 우선하고, 깨진 인코딩이면 안전하게 물러난다.
 *   2. `apiDownload` 가 GET 으로 same-origin `/api/v1` 을 부르고 Blob·파일명·타입을 돌려준다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { apiDownload, apiRequest, parseContentDispositionFilename, resetCsrfToken } from "./client";

describe("parseContentDispositionFilename", () => {
  it("RFC5987 filename*=UTF-8'' 를 우선해 퍼센트 디코딩한다 (한글)", () => {
    assert.equal(
      parseContentDispositionFilename("attachment; filename=\"fallback.xlsx\"; filename*=UTF-8''%EB%AA%85%EB%8B%A8.xlsx"),
      "명단.xlsx",
    );
  });

  it("filename*= 가 없으면 따옴표 filename= 을 읽는다", () => {
    assert.equal(parseContentDispositionFilename('attachment; filename="roster.xlsx"'), "roster.xlsx");
  });

  it("따옴표 없는 filename= 도 세미콜론 전까지 읽는다", () => {
    assert.equal(parseContentDispositionFilename("attachment; filename=roster.xlsx"), "roster.xlsx");
  });

  it("헤더가 없거나 파일명이 비면 null — 지어내지 않는다", () => {
    assert.equal(parseContentDispositionFilename(null), null);
    assert.equal(parseContentDispositionFilename("attachment"), null);
    assert.equal(parseContentDispositionFilename('attachment; filename=""'), null);
  });

  it("깨진 퍼센트 인코딩이면 평범한 filename= 으로 물러난다", () => {
    assert.equal(
      parseContentDispositionFilename("attachment; filename=\"ok.xlsx\"; filename*=UTF-8''%E0%A4%A.xlsx"),
      "ok.xlsx",
    );
  });
});

describe("apiDownload", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("GET 으로 same-origin /api/v1 을 부르고 Blob·파일명·타입을 돌려준다", async () => {
    const urls: string[] = [];
    const methods: Array<string | undefined> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(typeof input === "string" ? input : input.toString());
      methods.push(init?.method);
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="x.bin"',
        },
      });
    }) as typeof fetch;

    const result = await apiDownload("/admin/thing.bin", { query: { a: "b" } });

    assert.equal(methods[0], "GET");
    const url = new URL(urls[0]!, "https://example.test");
    assert.equal(url.pathname, "/api/v1/admin/thing.bin");
    assert.equal(url.searchParams.get("a"), "b");
    assert.ok(result.blob instanceof Blob);
    assert.equal(result.blob.size, 3);
    assert.equal(result.filename, "x.bin");
    assert.equal(result.contentType, "application/octet-stream");
  });

  it("실패 응답은 ApiError 로 던진다 (Blob 으로 삼키지 않는다)", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: "FORBIDDEN", message: "권한이 없어요." }), {
        status: 403,
        headers: { "content-type": "application/problem+json" },
      })) as typeof fetch;

    await assert.rejects(() => apiDownload("/admin/thing.bin"));
  });
});

/**
 * DELETE 요청의 헤더 배선 — If-Match(낙관적 잠금 version)·Idempotency-Key·X-CSRF-Token 이
 * 함께 나가야 한다. CSRF 만료로 403 을 맞아 토큰을 새로 받아 재시도할 때도 If-Match 와
 * Idempotency-Key 는 **같은 값**이 다시 나가야 서버가 리플레이로 인식한다.
 */
describe("apiRequest DELETE — If-Match·Idempotency-Key·CSRF", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetCsrfToken();
  });

  interface Sent {
    ifMatch: string | null;
    idempotencyKey: string | null;
    csrf: string | null;
  }

  it("DELETE 는 If-Match·Idempotency-Key·X-CSRF-Token 을 함께 싣는다", async () => {
    const sent: Sent[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        return new Response(JSON.stringify({ csrfToken: "csrf-1", expiresAt: "2999-01-01T00:00:00.000Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const headers = new Headers(init?.headers);
      sent.push({
        ifMatch: headers.get("if-match"),
        idempotencyKey: headers.get("idempotency-key"),
        csrf: headers.get("x-csrf-token"),
      });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    await apiRequest("/admin/sms/templates/abc", {
      method: "DELETE",
      ifMatchVersion: "9",
      idempotencyKey: "op-del-1",
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.ifMatch, "9");
    assert.equal(sent[0]!.idempotencyKey, "op-del-1");
    assert.equal(sent[0]!.csrf, "csrf-1");
  });

  it("CSRF 만료로 403 을 맞으면 새 토큰으로 재시도하되 If-Match·Idempotency-Key 는 그대로 보낸다", async () => {
    const sent: Sent[] = [];
    let csrfIssued = 0;
    let deleteAttempts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        csrfIssued += 1;
        return new Response(
          JSON.stringify({ csrfToken: `csrf-${csrfIssued}`, expiresAt: "2999-01-01T00:00:00.000Z" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      const headers = new Headers(init?.headers);
      sent.push({
        ifMatch: headers.get("if-match"),
        idempotencyKey: headers.get("idempotency-key"),
        csrf: headers.get("x-csrf-token"),
      });
      deleteAttempts += 1;
      // 첫 시도는 CSRF 실패로 403 — 클라이언트가 토큰을 버리고 한 번 재시도해야 한다.
      if (deleteAttempts === 1) {
        return new Response(
          JSON.stringify({ status: 403, code: "CSRF_TOKEN_INVALID", title: "CSRF 토큰이 만료됐어요." }),
          { status: 403, headers: { "content-type": "application/problem+json" } },
        );
      }
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    await apiRequest("/admin/sms/templates/abc", {
      method: "DELETE",
      ifMatchVersion: "9",
      idempotencyKey: "op-del-1",
    });

    assert.equal(sent.length, 2);
    // 두 시도의 If-Match·Idempotency-Key 는 동일해야 리플레이로 인식된다.
    assert.equal(sent[0]!.ifMatch, "9");
    assert.equal(sent[1]!.ifMatch, "9");
    assert.equal(sent[0]!.idempotencyKey, "op-del-1");
    assert.equal(sent[1]!.idempotencyKey, "op-del-1");
    // CSRF 토큰은 새로 받은 값으로 갱신된다.
    assert.equal(sent[0]!.csrf, "csrf-1");
    assert.equal(sent[1]!.csrf, "csrf-2");
  });
});

/**
 * FormData 본문 배선(포스터 업로드) — 클라이언트 확장의 핵심 계약:
 *   1. Content-Type 을 **코드가 설정하지 않는다** → 브라우저가 multipart boundary 를 채운다.
 *   2. multipart 필드가 그대로 실린다.
 *   3. 상태 변경이라 X-CSRF-Token 이 붙고, CSRF 만료 403 이면 새 토큰으로 재시도하되
 *      Idempotency-Key 는 동일하게 유지된다(서버가 리플레이로 인식).
 */
describe("apiRequest FormData — Content-Type 미설정·필드·CSRF·Idempotency-Key", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetCsrfToken();
  });

  interface SeenForm {
    contentType: string | null;
    csrf: string | null;
    idempotencyKey: string | null;
    body: unknown;
  }

  it("Content-Type 을 코드가 설정하지 않고 필드·CSRF·Idempotency-Key 를 함께 싣는다", async () => {
    const seen: SeenForm[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        return new Response(JSON.stringify({ csrfToken: "csrf-1", expiresAt: "2999-01-01T00:00:00.000Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const headers = new Headers(init?.headers);
      seen.push({
        contentType: headers.get("content-type"),
        csrf: headers.get("x-csrf-token"),
        idempotencyKey: headers.get("idempotency-key"),
        body: init?.body,
      });
      return new Response(JSON.stringify({ poster: null }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const form = new FormData();
    form.append("poster", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "p.png");

    await apiRequest("/admin/poster", { method: "PUT", body: form, idempotencyKey: "op-put-1" });

    assert.equal(seen.length, 1);
    // 코드가 Content-Type 을 붙이지 않았다 — 브라우저가 boundary 를 채울 자리를 남긴다.
    assert.equal(seen[0]!.contentType, null);
    assert.equal(seen[0]!.csrf, "csrf-1");
    assert.equal(seen[0]!.idempotencyKey, "op-put-1");
    assert.ok(seen[0]!.body instanceof FormData);
    assert.ok((seen[0]!.body as FormData).get("poster") instanceof Blob);
  });

  it("CSRF 만료 403 이면 새 토큰으로 재시도하되 FormData·Idempotency-Key 는 그대로다", async () => {
    const seen: SeenForm[] = [];
    let csrfIssued = 0;
    let putAttempts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        csrfIssued += 1;
        return new Response(JSON.stringify({ csrfToken: `csrf-${csrfIssued}`, expiresAt: "2999-01-01T00:00:00.000Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const headers = new Headers(init?.headers);
      seen.push({
        contentType: headers.get("content-type"),
        csrf: headers.get("x-csrf-token"),
        idempotencyKey: headers.get("idempotency-key"),
        body: init?.body,
      });
      putAttempts += 1;
      if (putAttempts === 1) {
        return new Response(JSON.stringify({ status: 403, code: "CSRF_TOKEN_INVALID", title: "CSRF 토큰이 만료됐어요." }), {
          status: 403,
          headers: { "content-type": "application/problem+json" },
        });
      }
      return new Response(JSON.stringify({ poster: null }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const form = new FormData();
    form.append("poster", new Blob([new Uint8Array([9])], { type: "image/webp" }), "p.webp");

    await apiRequest("/admin/poster", { method: "PUT", body: form, idempotencyKey: "op-put-2" });

    assert.equal(seen.length, 2);
    // 두 시도 모두 Content-Type 미설정 + 같은 멱등 키 + poster 필드.
    assert.equal(seen[0]!.contentType, null);
    assert.equal(seen[1]!.contentType, null);
    assert.equal(seen[0]!.idempotencyKey, "op-put-2");
    assert.equal(seen[1]!.idempotencyKey, "op-put-2");
    assert.ok((seen[1]!.body as FormData).get("poster") instanceof Blob);
    // CSRF 는 새 값으로 갱신된다.
    assert.equal(seen[0]!.csrf, "csrf-1");
    assert.equal(seen[1]!.csrf, "csrf-2");
  });
});

describe("apiRequest readOnlyPost — 조회 전용 무세션 경계", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetCsrfToken();
  });

  it("CSRF를 부트스트랩하지 않고 credentials·mutation 자격 없이 JSON POST를 보낸다", async () => {
    let csrfBootstrapCount = 0;
    let seen: RequestInit | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) csrfBootstrapCount += 1;
      else seen = init;
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await apiRequest("/public/family-bookings/lookup", {
      method: "POST",
      readOnlyPost: true,
      body: { contact: "01012345678" },
    });

    assert.equal(csrfBootstrapCount, 0);
    assert.equal(seen?.credentials, "omit");
    assert.equal(seen?.body, JSON.stringify({ contact: "01012345678" }));
    const headers = new Headers(seen?.headers);
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.has("x-csrf-token"), false);
    assert.equal(headers.has("idempotency-key"), false);
    assert.equal(headers.has("x-booking-proof"), false);
  });

  it("POST 이외의 메서드와 mutation 자격 결합은 프로그래머 오류로 거절한다", async () => {
    await assert.rejects(
      () => apiRequest("/public/family-bookings/lookup", { method: "GET", readOnlyPost: true }),
      TypeError,
    );
    await assert.rejects(
      () => apiRequest("/public/family-bookings/lookup", {
        method: "POST",
        readOnlyPost: true,
        idempotencyKey: "must-not-send",
      }),
      TypeError,
    );
  });

  it("허용 경로가 아니면(다른 POST 경로·쿼리/경로 변형) fetch·CSRF 이전에 동기 거절한다", async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    // 다른 변경 경로, 쿼리 문자열 우회, 트레일링 슬래시, 경로 조작, 관리자 경로 모두 거절한다.
    const rejectedPaths = [
      "/public/family-bookings/00000000-0000-4000-8000-000000000000/cancel",
      "/public/family-bookings/lookup?bypass=1",
      "/public/family-bookings/lookup/",
      "/public/family-bookings/lookup/../cancel",
      "/admin/family-bookings",
    ];
    for (const path of rejectedPaths) {
      await assert.rejects(
        () => apiRequest(path, { method: "POST", readOnlyPost: true, body: { contact: "01012345678" } }),
        TypeError,
      );
    }
    await assert.rejects(
      () => apiRequest("/public/family-bookings/lookup", {
        method: "POST",
        readOnlyPost: true,
        query: { bypass: 1 },
        body: { contact: "01012345678" },
      }),
      TypeError,
    );

    // 어떤 요청도 네트워크로 나가지 않았다 — 경계는 fetch·CSRF 이전에 닫힌다.
    assert.equal(fetchCalls, 0);
  });
});
