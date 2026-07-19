import type { Metadata } from "next";
import { BookingDetailView } from "@/views/booking-detail";

export const metadata: Metadata = {
  title: "npr 입시설명회 — 예약 확인",
  // 예약 링크가 검색·미리보기로 새지 않게 한다.
  robots: { index: false, follow: false },
};

/**
 * 예약 상세 직접 링크 — **공개 라우트지만 링크만으로는 아무것도 보여주지 않는다**.
 *
 * 경로의 familyBookingId 는 조회 키일 뿐 권한이 아니다. 서버에서 예약을 미리 읽지 않고,
 * 클라이언트가 BOOKING_MANAGE OTP 로 본인 확인을 마친 뒤에만 이 ID 하나를 조회한다.
 */
export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ familyBookingId: string }>;
}) {
  const { familyBookingId } = await params;
  return <BookingDetailView familyBookingId={familyBookingId} />;
}
