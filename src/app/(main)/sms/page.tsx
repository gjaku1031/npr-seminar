import { listAllReservations, listSessions, listSmsLogs, listSmsTemplates, requireModuleAccess } from "@/server/services";
import { SmsView } from "@/views/sms";

export const dynamic = "force-dynamic";

/** 문자 발송 (명세 §5) — SOLAPI 게이트웨이 실연동 (키 미설정 시 로그 적재만, server/sms/gateway.ts). */
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
