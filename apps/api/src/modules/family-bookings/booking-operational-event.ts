export const OPERATIONAL_BOOKING_EVENT_TYPES = [
  "CREATED",
  "UPDATED",
  "CANCELLED",
  "CHECKED_IN",
  "MARKED_NO_SHOW",
] as const;

export type OperationalBookingEventType = typeof OPERATIONAL_BOOKING_EVENT_TYPES[number];
export type OperationalBookingEventLabel =
  | "웹앱 예약"
  | "수동 예약"
  | "웹앱 예약 취소"
  | "수동 예약 취소"
  | "입장 완료"
  | "미참석 처리";

export function bookingOperationalEventLabel(
  eventType: OperationalBookingEventType,
  actorSubject: string | null,
): OperationalBookingEventLabel {
  switch (eventType) {
    case "CREATED":
    case "UPDATED":
      return actorSubject === null ? "웹앱 예약" : "수동 예약";
    case "CANCELLED":
      return actorSubject === null ? "웹앱 예약 취소" : "수동 예약 취소";
    case "CHECKED_IN":
      return "입장 완료";
    case "MARKED_NO_SHOW":
      return "미참석 처리";
  }
}
