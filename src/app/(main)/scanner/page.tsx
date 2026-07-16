import { listAllReservations, listDevices, listOpenSessions, listStudents, requireModuleAccess } from "@/server/services";
import { ScannerView } from "@/views/scanner";

export const dynamic = "force-dynamic";

/**
 * QR 스캐너 (명세 §9) — 기기 모니터링 → 전체화면 스캔 → 입장 처리.
 * 실카메라 스캔(html5-qrcode) + 연락처 뒷 4자리 다이얼 현장 입장 — qr-poc 이식.
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
