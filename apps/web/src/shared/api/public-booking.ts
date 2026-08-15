"use client";

/**
 * 공개 학부모 예약 (계약 tags: Public seminar sessions / Public students / Public family bookings).
 *
 * 인증 축이 셋이다 — 서로 섞이지 않는다:
 * - X-Booking-Proof(메모리 전용 시크릿): 학생 조회·예약 생성·**모든 관리 변경(수정·취소·설문)**.
 *   BOOKING_MANAGE proof 는 소유 예약 읽기에는 여러 번 쓰이고, **첫 관리 변경이 같은 DB 트랜잭션에서
 *   소비**한다. 변경이 실패하면 서버가 소비를 롤백하므로 같은 proof 로 재시도할 수 있다.
 * - 관리 세션 쿠키(개인 링크 교환): 마스킹 상세 GET 과 현재 QR 복구 GET 만 가능하다.
 *   **변경·취소·설문에는 절대 쓸 수 없다** — 그때마다 새 BOOKING_MANAGE proof 가 필요하다.
 * - 연락처 조회(lookup): OTP·쿠키·proof 없이 same-origin 으로 마스킹 목록만 받는다(내구 상태 없음).
 */

import { adoptCsrfToken, apiRequest } from "./client";
import type { DurableCallOptions } from "./scanner-admin";
import type {
  AttendanceParty,
  BookingAccessExchangeRequest,
  BookingAccessExchangeResult,
  Branch,
  FamilyBookingMutationResult,
  PublicFamilyBookingCreateRequest,
  PublicFamilyBookingReadSessionRequest,
  PublicFamilyBookingUpdateRequest,
  PublicMaskedFamilyBooking,
  PublicMaskedFamilyBookingList,
  PublicSeminarSessionPage,
  PublicStudentPage,
  PublicSurveyResponseCreateRequest,
  QrRecoveryResult,
  SurveyResponseMutationResult,
} from "./contract";

/** proof 가 필요한 읽기 호출 옵션. */
export interface ProofReadOptions {
  bookingProof: string;
  signal?: AbortSignal;
}

/** proof 가 필요한 durable 변경 옵션. */
export interface ProofMutationOptions extends DurableCallOptions {
  bookingProof: string;
}

/**
 * 개인 링크 교환으로 만들어진 30분 예약 관리 세션(HttpOnly 쿠키) 읽기 인증.
 * ★ proof 헤더를 붙이지 않는다 — 쿠키가 유일한 자격이다. **읽기 전용**이다(변경 불가).
 */
export interface ManagementSessionReadOptions {
  session: "management";
  signal?: AbortSignal;
}

/**
 * 소유 예약 **읽기**(마스킹 상세 GET · QR 복구 GET) 인증 — BOOKING_MANAGE proof 또는 관리 세션 중 하나.
 * 변경(수정·취소·설문)에는 이 유니언을 쓰지 않는다 — 그쪽은 언제나 `ProofMutationOptions` 다.
 * 세션을 변경 인증으로 제시할 타입 경로 자체를 두지 않는다(계약: access session 은 mutation 금지).
 */
export type OwnedBookingReadAuth = ProofReadOptions | ManagementSessionReadOptions;

/** 관리 세션 읽기는 proof 헤더가 없다 — proof 모드에서만 시크릿을 헤더로 싣는다. */
function bookingProofOf(auth: OwnedBookingReadAuth): string | undefined {
  return "bookingProof" in auth ? auth.bookingProof : undefined;
}

/* ── 공개 회차 (인증 불필요) ─────────────────────────────────────────────── */

export interface ListPublicSessionsParams {
  branch?: Branch;
  page?: number;
  pageSize?: number;
}

export function listPublicSeminarSessions(
  params: ListPublicSessionsParams = {},
  signal?: AbortSignal,
): Promise<PublicSeminarSessionPage> {
  return apiRequest<PublicSeminarSessionPage>("/public/seminar-sessions", {
    method: "GET",
    query: { branch: params.branch, page: params.page, pageSize: params.pageSize },
    signal,
  });
}

/* ── proof 인증 학생 조회 ────────────────────────────────────────────────── */

export interface SearchAuthorizedStudentsParams {
  query?: string;
  branch?: Branch;
  page?: number;
  pageSize?: number;
}

/**
 * 서버가 proof 에서만 연락처 digest 를 파생한다 — 쿼리로 집합을 넓힐 수 없다.
 * 연락처는 모 또는 부 어느 쪽이든 매칭된다.
 */
export function searchAuthorizedStudents(
  params: SearchAuthorizedStudentsParams,
  options: ProofReadOptions,
): Promise<PublicStudentPage> {
  return apiRequest<PublicStudentPage>("/public/students", {
    method: "GET",
    query: { query: params.query, branch: params.branch, page: params.page, pageSize: params.pageSize },
    bookingProof: options.bookingProof,
    signal: options.signal,
  });
}

/* ── 연락처 조회 (OTP·쿠키·proof·멱등키·내구 상태 없음) ─────────────────────── */

/**
 * 전체 연락처로 마스킹 예약 목록을 조회한다 (POST /public/family-bookings/lookup).
 *
 * 계약상 이 조회는 **same-origin Origin 만** 요구하고 OTP·쿠키·X-Booking-Proof·Idempotency-Key·
 * 내구 상태를 만들지 않는다. 본문은 정확히 `{ contact }`(정규화된 전체 번호 숫자열)이며,
 * 매칭이 없으면 빈 `items` 배열이 온다. 응답은 언제나 마스킹된 이름·연락처만 담는다.
 *
 * ★ 전체 연락처는 이 본문에만 잠깐 실린다 — 저장·로깅·URL(경로/쿼리) 노출 금지. 그래서 GET 쿼리가
 *   아니라 POST 본문을 쓴다(번호가 접근 로그/URL 에 남지 않게).
 */
export function lookupPublicFamilyBookings(
  contact: string,
  signal?: AbortSignal,
): Promise<PublicMaskedFamilyBookingList> {
  return apiRequest<PublicMaskedFamilyBookingList>("/public/family-bookings/lookup", {
    method: "POST",
    readOnlyPost: true,
    body: { contact },
    signal,
  });
}

/* ── 소유 예약 (마스킹) ──────────────────────────────────────────────────── */

/**
 * 소유 예약 하나의 **마스킹 상세**를 읽는다 (GET /public/family-bookings/{id}).
 * BOOKING_MANAGE proof 또는 관리 세션 쿠키 중 하나로 인증한다. 읽기는 proof 를 소비하지 않는다.
 */
export function getPublicFamilyBooking(
  familyBookingId: string,
  options: OwnedBookingReadAuth,
): Promise<PublicMaskedFamilyBooking> {
  return apiRequest<PublicMaskedFamilyBooking>(`/public/family-bookings/${encodeURIComponent(familyBookingId)}`, {
    method: "GET",
    bookingProof: bookingProofOf(options),
    signal: options.signal,
  });
}

/**
 * 개인 링크 교환 (POST /public/booking-access/session).
 * fragment token + 전체 연락처를 본문으로만 보내 30분 관리 세션을 얻는다.
 * ★ 성공 응답의 새 csrfToken 을 즉시 채택한다 — 서버가 세션을 재생성했으므로 이전 CSRF 는 무효다.
 */
export async function exchangeBookingAccessToken(
  body: BookingAccessExchangeRequest,
  options: DurableCallOptions,
): Promise<BookingAccessExchangeResult> {
  const result = await apiRequest<BookingAccessExchangeResult>("/public/booking-access/session", {
    method: "POST",
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
  adoptCsrfToken(result.csrfToken, result.expiresAt);
  return result;
}

/**
 * 연락처 조회 뒤 마스킹 목록에서 고른 예약 하나에 **읽기 전용** 관리 세션을 세운다
 * (POST /public/family-bookings/{id}/read-session).
 *
 * 조회로 이미 메모리에 있는 전체 연락처를 **본문 `{contact}` 로만** 보내(경로·쿼리·로그 금지)
 * 서버가 정규화해 정확히 그 예약과 대조하게 한다. 성공하면 30분 예약 범위 세션 쿠키가 서고,
 * ★ 응답의 새 csrfToken 을 즉시 채택한다 — 서버가 세션을 재생성했으므로 이전 CSRF 는 무효다.
 *
 * 언제나 CSRF(client) + same-origin(credentials) + Idempotency-Key 가 필요하다. 이 세션은
 * 마스킹 상세 GET·현재 QR 복구 GET 만 허용한다 — 변경·취소·설문·QR 회전은 절대 인증하지 않고,
 * 그때마다 새 BOOKING_MANAGE proof 가 필요하다. 키 수명은 호출부(useKeyedOperationIntents)가 쥔다.
 */
export async function establishFamilyBookingContactReadSession(
  familyBookingId: string,
  contact: string,
  options: DurableCallOptions,
): Promise<BookingAccessExchangeResult> {
  const body: PublicFamilyBookingReadSessionRequest = { contact };
  const result = await apiRequest<BookingAccessExchangeResult>(
    `/public/family-bookings/${encodeURIComponent(familyBookingId)}/read-session`,
    {
      method: "POST",
      body,
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    },
  );
  adoptCsrfToken(result.csrfToken, result.expiresAt);
  return result;
}

/**
 * 현재 활성 QR 복구 (GET /public/family-bookings/{id}/qr) — 재발급이 아니라 조회다.
 * 관리 세션 쿠키 또는 BOOKING_MANAGE proof 중 하나로 인증한다(읽기라 proof 를 소비하지 않는다).
 * 조회로 QR 버전이 바뀌지 않는다. 원문 qrToken 은 메모리에서만 쓴다.
 */
export function recoverOwnedFamilyBookingQr(
  familyBookingId: string,
  auth: OwnedBookingReadAuth,
): Promise<QrRecoveryResult> {
  return apiRequest<QrRecoveryResult>(
    `/public/family-bookings/${encodeURIComponent(familyBookingId)}/qr`,
    {
      method: "GET",
      bookingProof: bookingProofOf(auth),
      signal: auth.signal,
    },
  );
}

/**
 * 예약 생성 — 신규 커밋만 최상위 원문 `qrToken` 을 준다.
 * 서버는 QR 원문을 AEAD 로 암호화 저장하고 스캔 조회용 digest 를 유지한다. 다만 프론트
 * 관점에서 raw QR 이 응답에 실리는 건 **신규 생성 응답뿐**이고, idempotent 리플레이 응답은
 * 같은 예약을 주되 raw QR 을 재노출하지 않는다. 이후 현재 QR 은 인증된 복구 GET
 * (`recoverOwnedFamilyBookingQr`)으로 확인한다.
 * 검증된 연락처는 proof 에서만 오므로 본문에 넣지 않는다.
 */
export function createPublicFamilyBooking(
  body: PublicFamilyBookingCreateRequest,
  options: ProofMutationOptions,
): Promise<FamilyBookingMutationResult> {
  return apiRequest<FamilyBookingMutationResult>("/public/family-bookings", {
    method: "POST",
    body,
    bookingProof: options.bookingProof,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * 회차 이동·참석자 변경 — 활성 가족 QR 은 유지된다. 응답은 **마스킹 DTO** 다.
 *
 * ★ 언제나 BOOKING_MANAGE proof + CSRF(client) + same-origin + Idempotency-Key 가 필요하다.
 *   관리 세션은 변경 인증으로 쓸 수 없다(타입에서 proof 만 받는다). 성공 시 같은 트랜잭션에서
 *   proof 가 소비되고, 실패 시 롤백돼 같은 proof·같은 키로 재시도할 수 있다.
 */
export function updatePublicFamilyBooking(
  familyBookingId: string,
  body: PublicFamilyBookingUpdateRequest,
  options: ProofMutationOptions,
): Promise<PublicMaskedFamilyBooking> {
  return apiRequest<PublicMaskedFamilyBooking>(`/public/family-bookings/${encodeURIComponent(familyBookingId)}`, {
    method: "PATCH",
    body,
    bookingProof: options.bookingProof,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * 취소 — 입장 완료된 예약은 공개 취소가 불가하다(409). 응답은 **마스킹 DTO** 다.
 * update 와 같은 인증 규칙: 언제나 proof + CSRF + same-origin + Idempotency-Key.
 */
export function cancelPublicFamilyBooking(
  familyBookingId: string,
  expectedVersion: number,
  options: ProofMutationOptions,
  reason?: string,
): Promise<PublicMaskedFamilyBooking> {
  return apiRequest<PublicMaskedFamilyBooking>(
    `/public/family-bookings/${encodeURIComponent(familyBookingId)}/cancel`,
    {
      method: "POST",
      body: { expectedVersion, ...(reason ? { reason } : {}) },
      bookingProof: options.bookingProof,
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    },
  );
}

/**
 * 만족도 설문 — 예약이 CHECKED_IN 이거나 회차가 끝난 뒤에만 가능하고, 예약당 1건이다.
 * 계약은 별점(필수)과 후기(선택)만 받는다. update·cancel 과 같은 proof 소비 규칙을 따른다
 * (첫 성공 관리 변경이 proof 를 소비한다). 관리 세션으로는 제출할 수 없다.
 */
export function submitFamilyBookingSurveyResponse(
  familyBookingId: string,
  body: PublicSurveyResponseCreateRequest,
  options: ProofMutationOptions,
): Promise<SurveyResponseMutationResult> {
  return apiRequest<SurveyResponseMutationResult>(
    `/public/family-bookings/${encodeURIComponent(familyBookingId)}/survey-response`,
    {
      method: "POST",
      body,
      bookingProof: options.bookingProof,
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    },
  );
}

/** 좌석 수는 서버가 attendanceParty 로만 파생한다 — 자녀 수와 무관하다. */
export function seatCountFor(party: AttendanceParty): 1 | 2 {
  return party === "BOTH" ? 2 : 1;
}
