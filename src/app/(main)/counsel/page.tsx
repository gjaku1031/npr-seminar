import { requireModuleAccess } from "@/server/services";
import { CounselView } from "@/views/counsel";

export const dynamic = "force-dynamic";

/** 간담회 예약 (명세 §7) — 준비 중 placeholder. 요구사항 확정 후 구현 (flows ADMIN-F5). */
export default async function CounselPage() {
  await requireModuleAccess("counsel");

  return <CounselView />;
}
