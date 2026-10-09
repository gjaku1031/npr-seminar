/**
 * 관리자 취소 유형. 전화·선생님·기타 요청
 */
export const ADMIN_BOOKING_CANCELLATION_TYPES = ["PHONE", "TEACHER", "OTHER"] as const;

/**
 * 관리자 취소 유형
 */
export type AdminBookingCancellationType = (typeof ADMIN_BOOKING_CANCELLATION_TYPES)[number];

/**
 * 예약 취소 유형. SELF_SERVICE는 보호자가 직접 취소
 */
export type BookingCancellationType = "SELF_SERVICE" | AdminBookingCancellationType;
