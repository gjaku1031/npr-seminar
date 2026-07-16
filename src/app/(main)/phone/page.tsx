import { listReservations, listSessions, requireModuleAccess } from "@/server/services";
import { ModuleScaffold, ScaffoldCount } from "@/shared/ui";

export const dynamic = "force-dynamic";

/** 전화예약 관리 (명세 §5) — 수동예약·상세 패널·QR/문자. */
export default async function PhonePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireModuleAccess("phone");

  const { id } = await searchParams;
  const sessions = await listSessions();
  const selected = sessions.find((s) => s.id === id) ?? sessions[0] ?? null;
  const reservations = selected ? await listReservations(selected.id) : [];

  return (
    <ModuleScaffold
      title="전화예약 관리"
      description={selected ? `${selected.title} · 수동예약 · QR/문자 상세` : "수동예약 · QR/문자 상세"}
      spec="§5 · 12.2 · 12.12"
    >
      <div className="flex flex-wrap gap-2">
        <ScaffoldCount label="전화 접수" value={reservations.filter((r) => r.channel === "phone").length} />
        <ScaffoldCount label="입장 완료" value={reservations.filter((r) => r.status === "entered").length} />
        <ScaffoldCount label="미체크" value={reservations.filter((r) => r.status === "reserved").length} />
        <ScaffoldCount label="취소" value={reservations.filter((r) => r.status === "cancelled").length} />
      </div>
    </ModuleScaffold>
  );
}
