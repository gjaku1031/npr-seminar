// entities/reservation 공개 API (barrel). (설계 §4.1)
// ⚠️ ReservationQr는 클라이언트 컴포넌트 — server 존은 이 barrel에서 타입·순수 함수만 가져간다 (R5).
// buildQrPath 는 삭제됐다 — 원문 QR 은 URL 로 감싸지 않는다 (계약: path/query 금지).
export { MIN_SCANNABLE_QR_SIZE, ReservationQr } from "./ui/ReservationQr";
export { parseBookingAccessFragment } from "./lib/booking-access-fragment";
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
