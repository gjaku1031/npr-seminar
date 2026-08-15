/**
 * 학부모 모바일 예약 화면 (명세 §10) — 공개 경로 `/reserve` 의 화면 조합.
 * 실제 플로우는 widgets/reserve-flow가 담당, 여기는 모바일 폭 래퍼만.
 * 와이어프레임 mobile.html의 body max-width 480 중앙 정렬을 재현한다.
 *
 * `initialMode` 는 라우트(`/reserve?mode=manage`)가 정하며 그대로 플로우에 넘긴다 —
 * 루트(`/`) 포스터 진입면의 "예약 조회 · 변경 · 취소" 링크가 관리 패널을 바로 연다.
 */

import { ReserveFlow, type ReserveInitialMode } from "@/widgets/reserve-flow";

export interface ReserveViewProps {
  initialMode?: ReserveInitialMode;
}

export function ReserveView({ initialMode }: ReserveViewProps = {}) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh" }}>
      <ReserveFlow initialMode={initialMode} />
    </div>
  );
}
