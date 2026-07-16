import { listAllReservations, listSessions, listSurveyResponses, requireModuleAccess } from "@/server/services";
import { SessionsView } from "@/views/sessions";

export const dynamic = "force-dynamic";

/**
 * 설명회 운영 (명세 §6) — 목록·현황·만족도 설문 관리.
 * 목록 게이지·현황 집계가 전 세션 예약을 쓰므로 원자료를 내려준다(와이어프레임 동일).
 */
export default async function SessionsPage() {
  await requireModuleAccess("sessions");

  const [sessions, reservations] = await Promise.all([listSessions(), listAllReservations()]);
  const surveys = (await Promise.all(sessions.map((s) => listSurveyResponses(s.id)))).flat();

  return <SessionsView sessions={sessions} reservations={reservations} surveys={surveys} />;
}
