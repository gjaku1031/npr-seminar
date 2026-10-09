import type { Metadata } from "next";
import { BookingDetailRoute } from "./BookingDetailRoute";
import { brandSeminarTitle } from "@/shared/ui/brand";

/**
 * 페이지 메타데이터
 */
export const metadata: Metadata = {
  title: `${brandSeminarTitle()} — 예약 확인`,
  robots: { index: false, follow: false },
};

/**
 * 기존 `/booking/{UUID}` 요청을 CDN이 이 HTML로 재작성하며 주소는 브라우저에 그대로 남음
 */
export default function BookingDetailPage() {
  return <BookingDetailRoute />;
}
