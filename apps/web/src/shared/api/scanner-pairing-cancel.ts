"use client";

/**
 * 페어링 코드 발급 취소 — 계약상 claim 과 원자적으로 경합하는 단일 엔드포인트라
 * 다른 어댑터 함수와 섞지 않고 여기 하나로 격리함
 *
 * DELETE /api/v1/admin/scanner-devices/pairing-codes/{pairingCodeId}
 *
 * 불변식:
 * - 경로에는 불투명 pairingCodeId(UUID) 만 넣음. 화면에 뜬 6자리 원문 코드는
 *   URL·로그·감사 메타데이터 어디에도 들어가지 않음
 * - 204 는 취소 성공이자 성공한 취소의 리플레이임 — 둘 다 사용자에겐 "취소됨"
 * - 409 PAIRING_CODE_ALREADY_CLAIMED 는 claim 이 경합에서 이긴 경우임
 *   실패가 아니라 "이미 연결됨" 이라는 별도 사실이므로 호출부가 다르게 안내함
 * - 404 는 없는 코드이거나 다른 테넌트의 코드임(서버가 존재를 숨김)
 */

import { apiRequest } from "./client";
import { isApiError } from "./problem";
import type { DurableCallOptions } from "./scanner-admin";

/**
 * 페어링 코드 발급 취소 결과
 */
export type CancelPairingCodeOutcome =
  /**
   * 미사용 코드를 취소했거나, 이미 성공한 취소의 리플레이(204)
   */
  | { kind: "cancelled" }
  /**
   * 취소가 경합에서 졌음 — iPad 가 먼저 연결을 마쳤음(409)
   */
  | { kind: "already-claimed" }
  /**
   * 서버가 해당 코드를 모름 — 이미 만료·정리됐을 수 있음(404)
   */
  | { kind: "not-found" };

/**
 * 이미 연결에 쓰인 코드 오류 코드
 */
const ALREADY_CLAIMED_CODE = "PAIRING_CODE_ALREADY_CLAIMED";

/**
 * 미사용 페어링 코드 발급 취소
 */
export async function cancelScannerPairingCode(
  pairingCodeId: string,
  options: DurableCallOptions,
): Promise<CancelPairingCodeOutcome> {
  try {
    await apiRequest<void>(
      `/admin/scanner-devices/pairing-codes/${encodeURIComponent(pairingCodeId)}`,
      { method: "DELETE", idempotencyKey: options.idempotencyKey, signal: options.signal },
    );
    return { kind: "cancelled" };
  } catch (error) {
    if (!isApiError(error)) throw error;

    if (error.status === 409 && error.code === ALREADY_CLAIMED_CODE) return { kind: "already-claimed" };
    if (error.status === 404) return { kind: "not-found" };

    // 401/403/503 등은 사용자에게 그대로 알려야 하므로 삼키지 않음
    throw error;
  }
}

/**
 * 취소 결과별 사용자 문구 — 모두 명시적 상태이지 조용한 실패가 아님
 */
export function cancelOutcomeMessage(outcome: CancelPairingCodeOutcome): string {
  switch (outcome.kind) {
    case "cancelled":
      return "연결 코드를 취소했어요.";
    case "already-claimed":
      return "취소하기 직전에 iPad가 이 코드로 연결됐어요. 연결된 기기를 확인해 주세요.";
    case "not-found":
      return "이미 만료되었거나 존재하지 않는 코드예요.";
  }
}
