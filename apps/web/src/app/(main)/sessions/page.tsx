import { requireModuleAccess } from "@/server/services";
import { SessionsView } from "@/views/sessions";

export const dynamic = "force-dynamic";

/**
 * 설명회 운영 (명세 §6) — 회차 목록·정원 원장·만족도.
 * 데이터는 뷰가 계약에서 직접 읽는다 (회차 원장이 곧 서버 집계다).
 */
export default async function SessionsPage() {
  await requireModuleAccess("sessions");

  return <SessionsView />;
}
