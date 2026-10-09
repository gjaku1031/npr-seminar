// features/public-booking 공개 API (barrel). 학부모 공개 예약
export { publicBranchLabel } from "./model/publicBranchLabel";

export { formatContactInput, isCompleteContact, normalizeContactDigits } from "./model/contact";

export { useBookingProof } from "./model/useBookingProof";
export type { BookingProof, BookingProofState } from "./model/useBookingProof";

export { useOtpFlow } from "./model/useOtpFlow";
export type { OtpFlowState, OtpStage, UseOtpFlowOptions } from "./model/useOtpFlow";

export { usePublicSessions } from "./model/usePublicSessions";
export type { PublicSessionsState } from "./model/usePublicSessions";

export {
  bookingParticipantType,
  campusSessionCount,
  GUEST_BOOKING_DISABLED_MESSAGE,
  guestEntryState,
  isSessionBookableForType,
  manageErrorMessageForCode,
  moveTargetSessions,
  sessionsForType,
} from "./model/reserveFlowPolicy";
export type { GuestEntryState, MoveSourceBooking, ParticipantType } from "./model/reserveFlowPolicy";

export {
  ATTENDANCE_PARTY_ORDER,
  attendancePartyOptions,
  attendancePartyUpdateRequest,
} from "./model/attendancePartyChange";
export type { AttendancePartyOption } from "./model/attendancePartyChange";
