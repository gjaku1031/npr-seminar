import "server-only";
import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import { CAMPUS_INFO, isCampus, type Campus } from "@/shared/config/campus";
import { fmtSessionDate } from "@/shared/lib/format";
import { buildQrUrl, buildSurveyUrl } from "./urls";

/**
 * 문자 변수 치환 (명세 §5.1 변수 칩 6종 + 설문 {설문링크}) — 수신자별 서버 렌더.
 * 화면(SmsView) 프리뷰는 예시 값, 실제 발송 본문은 여기서 만든다.
 */

const DEFAULT_INQUIRY_CAMPUS: Campus = "송파캠퍼스";

export function renderSmsBody(body: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value),
    body,
  );
}

/** 캠퍼스별 문의전화 (명세 §5.3) — 비재원생 등 캠퍼스 공란은 송파 기준 */
export function inquiryOf(campus: string): string {
  return CAMPUS_INFO[isCampus(campus) ? campus : DEFAULT_INQUIRY_CAMPUS].inquiry;
}

/** 예약 1건 기준 변수 세트 — {QR링크}는 수신자별 고유 토큰 링크 */
export function reservationVars(reservation: Reservation, session: Session): Record<string, string> {
  return {
    학생명: reservation.name,
    설명회명: session.title,
    일시: `${fmtSessionDate(session.date)} ${session.time}`,
    장소: session.place,
    QR링크: buildQrUrl(reservation.qrToken),
    문의전화: inquiryOf(reservation.campus),
    설문링크: buildSurveyUrl(),
  };
}
