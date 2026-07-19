export const ADMIN_BOOKING_CANCELLATION_TYPES = ["PHONE", "TEACHER", "OTHER"] as const;

export type AdminBookingCancellationType = (typeof ADMIN_BOOKING_CANCELLATION_TYPES)[number];

export type BookingCancellationType = "SELF_SERVICE" | AdminBookingCancellationType;
