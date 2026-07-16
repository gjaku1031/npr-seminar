import { listAllReservations, listOpenSessions, listStudents, requireModuleAccess } from "@/server/services";
import { PreviewView } from "@/views/preview";

export const dynamic = "force-dynamic";

/**
 * 모바일 프리뷰 (명세 §3.1, flows ADMIN-F8) — 폰 프레임 안 ReserveFlow 구동.
 * 같은 서버 데이터를 쓰므로 프리뷰 예약·설문이 콘솔에 즉시 반영된다 (A-05).
 */
export default async function PreviewPage() {
  await requireModuleAccess("preview");

  const [sessions, students, reservations] = await Promise.all([
    listOpenSessions(),
    listStudents(),
    listAllReservations(),
  ]);

  return <PreviewView sessions={sessions} students={students} reservations={reservations} />;
}
