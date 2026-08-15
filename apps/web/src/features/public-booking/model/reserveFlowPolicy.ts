/**
 * 예약 플로우 정책 — 순수 함수 (DOM·React 없음, node:test 로 검증).
 *
 * 비재원 진입 가능 여부, 유형별 회차 가시성·선택 가능 여부, 캠퍼스 회차 수를 한 곳에서 판정한다.
 * 화면은 이 판정만 쓰고 회차 배열을 곳곳에서 다시 세지 않는다.
 *
 * ★ node:test(tsx) 가 `@/` alias 를 풀지 않으므로 계약 모듈을 관계 경로로 가리킨다.
 */

import type {
  Branch,
  PublicMaskedFamilyBookingParticipant,
  PublicSeminarSession,
} from "../../../shared/api/contract";

/** 참가 유형 — 화면 흐름에만 두고 proof 에는 넣지 않는다. */
export type ParticipantType = "ENROLLED" | "GUEST";

/** 비재원 카드가 데이터에서 파생하는 정직한 상태(boolean 하나로 오류를 숨기지 않는다). */
export type GuestEntryState = "loading" | "error" | "disabled" | "enabled";

/**
 * 비재원 진입 상태.
 * - loading/error: 열지 않는다(실패 시 임의 활성화 금지).
 * - enabled: **성공적으로 불러온** 공개 목록에 guestBookingEnabled=true 회차가 하나라도 있음.
 * - disabled: 그런 회차가 하나도 없음.
 */
export function guestEntryState(
  loading: boolean,
  error: string | null,
  sessions: PublicSeminarSession[],
): GuestEntryState {
  if (loading) return "loading";
  if (error !== null) return "error";
  return sessions.some((s) => s.guestBookingEnabled) ? "enabled" : "disabled";
}

/** 캠퍼스 노출 규칙: ALL 회차는 모든 캠퍼스, BRANCH 회차는 자기 지점에만. */
function isVisibleAtBranch(session: PublicSeminarSession, branch: Branch): boolean {
  return session.scope === "ALL" || session.branch === branch;
}

/**
 * 유형별 회차 가시성 — GUEST 는 캠퍼스 가시성 + guestBookingEnabled=true 를 동시에 만족해야 한다.
 * ENROLLED 는 캠퍼스 가시성만 본다.
 */
export function isSessionVisibleForType(
  session: PublicSeminarSession,
  branch: Branch,
  type: ParticipantType,
): boolean {
  if (!isVisibleAtBranch(session, branch)) return false;
  return type === "GUEST" ? session.guestBookingEnabled : true;
}

/** 선택 캠퍼스·유형에서 보이는 회차. branch·type 이 없으면 빈 배열. */
export function sessionsForType(
  sessions: PublicSeminarSession[],
  branch: Branch | null,
  type: ParticipantType | null,
): PublicSeminarSession[] {
  if (branch === null || type === null) return [];
  return sessions.filter((s) => isSessionVisibleForType(s, branch, type));
}

/** 캠퍼스 카드에 보일 회차 수(유형 규칙 반영). */
export function campusSessionCount(
  sessions: PublicSeminarSession[],
  branch: Branch,
  type: ParticipantType | null,
): number {
  if (type === null) return 0;
  return sessions.filter((s) => isSessionVisibleForType(s, branch, type)).length;
}

/**
 * 회차 선택 가능 여부 — availability=AVAILABLE 이어야 하고, GUEST 면 guestBookingEnabled 도 필요하다.
 * 클릭 직전과 렌더 모두 이 판정을 쓴다.
 */
export function isSessionBookableForType(
  session: PublicSeminarSession,
  type: ParticipantType,
): boolean {
  if (session.availability !== "AVAILABLE") return false;
  return type === "GUEST" ? session.guestBookingEnabled : true;
}

/**
 * 회차 이동 대상 판정에 필요한 예약의 최소 형태 — 마스킹 DTO 참가자에서 유형·캠퍼스만 읽는다.
 * (전체 예약이 아니라 이 좁은 구조만 요구해 타입을 약화시키지 않고 순수 테스트를 쉽게 한다.)
 */
export interface MoveSourceBooking {
  seminarSessionId: string;
  participants: ReadonlyArray<Pick<PublicMaskedFamilyBookingParticipant, "participantType" | "branch">>;
}

/**
 * 예약 유형 — 계약상 가족 예약의 참가자는 동질(전원 ENROLLED 또는 전원 GUEST)이지만,
 * GUEST 가 하나라도 섞이면 비재원 예약으로 본다(백엔드 GUEST_BOOKING_DISABLED 거절을 피하는 방어적 판정).
 */
export function bookingParticipantType(
  participants: MoveSourceBooking["participants"],
): ParticipantType {
  return participants.some((p) => p.participantType === "GUEST") ? "GUEST" : "ENROLLED";
}

/**
 * 회차 이동 후보 — 현재 회차 제외 + 캠퍼스 호환(ALL 이거나 전원 같은 지점) +
 * AVAILABLE, 그리고 **GUEST 예약이면 guestBookingEnabled=true** 까지 만족하는 회차만.
 * ENROLLED 예약은 guestBookingEnabled 플래그의 영향을 받지 않는다.
 * 화면은 이 판정만 쓰고 필터 규칙을 다시 세우지 않는다.
 */
export function moveTargetSessions(
  sessions: PublicSeminarSession[],
  booking: MoveSourceBooking,
): PublicSeminarSession[] {
  const type = bookingParticipantType(booking.participants);
  return sessions.filter(
    (s) =>
      s.seminarSessionId !== booking.seminarSessionId &&
      (s.scope === "ALL" || booking.participants.every((p) => p.branch === s.branch)) &&
      isSessionBookableForType(s, type),
  );
}

/** 회차가 비재원 예약을 닫아둔 경우의 정확한 안내(백엔드 code=GUEST_BOOKING_DISABLED 대응). */
export const GUEST_BOOKING_DISABLED_MESSAGE =
  "이 회차는 비재원생 예약이 닫혀 있습니다. 다른 회차를 선택해 주세요.";

/**
 * 예약 관리 실패의 **정확한 code → 한국어 문구** 매핑(HTTP status 폴백보다 먼저).
 * 매핑이 없으면 null 을 돌려 호출부가 status 기반 문구로 떨어지게 한다.
 * ApiError 를 import 하지 않는 순수 함수라 code 문자열만으로 테스트한다.
 *
 * proof 계열(BOOKING_PROOF_*)은 인증을 다시 받아야 하는 상황이고, 낙관적 잠금 충돌
 * (FAMILY_BOOKING_VERSION_CONFLICT)과 예약 가능 기간 정책 계열은 예약을 다시 조회하거나 다른 회차를
 * 골라야 하는 상황이라 서로 다른 문구로 정확히 가른다.
 */
const MANAGE_ERROR_MESSAGES = new Map<string, string>([
  ["GUEST_BOOKING_DISABLED", GUEST_BOOKING_DISABLED_MESSAGE],
  ["BOOKING_PROOF_INVALID", "본인 인증이 만료되었거나 유효하지 않습니다. 인증번호를 다시 받아 주세요."],
  ["BOOKING_PROOF_SCOPE_INVALID", "이 작업을 진행할 수 있는 인증이 아닙니다. 인증번호를 다시 받아 주세요."],
  ["BOOKING_PROOF_CONTACT_MISMATCH", "예약하신 연락처로 인증해 주세요. 인증한 번호가 예약자와 일치하지 않습니다."],
  ["BOOKING_PROOF_ALREADY_USED", "이미 사용된 인증입니다. 인증번호를 다시 받아 주세요."],
  ["FAMILY_BOOKING_VERSION_CONFLICT", "예약이 다른 곳에서 먼저 변경됐습니다. 예약을 다시 조회해 주세요."],
  ["SESSION_NOT_BOOKABLE", "선택하신 회차는 지금 예약을 변경할 수 없습니다. 다른 회차를 선택해 주세요."],
  ["BOOKING_WINDOW_CLOSED", "예약을 변경할 수 있는 기간이 지났습니다."],
  ["SESSION_BRANCH_MISMATCH", "선택하신 회차가 참가자 캠퍼스와 맞지 않습니다."],
]);

export function manageErrorMessageForCode(code: string): string | null {
  return MANAGE_ERROR_MESSAGES.get(code) ?? null;
}
