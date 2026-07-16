import { listAllReservations, listDevices, listOpenSessions, listStudents, requireModuleAccess } from "@/server/services";
import { ScannerView } from "@/views/scanner";

export const dynamic = "force-dynamic";

/**
 * QR 스캐너 (명세 §9) — 기기 모니터링 → 전체화면 스캔 → 입장 처리.
 * ⚠️ 실제 카메라·QR 인식 미구현 (명세 §12) — 스캔은 데모 버튼으로 시뮬레이션.
 */
export default async function ScannerPage() {
  await requireModuleAccess("scanner");

  const [sessions, students, reservations, devices] = await Promise.all([
    listOpenSessions(),
    listStudents(),
    listAllReservations(),
    listDevices(),
  ]);

  return <ScannerView sessions={sessions} students={students} reservations={reservations} devices={devices} />;
}
