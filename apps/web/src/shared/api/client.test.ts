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
import { apiDownload, parseContentDispositionFilename } from "./client";

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
