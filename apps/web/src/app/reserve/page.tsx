import type { Metadata } from "next";
import { Suspense } from "react";
import { ReserveRoute } from "./ReserveRoute";
import { brandSeminarTitle } from "@/shared/ui/brand";

/**
 * 페이지 메타데이터
 */
export const metadata: Metadata = { title: `${brandSeminarTitle()} — 예약` };

/**
 * 학부모 모바일 예약. 로그인 없는 공개 경로
 *
 * 루트(`/`)의 포스터 진입면이 이리로 보냄:
 * - `설명회 예약하기` → `/reserve` (예약 유형 선택부터)
 * - `이미 예약했나요? 예약 조회 · 변경 · 취소` → `/reserve?mode=manage` (관리 패널을 바로 엶)
 *
 * 서버에서 데이터를 내려주지 않음: 모든 조회·변경이 브라우저에서 same-origin Nest `/api/v1`
 * 계약 API 로 이뤄짐. 예약 권한은 SMS OTP 로 얻는 X-Booking-Proof(메모리 전용)가 정함
 * 관리자 콘솔은 `/admin` 이고 `(main)` 레이아웃이 인증을 강제함 — `/` 와 `/reserve` 는 공개임
 */
export default function ParentReservePage() {
  return (
    <Suspense fallback={null}>
      <ReserveRoute />
    </Suspense>
  );
}
