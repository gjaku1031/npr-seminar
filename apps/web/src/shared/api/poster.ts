"use client";

/**
 * 공개/관리 포스터 어댑터 (계약 tags: Public poster / Admin poster) — `/api/v1/.../poster`.
 *
 * - GET  /public/poster        : 인증 없이 **항상 200**. 본문은 `{ poster: null }`(없음) 또는
 *                                `{ poster: <서술자> }`. 클라이언트는 서버 no-store 메타데이터를
 *                                그냥 fetch 하고, **모양이 어긋나면 거절**한다(지어내지 않는다).
 * - PUT  /admin/poster         : ADMIN 쿠키 + Origin + CSRF + Idempotency-Key + multipart 필드
 *                                정확히 `poster`. 성공 응답은 서술자를 `poster` 로 감싼 봉투다.
 *
 * 이 모듈은 순수 검증(hex·mediaType·크기)과 어댑터만 담는다 — React 상태는 훅이 가진다.
 * 원문 파일/이미지/토큰을 저장·로깅하지 않는다.
 */

import { apiRequest } from "./client";
import { ApiError, defaultErrorMessage, isApiError } from "./problem";
import type { DurableCallOptions } from "./scanner-admin";
import type { PosterDescriptor, PosterMediaType, PosterResource } from "./contract";

/* ── 상수 ─────────────────────────────────────────────────────────────────── */

/** 계약 multipart 필드명 — 정확히 이 이름이어야 한다. */
export const POSTER_UPLOAD_FIELD = "poster";

/** 클라이언트 상한(계약과 동일) — 10,485,760 바이트(10 MiB). */
export const MAX_POSTER_BYTES = 10_485_760;

/** 허용 미디어 타입 — 이 순서로 `<input accept>` 에도 쓴다. */
export const POSTER_ACCEPT_MEDIA_TYPES: readonly PosterMediaType[] = ["image/png", "image/jpeg", "image/webp"];

/** `<input type="file" accept>` 속성값. */
export const POSTER_ACCEPT_ATTR = POSTER_ACCEPT_MEDIA_TYPES.join(",");

/** 공개 이미지 경로 접두 — imageUrl 은 반드시 이 뒤에 64 소문자 hex 가 온다. */
export const POSTER_IMAGE_PATH_PREFIX = "/api/v1/public/poster/image/";

/** sha256 hex(버전) — 소문자 64자리. */
const POSTER_VERSION_PATTERN = /^[0-9a-f]{64}$/;

/** same-origin 불변 이미지 URL — 접두 뒤 정확히 64 소문자 hex 로 끝난다(쿼리·조각 불허). */
const POSTER_IMAGE_URL_PATTERN = /^\/api\/v1\/public\/poster\/image\/[0-9a-f]{64}$/;

/** OpenAPI `date-time`에 맞는 RFC 3339 형태(날짜+시각+시간대)만 허용한다. */
const POSTER_UPDATED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/* ── 순수 검증 ────────────────────────────────────────────────────────────── */

/** 계약 mediaType 인가 — 이 셋만 참이다. */
export function isPosterMediaType(value: unknown): value is PosterMediaType {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

/**
 * 렌더해도 되는 이미지 URL 인가 — same-origin 경로 `/api/v1/public/poster/image/<64 hex>` 만 참.
 * 절대 URL(스킴·호스트)·상위경로·쿼리·대문자 hex 는 전부 거짓이다.
 */
export function isValidPosterImageUrl(value: unknown): value is string {
  return typeof value === "string" && POSTER_IMAGE_URL_PATTERN.test(value);
}

/** 서술자의 모든 필드를 계약대로 좁힌다 — 하나라도 어긋나면 거짓(그러면 메타데이터를 거절한다). */
export function isValidPosterDescriptor(value: unknown): value is PosterDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.version === "string" &&
    POSTER_VERSION_PATTERN.test(d.version) &&
    isValidPosterImageUrl(d.imageUrl) &&
    d.imageUrl === `${POSTER_IMAGE_PATH_PREFIX}${d.version}` &&
    isPosterMediaType(d.mediaType) &&
    typeof d.sizeBytes === "number" &&
    Number.isFinite(d.sizeBytes) &&
    Number.isInteger(d.sizeBytes) &&
    d.sizeBytes > 0 &&
    d.sizeBytes <= MAX_POSTER_BYTES &&
    typeof d.updatedAt === "string" &&
    POSTER_UPDATED_AT_PATTERN.test(d.updatedAt) &&
    !Number.isNaN(Date.parse(d.updatedAt))
  );
}

/** 메타데이터가 계약 모양이 아닐 때 — 없는 포스터를 지어내지 않고 오류로 드러낸다. */
function posterMalformedError(): ApiError {
  return new ApiError({
    kind: "unexpected",
    status: 0,
    code: "POSTER_METADATA_MALFORMED",
    message: "포스터 정보를 읽을 수 없습니다.",
  });
}

/**
 * 봉투를 계약 모양으로 좁힌다.
 * - `{ poster: null }` → 없음.
 * - `{ poster: <유효 서술자> }` → 있음.
 * - 그 밖(키 없음·깨진 서술자·비객체) → **거절**(malformed).
 */
export function parsePosterResource(raw: unknown): PosterResource {
  if (typeof raw === "object" && raw !== null && "poster" in raw) {
    const poster = (raw as { poster: unknown }).poster;
    if (poster === null) return { poster: null };
    if (isValidPosterDescriptor(poster)) return { poster };
  }
  throw posterMalformedError();
}

/** 업로드 성공 봉투 → 서술자. 성공엔 반드시 서술자가 있어야 한다(null 이면 malformed). */
export function parseUploadedPoster(raw: unknown): PosterDescriptor {
  const resource = parsePosterResource(raw);
  if (resource.poster === null) throw posterMalformedError();
  return resource.poster;
}

/** 업로드 전 클라이언트 검사 — 형식/용량. 통과해도 최종 권위는 서버 응답이다. */
export type PosterFileRejection = "type" | "size";

export function validatePosterFile(file: File): { ok: true } | { ok: false; reason: PosterFileRejection } {
  if (!isPosterMediaType(file.type)) return { ok: false, reason: "type" };
  if (file.size < 1 || file.size > MAX_POSTER_BYTES) return { ok: false, reason: "size" };
  return { ok: true };
}

/* ── 사용자 문구 ──────────────────────────────────────────────────────────── */

/** 클라이언트 사전 검사 거절 문구. */
export function posterFileRejectionMessage(reason: PosterFileRejection): string {
  return reason === "type"
    ? "PNG · JPG · WebP 이미지만 올릴 수 있습니다."
    : "파일 크기를 확인해 주세요. 10MB 이하의 비어 있지 않은 이미지를 선택해 주세요.";
}

/**
 * 업로드 실패의 한국어 문구 — 계약 상태코드별로 정직하게 가른다.
 * 400 필수/검증 · 401·403 인증 · 409 멱등 재사용 · 413 용량 · 415 형식 · 503 저장소 불가.
 */
export function posterUploadErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  switch (error.status) {
    case 400:
      return "요청을 처리하지 못했습니다. 이미지를 다시 선택해 주세요.";
    case 401:
      return "로그인이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.";
    case 403:
      return "포스터를 교체할 권한이 없습니다.";
    case 409:
      return "이미 처리 중인 요청입니다. 잠시 후 상태를 새로고침해 주세요.";
    case 413:
      return "파일이 너무 큽니다. 10MB 이하 이미지를 선택해 주세요.";
    case 415:
      return "지원하지 않는 형식입니다. PNG · JPG · WebP만 올릴 수 있습니다.";
    case 503:
      return "저장소를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}

/** 공개 포스터 조회 실패 문구 — 네트워크·5xx·깨진 메타데이터를 구분해 정직하게 말한다. */
export function publicPosterErrorMessage(error: unknown): string {
  if (isApiError(error) && error.code === "POSTER_METADATA_MALFORMED") return error.message;
  return defaultErrorMessage(error);
}

/* ── 어댑터 ───────────────────────────────────────────────────────────────── */

/**
 * 공개 포스터 메타데이터(GET /public/poster). 계약상 항상 200 이므로 성공/없음/오류를
 * 상태코드가 아니라 **본문 모양**으로 가른다 — 브라우저는 no-store 메타데이터를 그냥 받는다.
 */
export async function getPublicPoster(signal?: AbortSignal): Promise<PosterResource> {
  const raw = await apiRequest<unknown>("/public/poster", { method: "GET", signal });
  return parsePosterResource(raw);
}

/**
 * 포스터 교체 업로드(PUT /admin/poster) — multipart 필드 `poster` 하나.
 * Content-Type 을 손대지 않아 브라우저가 경계를 만든다(client.ts). CSRF·Idempotency-Key 배선은
 * 공용 클라이언트가 그대로 유지한다 — 미상 재시도에서도 같은 키가 다시 나가야 리플레이가 된다.
 */
export async function uploadAdminPoster(file: File, options: DurableCallOptions): Promise<PosterDescriptor> {
  const form = new FormData();
  form.append(POSTER_UPLOAD_FIELD, file);
  const raw = await apiRequest<unknown>("/admin/poster", {
    method: "PUT",
    body: form,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
  return parseUploadedPoster(raw);
}
