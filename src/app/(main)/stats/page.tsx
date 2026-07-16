import { listAllReservations, listSessions, listStudents, listSurveyResponses, requireModuleAccess } from "@/server/services";
import { StatsView } from "@/views/stats";

export const dynamic = "force-dynamic";

/**
 * 통계 (명세 §8) — 설명회 × 캠퍼스 필터가 즉시 반응하도록 원자료를 내려준다(와이어프레임 동일).
 * 서버 집계 계약은 getStatsOverview(services)가 담당 — BE 전환 시 그 경로로 대체한다.
 */
export default async function StatsPage() {
  await requireModuleAccess("stats");

  const [sessions, reservations, students] = await Promise.all([
    listSessions(),
    listAllReservations(),
    listStudents(),
  ]);
  const surveys = (await Promise.all(sessions.map((s) => listSurveyResponses(s.id)))).flat();

  return <StatsView sessions={sessions} reservations={reservations} students={students} surveys={surveys} />;
}
