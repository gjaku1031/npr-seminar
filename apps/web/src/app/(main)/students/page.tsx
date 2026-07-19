import { Suspense } from "react";
import { requireModuleAccess } from "@/server/services";
import { StudentsView } from "@/views/students";

export const dynamic = "force-dynamic";

/**
 * 예약 명단 (계약 tag: Admin family bookings) — 설명회 회차별 가족 예약.
 *
 * 가드는 기존 그대로다: `(main)` 레이아웃이 매 요청 Nest 에 `GET /auth/me` 로 되물어
 * ADMIN 세션만 통과시키고, 여기서 모듈 접근을 한 번 더 확인한다.
 *
 * 데이터는 전부 브라우저가 same-origin `/api/v1` 로 Nest 에서 직접 읽는다 — 이 페이지는
 * 더 이상 로컬 server 존(메모리·drizzle 리포지토리)에서 명단을 미리 불러오지 않는다.
 */
export default async function StudentsPage() {
  await requireModuleAccess("students");

  // 회차·필터 상태를 URL 이 소유한다 — useSearchParams 는 Suspense 경계를 요구한다.
  return (
    <Suspense fallback={null}>
      <StudentsView />
    </Suspense>
  );
}
