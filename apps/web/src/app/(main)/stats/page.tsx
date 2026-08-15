import { requireModuleAccess } from "@/server/services";
import { StatsView } from "@/views/stats";

export const dynamic = "force-dynamic";

/**
 * 통계 (명세 §8) — 회차 × 캠퍼스 필터.
 * 학생·가족·실 참가자와 운영 상태의 절대 건수를 서버 집계 API에서 읽는다.
 */
export default async function StatsPage() {
  await requireModuleAccess("stats");

  return <StatsView />;
}
