import { Suspense } from "react";
import { StudentsView } from "@/views/students";

/**
 * 예약 명단 (계약 tag: Admin family bookings) — 설명회 회차별 가족 예약.
 *
 * `(main)` 레이아웃의 브라우저 게이트가 ADMIN 세션을 확인한다.
 *
 * 데이터는 전부 브라우저가 same-origin `/api/v1` 로 Nest 에서 직접 읽는다 — 이 페이지는
 * 명단을 서버에서 미리 불러오지 않는다.
 */
export default function StudentsPage() {
  // 회차·필터 상태를 URL 이 소유한다 — useSearchParams 는 Suspense 경계를 요구한다.
  return (
    <Suspense fallback={null}>
      <StudentsView />
    </Suspense>
  );
}
