import { isBatteryLow } from "@/entities/device";
import { listDevices, listOpenSessions, requireModuleAccess } from "@/server/services";
import { ModuleScaffold, ScaffoldCount } from "@/shared/ui";

export const dynamic = "force-dynamic";

/**
 * QR 스캐너 (명세 §8) — 기기 모니터링 → 전체화면 스캔 → 입장 처리.
 * ⚠️ 실제 카메라·QR 인식 미구현 (명세 §11). 입장 처리 액션(features/check-in)은 준비돼 있다.
 */
export default async function ScannerPage() {
  await requireModuleAccess("scanner");

  const [devices, sessions] = await Promise.all([listDevices(), listOpenSessions()]);

  return (
    <ModuleScaffold
      title="QR 스캐너"
      description="기기 모니터링 · 현장 입장 처리 (카메라 미연동)"
      spec="§8 · 12.12"
    >
      <div className="flex flex-wrap gap-2">
        <ScaffoldCount label="기기" value={devices.length} />
        <ScaffoldCount label="ON" value={devices.filter((d) => d.on).length} />
        <ScaffoldCount label="배터리 경고" value={devices.filter(isBatteryLow).length} />
        <ScaffoldCount label="진행 설명회" value={sessions.length} />
      </div>
    </ModuleScaffold>
  );
}
