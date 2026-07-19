/**
 * 체크인 결과음 분류 — 순수 함수 (DOM·React·Web Audio 없음, node:test 로 검증).
 *
 * 스캔·수동 체크인 결과를 공용 패널(CheckInPanel)에서 하나의 소리 종류로 옮긴다.
 * 색·문구 분류(check-in-copy)와 같은 갈래를 따르되 소리는 세 가지로 단순화한다:
 *   성공(입장 완료) / 경고(이미 입장·다른 회차·정원 대기) / 오류(그 외 거부·네트워크 실패).
 *
 * 실제 재생(오디오)과 중복 억제는 훅이 맡는다 — 이 파일은 "무슨 소리를 낼지"만 정한다.
 *
 * ★ node:test(tsx) 가 `@/` alias 를 풀지 않으므로 계약 모듈을 관계 경로로 가리킨다.
 *   CheckInPanel 은 타입만 쓰므로 `import type` 로 가져와 런타임 로드를 피한다.
 */

import type { CheckInResult } from "../../../shared/api/contract";
import type { CheckInPanel } from "../model/useQrCheckIn";

export type CheckInSoundKind = "success" | "warning" | "error";

/**
 * 결과 종류 → 소리. check-in-copy 의 tone(success/warning/danger)과 같은 갈래를 따르되
 * 소리는 success/warning/error 3종으로 맞춘다(위험=오류음).
 */
export function outcomeSoundKind(result: CheckInResult): CheckInSoundKind {
  switch (result) {
    case "CHECKED_IN":
      return "success";
    case "ALREADY_CHECKED_IN":
    case "SESSION_MISMATCH":
      return "warning";
    default:
      return "error";
  }
}

/**
 * 패널 상태 → 소리. 대기(idle)·처리 중(processing)은 무음(null)이다.
 * 결과 미상 정원(capacity)은 경고음, 네트워크·처리 실패(error)는 오류음으로 들려준다.
 * 결과(outcome)는 결과 종류로 갈린다.
 */
export function panelSoundKind(panel: CheckInPanel): CheckInSoundKind | null {
  switch (panel.kind) {
    case "idle":
    case "processing":
      return null;
    case "error":
      return "error";
    case "capacity":
      return "warning";
    case "outcome":
      return outcomeSoundKind(panel.outcome.result);
  }
}
