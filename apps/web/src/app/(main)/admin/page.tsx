import { requireModuleAccess } from "@/server/services";
import { HubView } from "@/views/hub";

export const dynamic = "force-dynamic";

/**
 * 관리자 허브 = 카드 런처 (명세 §3). 페이지가 하는 일은 권한 확인뿐이고, 숫자는 뷰가
 * 계약(Nest `/api/v1`)에서 직접 읽는다.
 *
 * 라우트: `/` → `/admin` 으로 이동했다. `/` 는 이제 학부모 공개 예약 앱이고,
 * 콘솔은 로그인 뒤 `/admin` 에서 시작한다 (`(main)` 그룹이 인증을 강제한다).
 *
 * 허브 자체는 모듈이 아니라서 명단 모듈의 권한을 빌려 판정한다.
 */
export default async function AdminHubPage() {
  await requireModuleAccess("students");

  return <HubView />;
}
