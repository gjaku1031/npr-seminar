import type { Metadata } from "next";
import { BookingAccessView } from "@/views/booking-access";
import { brandSeminarTitle } from "@/shared/ui/brand";

/**
 * 페이지 메타데이터
 */
export const metadata: Metadata = {
  title: `${brandSeminarTitle()} — 예약 관리`,
  // 개인 링크가 검색·미리보기로 새지 않게 함
  robots: { index: false, follow: false },
};

/**
 * SMS 개인 링크 목적지 (`/booking/access#token=...`)
 *
 * ⚠️ 서버에서 fragment 를 읽지 않음 — fragment 는 서버로 전송되지 않으며, 파싱·교환은
 * 클라이언트 `BookingAccessView` 만 함. 서버는 예약 데이터를 미리 읽지 않음
 */
export default function BookingAccessPage() {
  return <BookingAccessView />;
}
