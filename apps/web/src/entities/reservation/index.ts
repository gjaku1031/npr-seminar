// entities/reservation 공개 API (barrel)
// ⚠️ ReservationQr는 클라이언트 컴포넌트 — server 존은 이 barrel에서 타입·순수 함수만 가져감 (R5)
// 원문 QR 은 URL 로 감싸지 않음 (계약: path/query 금지)
// 예약의 형태(상태·채널·로그 라벨)는 계약이 정함. @/shared/api/contract.ts 참조
export { MIN_SCANNABLE_QR_SIZE, ReservationQr } from "./ui/ReservationQr";
export {
  parseBookingAccessFragment,
  initBookingAccessFragment,
} from "./lib/booking-access-fragment";
export type {
  BookingAccessLocationInit,
  BookingAccessFragmentInit,
} from "./lib/booking-access-fragment";
