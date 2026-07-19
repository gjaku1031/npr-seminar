/**
 * 학부모 모바일 예약 화면 (명세 §10) — 공개 루트(`/`)의 화면 조합.
 * 실제 플로우는 widgets/reserve-flow가 담당, 여기는 모바일 폭 래퍼만.
 * 와이어프레임 mobile.html의 body max-width 480 중앙 정렬을 재현한다.
 */

import { ReserveFlow } from "@/widgets/reserve-flow";

export function ReserveView() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh" }}>
      <ReserveFlow />
    </div>
  );
}
