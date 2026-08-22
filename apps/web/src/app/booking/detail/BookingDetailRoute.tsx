"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { BookingDetailView } from "@/views/booking-detail";

const BOOKING_PATH = /^\/booking\/([^/]+)\/?$/;
const BOOKING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 원래 주소의 단일 예약 UUID를 복원한다. 예약 ID는 권한이 아니며 잘못된 경로는 null이다. */
function bookingIdFromPath(pathname: string): string | null {
  const segment = BOOKING_PATH.exec(pathname)?.[1];
  if (!segment) return null;
  try {
    const id = decodeURIComponent(segment);
    return BOOKING_UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** 정적 예약 셸에서 주소창의 ID를 읽어 연락처 확인 화면에만 전달한다. */
export function BookingDetailRoute() {
  const bookingId = useSyncExternalStore(
    () => () => {},
    () => bookingIdFromPath(window.location.pathname),
    () => undefined,
  );

  if (bookingId === undefined) return <p role="status">예약 링크를 확인하고 있습니다…</p>;
  if (bookingId === null) {
    return (
      <main style={{ maxWidth: 480, margin: "48px auto", padding: 24, textAlign: "center" }}>
        <h1>올바르지 않은 예약 링크입니다.</h1>
        <p>받으신 주소를 다시 확인해 주세요.</p>
        <Link href="/">예약 안내로 돌아가기</Link>
      </main>
    );
  }

  return <BookingDetailView familyBookingId={bookingId} />;
}
