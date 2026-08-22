import { Suspense } from "react";
import { StudentStatusView } from "@/views/student-status";

/**
 * 학생 현황 (계약 tags: Admin students / Admin student sync).
 *
 * `(main)` 레이아웃의 브라우저 게이트가 ADMIN 세션을 확인한다. 화면 데이터는 전부
 * 브라우저가 same-origin `/api/v1` 로 Nest 에서 직접 읽는다 — 이 페이지는 데이터를
 * 미리 불러오지 않는다(로컬 server 존을 거치지 않는다).
 *
 * 목록·동기화 상태 두 요청은 각자의 훅이 마운트 시 독립적으로 띄우므로 나란히 나간다.
 */
export default function StudentStatusPage() {
  // 필터 상태를 URL 이 소유한다 — useSearchParams 는 Suspense 경계를 요구한다.
  return (
    <Suspense fallback={null}>
      <StudentStatusView />
    </Suspense>
  );
}
