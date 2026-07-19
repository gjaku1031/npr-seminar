import { Suspense } from "react";
import { requireModuleAccess } from "@/server/services";
import { StudentStatusView } from "@/views/student-status";

export const dynamic = "force-dynamic";

/**
 * 학생 현황 (계약 tags: Admin students / Admin student sync).
 *
 * 가드는 기존 그대로다: `(main)` 레이아웃이 매 요청 Nest 에 `GET /auth/me` 로 되물어
 * ADMIN 세션만 통과시키고, 여기서 모듈 접근을 한 번 더 확인한다. 화면 데이터는 전부
 * 브라우저가 same-origin `/api/v1` 로 Nest 에서 직접 읽는다 — 이 페이지는 데이터를
 * 미리 불러오지 않는다(로컬 server 존을 거치지 않는다).
 *
 * 목록·동기화 상태 두 요청은 각자의 훅이 마운트 시 독립적으로 띄우므로 나란히 나간다.
 */
export default async function StudentStatusPage() {
  await requireModuleAccess("student-status");

  // 필터 상태를 URL 이 소유한다 — useSearchParams 는 Suspense 경계를 요구한다.
  return (
    <Suspense fallback={null}>
      <StudentStatusView />
    </Suspense>
  );
}
