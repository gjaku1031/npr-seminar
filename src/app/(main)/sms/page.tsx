import { listAllReservations, listSessions, listSmsLogs, listSmsTemplates, requireModuleAccess } from "@/server/services";
import { SmsView } from "@/views/sms";

export const dynamic = "force-dynamic";

/** 문자 발송 (명세 §5). ⚠️ 실제 게이트웨이 미연동 — 발송은 로그 적재까지 (명세 §12). */
export default async function SmsPage() {
  await requireModuleAccess("sms");

  const [sessions, templates, logs, reservations] = await Promise.all([
    listSessions(),
    listSmsTemplates(),
    listSmsLogs(),
    listAllReservations(),
  ]);

  return <SmsView sessions={sessions} templates={templates} logs={logs} reservations={reservations} />;
}
