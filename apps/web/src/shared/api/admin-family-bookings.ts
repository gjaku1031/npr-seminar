"use client";

/**
 * 관리자 가족 예약 어댑터 (계약 tag: Admin family bookings).
 *
 * 가족 예약은 **가족 단위 집계**다: 연락처 1건 + 회차 1건에 자녀가 여러 명 붙고,
 * 좌석 수(seatCount)는 참석 학부모로만 정해지며 자녀 수로 늘어나지 않는다.
 * 따라서 버전·취소·변경은 전부 가족 단위이지 학생 단위가 아니다.
 */

import { apiRequest } from "./client";
import type {
  AdminBookingSource,
  AdminCancellationType,
  AdminFamilyBookingCreateRequest,
  AttendanceParty,
  BookingAuditEvent,
  BookingAuditEventPage,
  Branch,
  FamilyBooking,
  FamilyBookingMutationResult,
  FamilyBookingPage,
  FamilyBookingStatus,
  PublicGuestParticipantInput,
} from "./contract";

export interface ListAdminFamilyBookingsParams {
  sessionId?: string;
  /** 가족 집계에는 최상위 분원이 없다 — 서버가 **자녀 중 하나라도** 이 분원이면 포함시킨다. */
  branch?: Branch;
  status?: FamilyBookingStatus;
  /** 학생 이름·학번 부분일치. 정확히 4자리 숫자면 연락처 뒤 4자리로 본다. */
  query?: string;
  page?: number;
  /** 계약 최대 200. */
  pageSize?: number;
}

export async function listAdminFamilyBookings(
  params: ListAdminFamilyBookingsParams = {},
  signal?: AbortSignal,
): Promise<FamilyBookingPage> {
  return apiRequest<FamilyBookingPage>("/admin/family-bookings", {
    method: "GET",
    query: {
      sessionId: params.sessionId,
      branch: params.branch,
      status: params.status,
      query: params.query,
      page: params.page,
      pageSize: params.pageSize,
    },
    signal,
  });
}

/**
 * 조건에 맞는 가족 예약 **건수**만 — 행은 서버가 세고 우리는 `page.totalItems` 만 읽는다.
 *
 * 계약에 집계 엔드포인트가 없어 목록의 페이지 메타를 센다. pageSize=1 이라 한 행만 오지만
 * `totalItems` 는 필터 전체 기준이다 — 한 페이지를 전체인 척하는 것과 정반대다.
 * 상태별 숫자가 필요하면 status 별로 한 번씩 부른다(요청 수는 상태 수만큼으로 끝난다).
 */
export async function countAdminFamilyBookings(
  params: Omit<ListAdminFamilyBookingsParams, "page" | "pageSize"> = {},
  signal?: AbortSignal,
): Promise<number> {
  const page = await listAdminFamilyBookings({ ...params, page: 1, pageSize: 1 }, signal);
  return page.page.totalItems;
}

export interface ListBookingEventsParams {
  /** 커서 — 이전 페이지의 `page.nextAfterSequence` 를 그대로 넣는다. */
  afterSequence?: string;
  /** 계약 1~200, 기본 50. */
  limit?: number;
}

/**
 * 가족 예약 감사 이벤트 (커서 페이지네이션).
 *
 * 행마다 미리 부르지 않는다 — 명단 한 페이지가 N+1 요청을 쏘게 된다. 사용자가 로그를
 * 열었을 때만 그 가족 1건을 부른다.
 */
export async function listFamilyBookingEvents(
  familyBookingId: string,
  params: ListBookingEventsParams = {},
  signal?: AbortSignal,
): Promise<BookingAuditEventPage> {
  return apiRequest<BookingAuditEventPage>(
    `/admin/family-bookings/${encodeURIComponent(familyBookingId)}/events`,
    {
      method: "GET",
      query: { afterSequence: params.afterSequence, limit: params.limit },
      signal,
    },
  );
}

/** 계약 Limit 파라미터의 최대값. 이력 모달은 한 번에 최대로 읽어 왕복을 줄인다. */
export const BOOKING_EVENT_PAGE_LIMIT_MAX = 200;

/**
 * 한 가족 예약의 **이력 전부** — `hasMore` 가 false 가 될 때까지 커서를 따라간다.
 *
 * 왜 필요한가: 이 엔드포인트는 sequence **오름차순**이다. 첫 페이지만 읽으면 손에 남는 것은
 * *가장 오래된* 기록이고, 최신 기록은 통째로 빠진다. "최근 것만 보여 준다"고 말하면 그건
 * 사실과 정반대다. 그래서 자르지 않고 전부 읽는다.
 *
 * ★ 여전히 **열었을 때만** 부른다 — 목록을 그릴 때 행마다 부르면 곧 N+1 이다.
 *
 * ★ fail-closed: 서버가 `hasMore: true` 라면서 커서를 주지 않거나(null), 유효한 sequence 가
 *   아니거나, **앞으로 나아가지 않으면**(제자리·거꾸로 — 20→10→20 같은 순환 포함), 조용히
 *   잘린 목록을 전부인 척 돌려주는 대신 **던진다**. 불완전한 이력을 완전한 것처럼 보여 주는 게
 *   이 화면에서 가장 나쁜 실패다.
 */
export async function collectFamilyBookingEvents(
  familyBookingId: string,
  signal?: AbortSignal,
): Promise<BookingAuditEvent[]> {
  const collected: BookingAuditEvent[] = [];
  let afterSequence: string | undefined;
  // 지금까지 따라온 커서(파싱된 값). 첫 장은 커서 없이 부르므로 null 로 시작한다.
  let cursor: bigint | null = null;

  for (;;) {
    const page = await listFamilyBookingEvents(
      familyBookingId,
      { afterSequence, limit: BOOKING_EVENT_PAGE_LIMIT_MAX },
      signal,
    );
    collected.push(...page.items);

    if (!page.page.hasMore) return collected;

    // 장 사이에서도 취소를 지킨다 — 모달이 닫혔는데 남은 장을 계속 부르지 않는다.
    // (fetch 의 거절에만 기대면 이 검사 없이도 대개 멈추지만, "대개"는 보장이 아니다.)
    if (signal?.aborted === true) throw new DOMException("Aborted", "AbortError");

    const next = page.page.nextAfterSequence;
    const parsed = next === null ? null : parseEventSequenceCursor(next);
    // 커서가 없거나(null), 유효한 10진수 sequence 가 아니거나, 직전 커서보다 **엄격히 크지**
    // 않으면(같은 자리·거꾸로 — 순환 포함) 다음 페이지를 부를 근거가 없다. 첫 커서도 유효해야
    // 한다(cursor === null 이면 parsed !== null 만 통과). 무한 루프·중복 대신 사실을 알린다.
    if (parsed === null || (cursor !== null && parsed <= cursor)) {
      throw new Error("이력을 끝까지 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    }
    afterSequence = next!;
    cursor = parsed;
  }
}

/**
 * 커서(`nextAfterSequence`)는 계약상 **10진수 bigint 문자열**이다. Number 로 바꾸면 큰 값에서
 * 정밀도가 깨져 서로 다른 커서가 같아 보일 수 있으므로 BigInt 로 판정한다. 음수·소수·공백·부호·
 * 빈 문자열은 유효한 커서가 아니다 — 그대로 던지게 둔다.
 */
function parseEventSequenceCursor(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/**
 * 가족 예약 한 건의 집계 (ADMIN GET /admin/family-bookings/{familyBookingId}).
 *
 * ★ **취소된** 집계도 그대로 돌려준다: `students` 는 취소 시점에 풀린 학생 링크를 계속 담고 있어,
 *   취소된 재원생 가족을 다시 예약할 때 **명단에 안 보이는 형제까지** 알아내는 유일한 출처다.
 *   목록을 그릴 때 행마다 부르면 곧 N+1 이므로 — **재예약 대화상자를 열 때 한 번만** 부른다.
 *
 * ★ 응답은 전체 연락처를 담은 ADMIN 전용 민감 데이터다 — 저장·로깅·URL 노출 금지.
 */
export async function getAdminFamilyBooking(
  familyBookingId: string,
  signal?: AbortSignal,
): Promise<FamilyBooking> {
  return apiRequest<FamilyBooking>(`/admin/family-bookings/${encodeURIComponent(familyBookingId)}`, {
    method: "GET",
    signal,
  });
}

export interface AdminBookingMutationOptions {
  /** 계약 `x-idempotency: required`. 호출부가 수명을 관리한 키를 넘긴다. */
  idempotencyKey: string;
  signal?: AbortSignal;
}

export interface ChangeAttendancePartyInput {
  familyBookingId: string;
  attendanceParty: AttendanceParty;
  /** 낙관적 잠금 — 읽어 온 `booking.version` 을 그대로 넘긴다. 어긋나면 409. */
  expectedVersion: number;
  /** 계약상 필수, 3~500자. 감사 로그에 남는다. */
  reason: string;
}

/**
 * 참석 학부모 변경 — 전용 엔드포인트가 없어 일반 PATCH 의 한 필드로 보낸다.
 * 200 으로 갱신된 가족 집계 전체를 돌려준다.
 */
export async function changeFamilyBookingAttendanceParty(
  input: ChangeAttendancePartyInput,
  options: AdminBookingMutationOptions,
): Promise<FamilyBooking> {
  return apiRequest<FamilyBooking>(
    `/admin/family-bookings/${encodeURIComponent(input.familyBookingId)}`,
    {
      method: "PATCH",
      body: {
        attendanceParty: input.attendanceParty,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      },
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    },
  );
}

export interface CancelFamilyBookingInput {
  familyBookingId: string;
  expectedVersion: number;
  /** 계약이 받는 취소 갈래 — 전화취소·선생님취소·기타취소. 자유 사유는 없다. */
  cancellationType: AdminCancellationType;
}

/**
 * 가족 예약 취소 — hard delete 가 아니라 상태 전이다(QR 폐기 + 좌석 반환).
 * 200 으로 갱신된 집계를 돌려준다. 이미 취소된 건은 서버가 그대로 200 을 준다.
 *
 * ★ 본문은 정확히 `{expectedVersion, cancellationType}` 다 — 관리자 취소는 자유 사유를 받지 않는다.
 */
export async function cancelAdminFamilyBooking(
  input: CancelFamilyBookingInput,
  options: AdminBookingMutationOptions,
): Promise<FamilyBooking> {
  return apiRequest<FamilyBooking>(
    `/admin/family-bookings/${encodeURIComponent(input.familyBookingId)}/cancel`,
    {
      method: "POST",
      body: { expectedVersion: input.expectedVersion, cancellationType: input.cancellationType },
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    },
  );
}

export interface CreateGuestBookingInput {
  seminarSessionId: string;
  /** 학부모 연락처 원문 8~40자 — write-only 다. 저장·로깅·URL 노출 금지. */
  contact: string;
  attendanceParty: AttendanceParty;
  bookingSource: AdminBookingSource;
  guest: PublicGuestParticipantInput;
  /**
   * 계약상 **선택** — 생략하면 서버가 `bookingSource` 로 감사 사유를 파생한다. 화면은 자유 사유를
   * 받지 않으므로 보통 비운다. 지어낸 값을 채워 넣지 않고, 없으면 요청 본문에서 **키째** 뺀다.
   */
  reason?: string;
}

/**
 * 선택적 사유를 요청 본문에 담을지 정한다 — 비었으면 키 자체를 뺀다(undefined 로도 넣지 않는다).
 * 서버는 사유가 없으면 bookingSource 로 파생하므로, 지어낸 문자열을 채우지 않는 것이 정직하다.
 */
function reasonPayload(reason: string | undefined): { reason?: string } {
  const trimmed = reason?.trim() ?? "";
  return trimmed === "" ? {} : { reason: trimmed };
}

/**
 * 비재원(GUEST) 수동 추가 (201).
 *
 * 신규 커밋만 원문 `qrToken` 을 딱 한 번 준다(리플레이는 주지 않는다). 지금 화면은
 * 발급 직후 QR 을 보여 주지 않으므로 토큰을 붙잡아 두지 않는다 — 필요해지면 계약의
 * QR 회전 엔드포인트로 다시 발급한다.
 */
export async function createAdminGuestFamilyBooking(
  input: CreateGuestBookingInput,
  options: AdminBookingMutationOptions,
): Promise<FamilyBookingMutationResult> {
  const body: AdminFamilyBookingCreateRequest = {
    participantType: "GUEST",
    seminarSessionId: input.seminarSessionId,
    contact: input.contact,
    attendanceParty: input.attendanceParty,
    bookingSource: input.bookingSource,
    guest: input.guest,
    ...reasonPayload(input.reason),
  };

  return apiRequest<FamilyBookingMutationResult>("/admin/family-bookings", {
    method: "POST",
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

export interface CreateEnrolledBookingInput {
  seminarSessionId: string;
  /**
   * 대표 학부모 연락처 원문 — write-only 다. 저장·로깅·URL 노출 금지.
   *
   * 계약상 선택한 학생 **전원**의 저장된 모/부 연락처와 digest 가 맞아야 한다
   * (어긋나면 403 STUDENT_CONTACT_OWNERSHIP_MISMATCH). 참석이 모+부(BOTH)여도
   * 대표 연락처는 한쪽이다 — 호출부가 명시적으로 고른 값만 들어온다.
   */
  contact: string;
  attendanceParty: AttendanceParty;
  bookingSource: AdminBookingSource;
  /** 계약 1~10명. 같은 연락처를 쓰는 형제를 한 가족 예약으로 묶는 자리다. */
  studentIds: string[];
  /**
   * 계약상 **선택** — 생략하면 서버가 `bookingSource` 로 감사 사유를 파생한다. 재원생 수동
   * 예약도 자유 사유를 받지 않으므로 비워 보낸다. 없으면 요청 본문에서 **키째** 뺀다.
   */
  reason?: string;
}

/**
 * 재원생 수동 예약 (201) — 취소된 행의 재예약도 이 경로다.
 *
 * 취소된 집계를 되살리거나 지우지 않는다: 서버가 **새 집계**를 만들고 옛 이력은 그대로
 * 남는다(그래서 명단 행의 bookingHistory 가 둘 이상이 된다).
 */
export async function createAdminEnrolledFamilyBooking(
  input: CreateEnrolledBookingInput,
  options: AdminBookingMutationOptions,
): Promise<FamilyBookingMutationResult> {
  const body: AdminFamilyBookingCreateRequest = {
    participantType: "ENROLLED",
    seminarSessionId: input.seminarSessionId,
    contact: input.contact,
    attendanceParty: input.attendanceParty,
    bookingSource: input.bookingSource,
    studentIds: input.studentIds,
    ...reasonPayload(input.reason),
  };

  return apiRequest<FamilyBookingMutationResult>("/admin/family-bookings", {
    method: "POST",
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/* ── 계약 제약 · 오류 코드 ──────────────────────────────────────────────── */

export const BOOKING_REASON_MIN_LENGTH = 3;
export const BOOKING_REASON_MAX_LENGTH = 500;

export function isValidBookingReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= BOOKING_REASON_MIN_LENGTH && trimmed.length <= BOOKING_REASON_MAX_LENGTH;
}

export const CONTACT_MIN_LENGTH = 8;
export const CONTACT_MAX_LENGTH = 40;

/** 낙관적 잠금 실패 — 다른 사람이 먼저 바꿨다는 뜻이므로 다시 읽어야 한다. */
export const BOOKING_VERSION_CONFLICT_CODE = "FAMILY_BOOKING_VERSION_CONFLICT";
export const BOOKING_NOT_EDITABLE_CODE = "FAMILY_BOOKING_NOT_EDITABLE";
export const ACTIVE_BOOKING_EXISTS_CODE = "ACTIVE_FAMILY_BOOKING_EXISTS";
/** 고른 대표 연락처가 그 학생의 저장된 모/부 연락처와 다르다 — 추측하지 말고 다시 고르게 한다. */
export const STUDENT_CONTACT_MISMATCH_CODE = "STUDENT_CONTACT_OWNERSHIP_MISMATCH";
