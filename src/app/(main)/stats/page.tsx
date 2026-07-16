import { getStatsOverview, requireModuleAccess } from "@/server/services";
import { ModuleScaffold, ScaffoldCount } from "@/shared/ui";

export const dynamic = "force-dynamic";

/**
 * 통계 대시보드 (명세 12.6) — 원장·실장 전용.
 * 강사(gangsa)는 차단된다 (flows GANGSA-G1: 직접 진입 시 허브 리다이렉트).
 */
export default async function StatsPage() {
  await requireModuleAccess("stats");

  const stats = await getStatsOverview();

  return (
    <ModuleScaffold
      title="통계"
      description="누적 예약 · 참석률 · 노쇼율 · 전환율 · 채널 분포"
      spec="12.6"
    >
      <div className="flex flex-wrap gap-2">
        <ScaffoldCount label="누적 예약" value={stats.totalReservations} />
        <ScaffoldCount label="참석률 %" value={stats.attendanceRate} />
        <ScaffoldCount label="노쇼율 %" value={stats.noShowRate} />
        <ScaffoldCount label="전환율 %" value={stats.conversionRate} />
      </div>
    </ModuleScaffold>
  );
}
