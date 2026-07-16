import {
  listAllReservations,
  listDevices,
  listSessions,
  listSmsLogs,
  listStudents,
  requireModuleAccess,
} from "@/server/services";
import { fmtDateTimeShort } from "@/shared/lib/format";
import { HubView } from "@/views/hub";

// DB를 읽는 페이지 — 빌드 타임 프리렌더가 DB를 치지 않도록 (설계 §5)
export const dynamic = "force-dynamic";

/** 허브 = 카드 런처 (명세 §3). 페이지 = 데이터 로더 + views 위임. */
export default async function HubPage() {
  await requireModuleAccess("students");

  const [sessions, students, reservations, smsLogs, devices] = await Promise.all([
    listSessions(),
    listStudents(),
    listAllReservations(),
    listSmsLogs(),
    listDevices(),
  ]);

  const active = reservations.filter((r) => r.status !== "cancelled");

  return (
    <HubView
      sessions={sessions}
      studentCount={students.length}
      activeCount={active.length}
      enteredCount={active.filter((r) => r.status === "entered").length}
      lastSmsAt={smsLogs[0] ? fmtDateTimeShort(smsLogs[0].when) : null}
      devicesOn={devices.filter((d) => d.on).length}
    />
  );
}
