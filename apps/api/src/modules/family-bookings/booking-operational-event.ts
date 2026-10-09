/**
 * 운영 로그에 표시하는 예약 이벤트 종류
 */
export const OPERATIONAL_BOOKING_EVENT_TYPES = [
  "CREATED",
  "UPDATED",
  "CANCELLED",
  "CHECKED_IN",
  "MARKED_NO_SHOW",
] as const;

/**
 * 운영 로그 대상 예약 이벤트 종류
 */
export type OperationalBookingEventType = typeof OPERATIONAL_BOOKING_EVENT_TYPES[number];

/**
 * 운영 로그 표시 문구
 */
export type OperationalBookingEventLabel =
  | "웹앱 예약"
  | "수동 예약"
  | "웹앱 예약 취소"
  | "수동 예약 취소"
  | "입장 완료"
  | "미참석 처리";

/**
 * 예약 이벤트의 운영 로그 표시 문구
 *
 * 생성·변경·취소는 처리 주체가 없으면 보호자 웹앱, 있으면 관리자 수동 처리로 구분
 */
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
