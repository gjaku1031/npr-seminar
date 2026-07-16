// entities/reservation 공개 API (barrel). (설계 §4.1)
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
