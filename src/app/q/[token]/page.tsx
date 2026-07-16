import { getReservationByQrToken, getSession } from "@/server/services";
import { QrPassView } from "@/views/qr-pass";

export const dynamic = "force-dynamic";

export const metadata = { title: "npr 입시설명회 — 입장 QR" };

/**
 * 입장 QR 패스 (명세 §9.2 · qr-poc /q/[token] 이식) — **로그인 없는 공개 라우트**.
 * 예약 확정 문자의 QR 링크가 여는 페이지. QR에는 이 URL이 담기고, 현장 스캐너가
 * URL 속 토큰을 추출해 체크인한다. 토큰은 난수라 예약번호 추측 공격이 성립하지 않는다.
 */
export default async function QrPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reservation = await getReservationByQrToken(token.trim());
  const session = reservation ? await getSession(reservation.sessionId) : null;

  return <QrPassView reservation={reservation} session={session} />;
}
