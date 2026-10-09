/**
 * 포스터 어댑터 테스트 (node:test + tsx)
 *
 * 지키려는 것:
 *   1. 순수 검증이 계약을 정확히 좁힘 — same-origin 64-hex 이미지 URL·서술자·형식/용량
 *      깨진 메타데이터는 거절하고 없는 포스터를 지어내지 않음
 *   2. 업로드 어댑터가 multipart 필드 `poster` 하나로 PUT 하고, Content-Type 을 코드가 설정하지
 *      않으며, CSRF·Idempotency-Key 를 싣고, CSRF 재시도에서도 같은 키를 유지함
 *   3. 실패 상태코드가 서로 다른 정직한 문구로 갈림
 *
 * 실행: node --import tsx --test src/shared/api/poster.test.ts
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getPublicPoster,
  isPosterMediaType,
  isValidPosterDescriptor,
  isValidPosterImageUrl,
  MAX_POSTER_BYTES,
  parsePosterResource,
  parseUploadedPoster,
  posterFileRejectionMessage,
  posterUploadErrorMessage,
  uploadAdminPoster,
  validatePosterFile,
} from "./poster";
import { resetCsrfToken } from "./client";
import { ApiError } from "./problem";
import type { PosterDescriptor } from "./contract";

/* ── 픽스처 ──────────────────────────────────────────────────────────────── */

/**
 * 테스트 포스터 버전
 */
const VERSION = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"; // 64 소문자 hex

/**
 * 테스트 포스터 이미지 경로
 */
const IMAGE_URL = `/api/v1/public/poster/image/${VERSION}`;

/**
 * 테스트 포스터 정보 생성
 */
function descriptor(overrides: Partial<PosterDescriptor> = {}): PosterDescriptor {
  return {
    version: VERSION,
    imageUrl: IMAGE_URL,
    mediaType: "image/png",
    sizeBytes: 123_456,
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

/* ── 이미지 URL 검증 ─────────────────────────────────────────────────────── */

describe("isValidPosterImageUrl", () => {
  it("same-origin 접두 + 정확히 64 소문자 hex 만 허용한다", () => {
    assert.equal(isValidPosterImageUrl(IMAGE_URL), true);
  });

  it("대문자 hex·길이 오류·절대 URL·쿼리·상위경로·비문자열은 거절한다", () => {
    assert.equal(isValidPosterImageUrl(`/api/v1/public/poster/image/${"A".repeat(64)}`), false);
    assert.equal(isValidPosterImageUrl(`/api/v1/public/poster/image/${"a".repeat(63)}`), false);
    assert.equal(isValidPosterImageUrl(`/api/v1/public/poster/image/${"a".repeat(65)}`), false);
    assert.equal(isValidPosterImageUrl(`https://evil.test/api/v1/public/poster/image/${VERSION}`), false);
    assert.equal(isValidPosterImageUrl(`${IMAGE_URL}?v=2`), false);
    assert.equal(isValidPosterImageUrl(`${IMAGE_URL}/x`), false);
    assert.equal(isValidPosterImageUrl("/api/v1/public/poster/image/"), false);
    assert.equal(isValidPosterImageUrl(123), false);
    assert.equal(isValidPosterImageUrl(null), false);
  });
});

/* ── mediaType 검증 ─────────────────────────────────────────────────────── */

describe("isPosterMediaType", () => {
  it("png·jpeg·webp 만 참이다", () => {
    assert.equal(isPosterMediaType("image/png"), true);
    assert.equal(isPosterMediaType("image/jpeg"), true);
    assert.equal(isPosterMediaType("image/webp"), true);
    assert.equal(isPosterMediaType("image/gif"), false);
    assert.equal(isPosterMediaType("image/svg+xml"), false);
    assert.equal(isPosterMediaType(""), false);
    assert.equal(isPosterMediaType(null), false);
  });
});

/* ── 서술자 검증 ────────────────────────────────────────────────────────── */

describe("isValidPosterDescriptor", () => {
  it("모든 필드가 계약대로면 참이다", () => {
    assert.equal(isValidPosterDescriptor(descriptor()), true);
  });

  it("필드가 하나라도 어긋나면 거짓이다", () => {
    assert.equal(isValidPosterDescriptor(descriptor({ version: "not-hex" })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ imageUrl: "/elsewhere" })), false);
    assert.equal(
      isValidPosterDescriptor(descriptor({ imageUrl: `/api/v1/public/poster/image/${"b".repeat(64)}` })),
      false,
    );
    assert.equal(isValidPosterDescriptor(descriptor({ mediaType: "image/gif" as PosterDescriptor["mediaType"] })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ sizeBytes: 0 })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ sizeBytes: -1 })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ sizeBytes: 1.5 })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ sizeBytes: MAX_POSTER_BYTES + 1 })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ sizeBytes: Number.NaN })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ updatedAt: "not-a-date" })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ updatedAt: "2026" })), false);
    assert.equal(isValidPosterDescriptor(descriptor({ updatedAt: "2026-07-20T00:00:00+09:00" })), true);
    assert.equal(isValidPosterDescriptor({ ...descriptor(), version: undefined }), false);
    assert.equal(isValidPosterDescriptor(null), false);
    assert.equal(isValidPosterDescriptor("x"), false);
  });
});

/* ── 봉투 파싱 ──────────────────────────────────────────────────────────── */

describe("parsePosterResource", () => {
  it("poster:null → 없음", () => {
    assert.deepEqual(parsePosterResource({ poster: null }), { poster: null });
  });

  it("유효 서술자 → 그대로 감싼다", () => {
    assert.deepEqual(parsePosterResource({ poster: descriptor() }), { poster: descriptor() });
  });

  it("키 없음·깨진 서술자·비객체는 거절한다(malformed)", () => {
    assert.throws(() => parsePosterResource({}), (error) => error instanceof ApiError && error.code === "POSTER_METADATA_MALFORMED");
    assert.throws(() => parsePosterResource({ poster: { version: "bad" } }));
    assert.throws(() => parsePosterResource(null));
    assert.throws(() => parsePosterResource("nope"));
    assert.throws(() => parsePosterResource(undefined));
  });
});

describe("parseUploadedPoster", () => {
  it("성공 봉투의 서술자를 돌려준다", () => {
    assert.deepEqual(parseUploadedPoster({ poster: descriptor() }), descriptor());
  });

  it("null·깨진 응답은 거절한다(성공엔 서술자가 있어야 한다)", () => {
    assert.throws(() => parseUploadedPoster({ poster: null }));
    assert.throws(() => parseUploadedPoster({}));
  });
});

/* ── 파일 사전 검사 ─────────────────────────────────────────────────────── */

describe("validatePosterFile", () => {
  it("허용 형식·용량 이내면 통과한다", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "poster.png", { type: "image/png" });
    assert.deepEqual(validatePosterFile(file), { ok: true });
  });

  it("허용하지 않는 형식은 type 으로 거절한다", () => {
    const file = new File([new Uint8Array([1])], "poster.gif", { type: "image/gif" });
    assert.deepEqual(validatePosterFile(file), { ok: false, reason: "type" });
  });

  it("상한 초과는 size 로 거절한다", () => {
    // 10MB 를 실제로 할당하지 않고 type·size 만 읽는 순수 로직을 검증함
    const oversize = { type: "image/png", size: MAX_POSTER_BYTES + 1 } as unknown as File;
    assert.deepEqual(validatePosterFile(oversize), { ok: false, reason: "size" });
    const exact = { type: "image/png", size: MAX_POSTER_BYTES } as unknown as File;
    assert.deepEqual(validatePosterFile(exact), { ok: true });
  });

  it("0바이트 파일은 size 로 거절한다", () => {
    const empty = { type: "image/png", size: 0 } as unknown as File;
    assert.deepEqual(validatePosterFile(empty), { ok: false, reason: "size" });
  });
});

/* ── 문구 매핑 ──────────────────────────────────────────────────────────── */

describe("posterUploadErrorMessage", () => {
  const problem = (status: number) =>
    new ApiError({ kind: "problem", status, code: `CODE_${status}`, message: "서버 문구" });

  it("상태코드별로 서로 다른 정직한 문구를 준다", () => {
    const messages = [400, 401, 403, 409, 413, 415, 503].map((status) => posterUploadErrorMessage(problem(status)));
    assert.equal(new Set(messages).size, messages.length); // 전부 구분됨
    assert.match(posterUploadErrorMessage(problem(413)), /10MB/);
    assert.match(posterUploadErrorMessage(problem(415)), /형식/);
    assert.match(posterUploadErrorMessage(problem(403)), /권한/);
    assert.match(posterUploadErrorMessage(problem(503)), /저장소/);
  });

  it("ApiError 가 아니면 기본 문구로 물러난다", () => {
    assert.equal(typeof posterUploadErrorMessage(new Error("x")), "string");
  });
});

describe("posterFileRejectionMessage", () => {
  it("type·size 문구가 다르다", () => {
    assert.notEqual(posterFileRejectionMessage("type"), posterFileRejectionMessage("size"));
    assert.match(posterFileRejectionMessage("size"), /10MB/);
  });
});

/* ── 어댑터: getPublicPoster ────────────────────────────────────────────── */

describe("getPublicPoster", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stub(body: unknown) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  }

  it("poster:null 이면 없음을 그대로 돌려준다", async () => {
    stub({ poster: null });
    assert.deepEqual(await getPublicPoster(), { poster: null });
  });

  it("유효 서술자는 검증해 돌려준다", async () => {
    stub({ poster: descriptor() });
    assert.deepEqual(await getPublicPoster(), { poster: descriptor() });
  });

  it("200 이라도 모양이 어긋나면 거절한다", async () => {
    stub({ poster: { imageUrl: "https://evil.test/x" } });
    await assert.rejects(() => getPublicPoster());
  });
});

/* ── 어댑터: uploadAdminPoster ──────────────────────────────────────────── */

describe("uploadAdminPoster", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    resetCsrfToken();
  });

  interface Seen {
    method: string | undefined;
    url: string;
    contentType: string | null;
    csrf: string | null;
    idempotencyKey: string | null;
    field: unknown;
  }

  it("multipart 필드 poster 로 PUT 하고 Content-Type 미설정·CSRF·Idempotency-Key 를 싣는다", async () => {
    const seen: Seen[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        return new Response(JSON.stringify({ csrfToken: "csrf-1", expiresAt: "2999-01-01T00:00:00.000Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const headers = new Headers(init?.headers);
      const body = init?.body;
      seen.push({
        method: init?.method,
        url,
        contentType: headers.get("content-type"),
        csrf: headers.get("x-csrf-token"),
        idempotencyKey: headers.get("idempotency-key"),
        field: body instanceof FormData ? body.get("poster") : null,
      });
      return new Response(JSON.stringify({ poster: descriptor() }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const file = new File([new Uint8Array([1, 2, 3, 4])], "poster.png", { type: "image/png" });
    const result = await uploadAdminPoster(file, { idempotencyKey: "op-poster-1" });

    assert.deepEqual(result, descriptor());
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.method, "PUT");
    assert.equal(new URL(seen[0]!.url, "https://example.test").pathname, "/api/v1/admin/poster");
    assert.equal(seen[0]!.contentType, null); // 코드가 Content-Type 을 설정하지 않았음
    assert.equal(seen[0]!.csrf, "csrf-1");
    assert.equal(seen[0]!.idempotencyKey, "op-poster-1");
    assert.ok(seen[0]!.field instanceof Blob); // 필드 poster 에 파일이 실렸음
  });

  it("CSRF 만료 403 이면 같은 Idempotency-Key 로 재시도한다", async () => {
    const keys: Array<string | null> = [];
    let putAttempts = 0;
    let csrfIssued = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        csrfIssued += 1;
        return new Response(JSON.stringify({ csrfToken: `csrf-${csrfIssued}`, expiresAt: "2999-01-01T00:00:00.000Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      keys.push(new Headers(init?.headers).get("idempotency-key"));
      putAttempts += 1;
      if (putAttempts === 1) {
        return new Response(JSON.stringify({ status: 403, code: "CSRF_TOKEN_INVALID", title: "만료" }), {
          status: 403,
          headers: { "content-type": "application/problem+json" },
        });
      }
      return new Response(JSON.stringify({ poster: descriptor() }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const file = new File([new Uint8Array([5])], "poster.webp", { type: "image/webp" });
    await uploadAdminPoster(file, { idempotencyKey: "op-poster-2" });

    assert.deepEqual(keys, ["op-poster-2", "op-poster-2"]);
  });
});
