import { listReservations, listSessionsWithStats, requireModuleAccess } from "@/server/services";
import { SessionsView } from "@/views/sessions";

export const dynamic = "force-dynamic";

/**
 * 설명회 운영 (명세 §7). 페이지 = 데이터 로더 + views 위임 (설계 §5).
 * 선택 설명회는 URL searchParams가 소유한다 — 서버 상태와 URL 상태의 경계.
 */
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireModuleAccess("sessions");

  const { id } = await searchParams;
  const sessions = await listSessionsWithStats();
  const selected = sessions.find((s) => s.session.id === id) ?? sessions[0] ?? null;
  const reservations = selected ? await listReservations(selected.session.id) : [];

  return <SessionsView sessions={sessions} selected={selected} reservations={reservations} />;
}
