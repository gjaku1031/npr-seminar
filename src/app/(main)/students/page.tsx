import { listReservations, listSessions, listStudents, listTeachers, requireModuleAccess } from "@/server/services";
import { StudentsView } from "@/views/students";

export const dynamic = "force-dynamic";

/**
 * 예약 명단 (명세 §4) — 설명회별 재원생 전체 + 비재원생 11열.
 * 선택 설명회는 URL searchParams가 소유. 검색·캠퍼스·단위 필터는 화면이 즉시 반응(클라이언트).
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireModuleAccess("students");

  const { id } = await searchParams;
  const [sessions, students, teachers] = await Promise.all([
    listSessions(),
    listStudents(),
    listTeachers(),
  ]);
  const selected = sessions.find((s) => s.id === id) ?? sessions[0] ?? null;
  const reservations = selected ? await listReservations(selected.id) : [];

  return (
    <StudentsView
      sessions={sessions}
      selectedSessionId={selected?.id ?? null}
      students={students}
      reservations={reservations}
      teachers={teachers}
    />
  );
}
