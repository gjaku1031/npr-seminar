import { getSessionStats, listOpenSessions } from "@/server/services";
import { ReserveView } from "@/views/reserve";

export const dynamic = "force-dynamic";

export const metadata = { title: "npr 입시설명회 예약" };

/**
 * 학부모 모바일 예약 (명세 §10 · flows PARENT-P1~P6) — **로그인 없는 공개 라우트**.
 * (main) 그룹 밖에 두어 콘솔 셸·인증 가드를 타지 않는다.
 */
export default async function ReservePage() {
  const sessions = await listOpenSessions();
  const withStats = await Promise.all(
    sessions.map(async (session) => ({ session, stats: await getSessionStats(session.id) })),
  );

  return <ReserveView sessions={withStats} />;
}
