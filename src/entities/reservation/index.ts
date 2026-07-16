// entities/reservation 공개 API (barrel). (설계 §4.1)
// ⚠️ ReservationQr는 클라이언트 컴포넌트 — server 존은 이 barrel에서 타입·순수 함수만 가져간다 (R5).
export { ReservationQr, buildQrPath } from "./ui/ReservationQr";
export {
  ROSTER_OPTIONS,
  reservationStatusLabel,
  reservationChannelLabel,
  createdLogLabel,
  cancelledLogLabel,
  isActiveReservation,
  canCheckIn,
  canRollback,
  formatReservationCode,
  reissuedCode,
} from "./model/reservation";
export type {
  Reservation,
  ReservationDraft,
  ReservationStatus,
  ReservationChannel,
  ReservationLog,
  ReservationHistory,
  ReservationAudit,
  ReservedBy,
  ReservationSource,
  RosterOption,
  CancelledBy,
  SmsTargetGroup,
} from "./model/reservation";
