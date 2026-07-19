export type AttendanceParty = "MOTHER" | "FATHER" | "BOTH";

export function seatCountFor(party: AttendanceParty): 1 | 2 {
  return party === "BOTH" ? 2 : 1;
}
