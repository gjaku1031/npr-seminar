import { listAllReservations, listOpenSessions, listStudents } from "@/server/services";
import { ReserveView } from "@/views/reserve";

export const dynamic = "force-dynamic";

export const metadata = { title: "npr 입시설명회 — 예약" };

/**
 * 학부모 모바일 예약 (명세 §10 · flows PARENT-P1~P5) — **로그인 없는 공개 라우트**.
 * (main) 그룹 밖에 두어 콘솔 셸·인증 가드를 타지 않는다.
 * 재원생 조회·예약 조회가 클라이언트 매칭이므로 원자료를 내려준다(와이어프레임 동일 —
 * 서버 전환 시 조회 API로 대체, 명세 §12).
 */
export default async function ReservePage() {
  const [sessions, students, reservations] = await Promise.all([
    listOpenSessions(),
    listStudents(),
    listAllReservations(),
  ]);

  return <ReserveView sessions={sessions} students={students} reservations={reservations} />;
}
