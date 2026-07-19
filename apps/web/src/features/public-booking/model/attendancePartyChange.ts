/**
 * 참석 학부모(모·부·모/부) 변경의 순수 규칙 — 공개 예약 관리(설계 §4.1) 전용.
 *
 * 개인 링크 관리 세션과 legacy OTP 모드 모두, 회차 이동과 **별개로** 참석 학부모를 바꿀 수 있다.
 * 좌석 수는 서버가 attendanceParty 로만 파생하므로, 프론트는 어떤 학생 스냅샷도 손대지 않고
 * attendanceParty + expectedVersion 만 보낸다.
 *
 * 훅에서 떼어 순수 함수로 두는 이유: "어떤 선택지를 순서대로 보여 줄지"와 "무엇을 PATCH 본문으로
 * 보낼지"는 React 상태 없이 검증할 수 있어야 한다 — 특히 학생 변경 필드가 새어 나가지 않는지.
 */

import type { AttendanceParty, PublicFamilyBookingUpdateRequest } from "../../../shared/api/contract";

/** 선택지 순서 — 계약 enum 그대로(모 · 부 · 모/부). 학생 변경은 이 동선의 범위가 아니다. */
export const ATTENDANCE_PARTY_ORDER: readonly AttendanceParty[] = ["MOTHER", "FATHER", "BOTH"];

/** 화면이 그릴 참석 학부모 선택지 한 줄 — 값·현재 여부. 좌석 수는 화면이 seatCountFor 로 파생한다. */
export interface AttendancePartyOption {
  party: AttendanceParty;
  /** 지금 예약의 참석 학부모인가 — 화면에서 "현재"로 표시하고 재요청을 막는 근거. */
  current: boolean;
}

/** 현재 참석 학부모를 기준으로 3개 선택지를 순서대로 만든다. */
export function attendancePartyOptions(current: AttendanceParty): AttendancePartyOption[] {
  return ATTENDANCE_PARTY_ORDER.map((party) => ({ party, current: party === current }));
}

/**
 * 참석 학부모 변경 PATCH 본문.
 * ★ attendanceParty + expectedVersion 만 싣는다 — studentIds·학생 스냅샷 같은 학생 변경 필드는
 *   절대 포함하지 않는다(좌석 수는 서버가 attendanceParty 로만 파생한다).
 */
export function attendancePartyUpdateRequest(
  party: AttendanceParty,
  expectedVersion: number,
): PublicFamilyBookingUpdateRequest {
  return { attendanceParty: party, expectedVersion };
}
