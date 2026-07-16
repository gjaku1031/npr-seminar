import { listCounselBookings, listCounselSlots, listTeachers, requireModuleAccess } from "@/server/services";
import { ModuleScaffold, ScaffoldCount } from "@/shared/ui";

export const dynamic = "force-dynamic";

/** 상담 예약 (명세 12.10) — 슬롯 그리드(강사×일시) + 신청 목록. */
export default async function CounselPage() {
  await requireModuleAccess("counsel");

  const [slots, bookings, teachers] = await Promise.all([
    listCounselSlots(),
    listCounselBookings(),
    listTeachers(),
  ]);

  return (
    <ModuleScaffold title="상담 예약" description="슬롯 그리드 · 신청 모니터링" spec="12.10">
      <div className="flex flex-wrap gap-2">
        <ScaffoldCount label="강사" value={teachers.length} />
        <ScaffoldCount label="슬롯" value={slots.length} />
        <ScaffoldCount label="가능 슬롯" value={slots.filter((s) => !s.booked).length} />
        <ScaffoldCount label="신청" value={bookings.length} />
      </div>
    </ModuleScaffold>
  );
}
