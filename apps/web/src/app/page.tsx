import type { Metadata } from "next";
import { PosterEntranceView } from "@/views/poster";
import { brandSeminarTitle } from "@/shared/ui/brand";

export const metadata: Metadata = {
  title: brandSeminarTitle(),
  description: `${brandSeminarTitle()} 안내 포스터 · 예약`,
};

/**
 * 공개 진입면 (루트 `/`) — **포스터 우선**, 로그인 없는 공개 경로.
 *
 * 업로드된 설명회 안내 포스터를 same-origin 계약(GET `/api/v1/public/poster`)에서 브라우저가
 * 직접 읽어 전체(contain)로 보여 주고, 하단 액션이 학부모를 예약 플로우로 보낸다:
 * - `설명회 예약하기` → `/reserve`
 * - `이미 예약했나요? 예약 조회 · 변경 · 취소` → `/reserve?mode=manage`
 *
 * 예약 플로우(ReserveView · flows PARENT-P1~P5) 자체는 이제 `/reserve` 다. 관리자 콘솔은
 * `/admin` (`(main)` 레이아웃이 인증을 강제). 포스터 업로드 관리도 `/admin` 허브 패널에 있다.
 */
export default function PublicEntrancePage() {
  return <PosterEntranceView />;
}
