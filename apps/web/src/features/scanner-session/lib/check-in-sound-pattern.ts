/**
 * 체크인 결과음 **패턴** — 순수 데이터/함수 (DOM·React·Web Audio 없음, node:test 로 검증).
 *
 * 실제 재생(오실레이터·엔벨로프)은 훅(useCheckInSound)이 맡는다. 이 파일은 "언제·어떤 높이의 톤을
 * 얼마나 낼지"만 정한다 — 그래서 길이/구분을 오디오 없이 테스트할 수 있다.
 *
 * 설계(현장에서 귀로 구분되도록 서로 분명히 다른 긴 패턴):
 * - success: 밝은 딩동(상승 2음), 총 길이 약 0.7~1.0초.
 * - warning: 같은 중음을 여러 번 반복 — "다시 확인하라"는 되풀이 느낌.
 * - error: 저음에서 더 낮은 저음으로 내려가는 하강 — 거부를 낮게 알린다.
 */

import type { CheckInSoundKind } from "./check-in-sound";

export interface Tone {
  freq: number;
  /** 패턴 시작 기준 오프셋(초). */
  offset: number;
  duration: number;
}

/** 결과별 톤 패턴 — 자산 없이 사인파로만. 클릭 방지 페이드는 재생 쪽 엔벨로프가 담당한다. */
export const CHECK_IN_SOUND_PATTERNS: Record<CheckInSoundKind, Tone[]> = {
  // 밝은 딩동: 높은 두 음을 이어 상승. 총 0.34+0.44 ≈ 0.78초 (0.7~1.0초 범위).
  success: [
    { freq: 1046.5, offset: 0, duration: 0.32 },
    { freq: 1568.0, offset: 0.34, duration: 0.44 },
  ],
  // 반복 중음: 같은 660Hz 를 세 번 — 되풀이로 주의를 끈다.
  warning: [
    { freq: 660, offset: 0, duration: 0.14 },
    { freq: 660, offset: 0.22, duration: 0.14 },
    { freq: 660, offset: 0.44, duration: 0.16 },
  ],
  // 하강 저음: 300 → 200 → 140 으로 계속 내려간다.
  error: [
    { freq: 300, offset: 0, duration: 0.24 },
    { freq: 200, offset: 0.24, duration: 0.28 },
    { freq: 140, offset: 0.5, duration: 0.34 },
  ],
};

/** 패턴 전체 길이(초) — 마지막 톤의 끝(offset+duration) 중 최댓값. */
export function patternDurationSeconds(kind: CheckInSoundKind): number {
  return CHECK_IN_SOUND_PATTERNS[kind].reduce((max, tone) => Math.max(max, tone.offset + tone.duration), 0);
}
