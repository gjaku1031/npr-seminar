import { requireModuleAccess } from "@/server/services";
import { StatsView } from "@/views/stats";

export const dynamic = "force-dynamic";

/**
 * 통계 (명세 §8) — 회차 × 분원 필터.
 * 계약에 집계 엔드포인트가 없어, 뷰가 서버가 이미 센 값(정원 원장 · page.totalItems ·
 * 설문 summary)만 조합한다.
 */
export default async function StatsPage() {
  await requireModuleAccess("stats");

  return <StatsView />;
}
