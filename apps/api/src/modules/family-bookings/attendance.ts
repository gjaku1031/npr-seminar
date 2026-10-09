/**
 * 참석 보호자. 어머니·아버지·둘 다
 */
export type AttendanceParty = "MOTHER" | "FATHER" | "BOTH";

/**
 * 참석 보호자 기준 예약 인원. 둘 다면 2, 아니면 1
 */
export function seatCountFor(party: AttendanceParty): 1 | 2 {
  return party === "BOTH" ? 2 : 1;
}
