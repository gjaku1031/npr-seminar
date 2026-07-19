import type { Metadata } from "next";
import { BookingAccessView } from "@/views/booking-access";

export const metadata: Metadata = {
  title: "npr 입시설명회 — 예약 관리",
  // 개인 링크가 검색·미리보기로 새지 않게 한다.
  robots: { index: false, follow: false },
};

/**
 * SMS 개인 링크 목적지 (`/booking/access#token=...`).
 *
 * ⚠️ 서버에서 fragment 를 읽지 않는다 — fragment 는 서버로 전송되지 않으며, 파싱·교환은
 * 클라이언트 `BookingAccessView` 만 한다. 서버는 예약 데이터를 미리 읽지 않는다.
 */
export default function BookingAccessPage() {
  return <BookingAccessView />;
}
