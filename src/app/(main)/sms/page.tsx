import { listSmsLogs, listSmsTemplates, requireModuleAccess } from "@/server/services";
import { ModuleScaffold, ScaffoldCount } from "@/shared/ui";

export const dynamic = "force-dynamic";

/** 문자 발송 (명세 §6). ⚠️ 실제 게이트웨이 미연동 — 로그 적재까지 (명세 §11). */
export default async function SmsPage() {
  await requireModuleAccess("sms");

  const [templates, logs] = await Promise.all([listSmsTemplates(), listSmsLogs()]);

  return (
    <ModuleScaffold
      title="문자 발송"
      description="템플릿 · 변수 칩 · 대상 선택 · 발송 로그 (게이트웨이 미연동)"
      spec="§6 · 12.5"
    >
      <div className="flex flex-wrap gap-2">
        <ScaffoldCount label="템플릿" value={templates.length} />
        <ScaffoldCount label="발송 로그" value={logs.length} />
      </div>
    </ModuleScaffold>
  );
}
