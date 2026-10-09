/**
 * 학부모 모바일 예약 화면. 공개 경로 `/reserve` 의 화면 조합
 * 실제 플로우는 widgets/reserve-flow가 담당, 여기는 모바일 폭 래퍼만
 * 와이어프레임 mobile.html의 body max-width 480 중앙 정렬을 재현함
 *
 * `initialMode` 는 라우트(`/reserve?mode=manage`)가 정하며 그대로 플로우에 넘김 —
 * 루트(`/`) 포스터 진입면의 "예약 조회 · 변경 · 취소" 링크가 관리 패널을 바로 엶
 */

import { ReserveFlow, type ReserveInitialMode } from "@/widgets/reserve-flow";

/**
 * 예약 화면 속성
 */
export interface ReserveViewProps {
  /**
   * 첫 화면 모드. 예약 또는 예약 관리
   */
  initialMode?: ReserveInitialMode;
}

/**
 * 학부모 모바일 예약 화면. 모바일 폭 래퍼
 */
export function ReserveView({ initialMode }: ReserveViewProps = {}) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh" }}>
      <ReserveFlow initialMode={initialMode} />
    </div>
  );
}
