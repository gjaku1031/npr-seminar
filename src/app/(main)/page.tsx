import { redirect } from "next/navigation";
import { currentUser, listOpenSessions } from "@/server/services";
import { HubView } from "@/views/hub";

// DB를 읽는 페이지 — 빌드 타임 프리렌더가 DB를 치지 않도록 (설계 §5)
export const dynamic = "force-dynamic";

/** 허브 = 메인 (명세 §3). 페이지 = 데이터 로더 + views 위임. */
export default async function HubPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const sessions = await listOpenSessions();
  // 다가오는 설명회 = 가장 이른 예정 (명세 §3.3)
  const upcoming = [...sessions].sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null;

  return <HubView user={user} upcoming={upcoming} />;
}
