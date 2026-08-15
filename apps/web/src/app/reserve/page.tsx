import type { Metadata } from "next";
import { ReserveView } from "@/views/reserve";
import { brandSeminarTitle } from "@/shared/ui/brand";

export const metadata: Metadata = { title: `${brandSeminarTitle()} — 예약` };

/**
 * 학부모 모바일 예약 (명세 §10 · flows PARENT-P1~P5) — 로그인 없는 공개 경로.
 *
 * 루트(`/`)의 포스터 진입면이 이리로 보낸다:
 * - `설명회 예약하기` → `/reserve` (예약 유형 선택부터)
 * - `이미 예약했나요? 예약 조회 · 변경 · 취소` → `/reserve?mode=manage` (관리 패널을 바로 연다)
 *
 * 서버에서 데이터를 내려주지 않는다: 모든 조회·변경이 브라우저에서 same-origin Nest `/api/v1`
 * 계약 API 로 이뤄진다. 예약 권한은 SMS OTP 로 얻는 X-Booking-Proof(메모리 전용)가 정한다.
 * 관리자 콘솔은 `/admin` 이고 `(main)` 레이아웃이 인증을 강제한다 — `/` 와 `/reserve` 는 공개다.
 */
export default async function ParentReservePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { mode } = await searchParams;
  const modeValue = Array.isArray(mode) ? mode[0] : mode;
  return <ReserveView initialMode={modeValue === "manage" ? "manage" : "reserve"} />;
}
