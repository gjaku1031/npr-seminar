// entities/reservation 공개 API (barrel). (설계 §4.1)
// ⚠️ ReservationQr는 클라이언트 컴포넌트 — server 존은 이 barrel에서 타입·순수 함수만 가져간다 (R5).
// buildQrPath 는 삭제됐다 — 원문 QR 은 URL 로 감싸지 않는다 (계약: path/query 금지).
//
// 예약의 형태(Reservation·상태·채널·로그 라벨)는 이제 계약이 정한다 — @/shared/api/contract.ts.
// 여기 있던 레거시 도메인 모델(model/reservation.ts)은 Drizzle 리포지토리와 함께 제거됐다.
export { MIN_SCANNABLE_QR_SIZE, ReservationQr } from "./ui/ReservationQr";
export {
  parseBookingAccessFragment,
  initBookingAccessFragment,
} from "./lib/booking-access-fragment";
export type {
  BookingAccessLocationInit,
  BookingAccessFragmentInit,
} from "./lib/booking-access-fragment";
