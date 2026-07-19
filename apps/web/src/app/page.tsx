import type { Metadata } from "next";
import { ReserveView } from "@/views/reserve";

export const metadata: Metadata = { title: "npr 입시설명회 — 예약" };

/**
 * 학부모 모바일 예약 (명세 §10 · flows PARENT-P1~P5) — **로그인 없는 공개 루트**.
 *
 * 서버에서 데이터를 내려주지 않는다: 모든 조회·변경이 브라우저에서 same-origin
 * Nest `/api/v1` 계약 API 로 이뤄진다 (`@/server`·레거시 서버 액션 없음).
 * 예약 권한은 SMS OTP 로 얻는 X-Booking-Proof(메모리 전용)가 정한다.
 *
 * 관리자 콘솔은 `/admin`, 옛 공개 경로 `/reserve` 는 여기로 308 영구 이동한다.
 */
export default function ParentReservePage() {
  return <ReserveView />;
}
