"use client";

/**
 * 공개 학부모 예약 (계약 tags: Public seminar sessions / Public students / Public family bookings).
 *
 * 인증: X-Booking-Proof(메모리 전용 시크릿). 세션 쿠키와 독립이다.
 * proof 소비 규칙(계약):
 * - FAMILY_BOOKING proof → 학생 조회는 여러 번, **생성 1회로 소비**.
 * - BOOKING_MANAGE proof → 소유 예약 읽기는 여러 번, **첫 관리 변경(수정·취소·설문)으로 소비**.
 *   따라서 관리 변경 이후에는 재인증이 필요하다.
 */

import { adoptCsrfToken, apiRequest } from "./client";
import type { DurableCallOptions } from "./scanner-admin";
import type {
  AttendanceParty,
  BookingAccessExchangeRequest,
  BookingAccessExchangeResult,
  Branch,
  FamilyBooking,
  FamilyBookingMutationResult,
  OwnedFamilyBookingList,
  PublicFamilyBookingCreateRequest,
  PublicFamilyBookingUpdateRequest,
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
 * 개인 링크 교환으로 만들어진 30분 예약 관리 세션(HttpOnly 쿠키) 인증.
 * ★ proof 헤더를 붙이지 않는다 — 쿠키가 유일한 자격이다.
 */
export interface ManagementSessionReadOptions {
  session: "management";
  signal?: AbortSignal;
}

export interface ManagementSessionMutationOptions extends DurableCallOptions {
  session: "management";
}

/** 소유 예약 읽기 인증 — legacy proof 또는 관리 세션 중 정확히 하나. */
export type OwnedBookingReadAuth = ProofReadOptions | ManagementSessionReadOptions;
/** 소유 예약 변경 인증 — legacy proof 또는 관리 세션 중 정확히 하나. */
export type OwnedBookingMutationAuth = ProofMutationOptions | ManagementSessionMutationOptions;

/** 관리 세션 호출은 proof 헤더가 없다 — proof 모드에서만 시크릿을 헤더로 싣는다. */
function bookingProofOf(auth: OwnedBookingReadAuth | OwnedBookingMutationAuth): string | undefined {
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

/* ── 소유 예약 ───────────────────────────────────────────────────────────── */

/** 계약상 최신순으로 정렬돼 온다. 연락처·검색어를 받지 않는다(집합 확장 불가). */
export function listOwnedFamilyBookings(options: ProofReadOptions): Promise<OwnedFamilyBookingList> {
  return apiRequest<OwnedFamilyBookingList>("/public/family-bookings", {
    method: "GET",
    bookingProof: options.bookingProof,
    signal: options.signal,
  });
}

/** legacy proof(BOOKING_READ/MANAGE) 또는 관리 세션 쿠키 중 하나로 소유 예약 하나를 읽는다. */
export function getPublicFamilyBooking(
  familyBookingId: string,
  options: OwnedBookingReadAuth,
): Promise<FamilyBooking> {
  return apiRequest<FamilyBooking>(`/public/family-bookings/${encodeURIComponent(familyBookingId)}`, {
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
 * 현재 활성 QR 복구 (GET /public/family-bookings/{id}/qr) — 재발급이 아니라 조회다.
 * 관리 세션 쿠키 또는 legacy BOOKING_MANAGE proof 중 하나로 인증한다.
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
 * 회차 이동·참석자 변경 — 활성 가족 QR 은 유지된다.
 * legacy proof 모드에서는 성공 시 proof 가 소비된다(재인증 필요). 관리 세션 모드는 세션이 유지된다.
 */
export function updatePublicFamilyBooking(
  familyBookingId: string,
  body: PublicFamilyBookingUpdateRequest,
  options: OwnedBookingMutationAuth,
): Promise<FamilyBooking> {
  return apiRequest<FamilyBooking>(`/public/family-bookings/${encodeURIComponent(familyBookingId)}`, {
    method: "PATCH",
    body,
    bookingProof: bookingProofOf(options),
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * 취소 — 입장 완료된 예약은 공개 취소가 불가하다(409).
 * legacy proof 모드에서는 성공 시 proof 가 소비된다. 관리 세션 모드는 세션이 유지된다.
 */
export function cancelPublicFamilyBooking(
  familyBookingId: string,
  expectedVersion: number,
  options: OwnedBookingMutationAuth,
  reason?: string,
): Promise<FamilyBooking> {
  return apiRequest<FamilyBooking>(
    `/public/family-bookings/${encodeURIComponent(familyBookingId)}/cancel`,
    {
      method: "POST",
      body: { expectedVersion, ...(reason ? { reason } : {}) },
      bookingProof: bookingProofOf(options),
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    },
  );
}

/**
 * 만족도 설문 — 예약이 CHECKED_IN 이거나 회차가 끝난 뒤에만 가능하고, 예약당 1건이다.
 * 사진 바이트는 이 계약이 업로드하지 않는다: photoAttached + basename 만 기록한다.
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
