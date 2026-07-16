// entities/reservation 공개 API (barrel). (설계 §4.1)
export {
  reservationStatusLabel,
  reservationChannelLabel,
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
  ReservationFilter,
  ReservationHistory,
  ReservationAudit,
  CancelledBy,
  SmsTargetGroup,
} from "./model/reservation";
