import Link from "next/link";
import { listOpenSessions, requireModuleAccess } from "@/server/services";
import { ModuleScaffold, ScaffoldCount } from "@/shared/ui";

export const dynamic = "force-dynamic";

/**
 * 모바일예약 프리뷰 (명세 §9) — 테스트 전용. 폰 프레임 안에서 모바일 플로우를 구동한다.
 * 프리뷰에서 만든 예약은 실제 데이터에 반영된다 (명세 §9.2) — 서버가 단일 진실이므로 자동으로 성립.
 */
export default async function PreviewPage() {
  await requireModuleAccess("preview");

  const sessions = await listOpenSessions();

  return (
    <ModuleScaffold
      title="모바일예약 프리뷰"
      description="테스트 전용 · 실제 문자 미발송"
      spec="§9 · §10"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ScaffoldCount label="예약 가능 설명회" value={sessions.length} />
        <Link href="/reserve" target="_blank" className="text-sm text-brand hover:text-accent">
          모바일 예약 페이지 열기 ↗
        </Link>
      </div>
    </ModuleScaffold>
  );
}
