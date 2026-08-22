import { SessionsView } from "@/views/sessions";

/**
 * 설명회 운영 (명세 §6) — 회차 목록·예약 운영 현황·만족도.
 * 데이터는 뷰가 계약에서 직접 읽는다.
 */
export default function SessionsPage() {
  return <SessionsView />;
}
