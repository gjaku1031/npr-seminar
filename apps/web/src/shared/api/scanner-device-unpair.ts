"use client";

/**
 * 기기 자체 페어링 해제(하드 삭제) — 되돌릴 수 없어 단일 파일로 격리함
 *
 * DELETE /api/v1/scanner/device/pairing
 *
 * 계약 불변식:
 * - 하드 삭제임. SCANNER 쿠키·서버 세션·Redis presence·shift lock 이 즉시 만료되고
 *   기기 identity·페어링 등록이 삭제됨. 이미 기록된 체크인은 남음(다른 소유 테이블)
 * - 204 는 해제 성공이자 성공한 해제의 리플레이임
 * - 성공 후 서버가 세션 쿠키를 만료시키므로, 클라이언트는 남은 CSRF 토큰을 반드시 버리고
 *   로컬 스캐너·체크인 상태를 초기화해 코드 입력 화면으로 돌아가야 함
 * - 다시 연결하려면 새로 발급된 페어링 코드가 필요함
 */

import { apiRequest, resetCsrfToken } from "./client";
import { isDefinitiveFailure } from "./idempotency";
import { isApiError } from "./problem";
import type { DurableCallOptions } from "./scanner-admin";
import { getCurrentScanner } from "./scanner-device";

/**
 * 현재 스캐너의 연결 해제. 성공하면 CSRF 토큰을 버림
 */
export async function unpairCurrentScanner(options: DurableCallOptions): Promise<void> {
  try {
    await apiRequest<void>("/scanner/device/pairing", {
      method: "DELETE",
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    });
  } finally {
    // 성공이면 세션이 사라졌고, 실패여도 세션 상태를 신뢰할 수 없음
    // 어느 쪽이든 메모리에 남은 SCANNER 세션 토큰은 무효로 취급함
    resetCsrfToken();
  }
}

/**
 * 해제 시도에서 나온 오류를 세 갈래로 분류함 — 직접 DELETE 의 catch 와 되묻기 GET 이
 * "401/403 = SCANNER 세션이 이미 없다 = 이미 해제됨" 규칙을 한 곳에서 공유하게 함
 *
 * - `already-unpaired` (401/403): 세션이 이미 무효/삭제됐음. DELETE 자신이 이 상태를
 *   돌려줬다면(관리자가 먼저 하드 삭제했거나 성공한 204 응답이 유실됐거나) 이 기기는 이미
 *   해제된 것이므로 성공으로 마무리해야 함. 되묻기 GET 이 돌려줬다면 세션이 사라진 것임
 * - `definitive-failure` (그 외 4xx): 재시도해도 같은 결과임 — 진짜 실패로 다룸
 * - `indeterminate` (network·5xx·취소): 서버가 이미 처리했을 수 있음 — 되물어야 하고
 *   같은 Idempotency-Key 를 유지함
 */
export type UnpairErrorDisposition = "already-unpaired" | "definitive-failure" | "indeterminate";

/**
 * 연결 해제 오류를 이미 해제됨·확정 실패·결과 미상으로 분류
 */
export function classifyUnpairError(error: unknown): UnpairErrorDisposition {
  // 401/403 도 4xx 라 definitive 판정보다 반드시 먼저 가려냄 — 이 순서가 이 수정의 핵심임
  if (isApiError(error) && (error.status === 401 || error.status === 403)) return "already-unpaired";
  if (isDefinitiveFailure(error)) return "definitive-failure";
  return "indeterminate";
}

/**
 * 해제 결과가 미상일 때(네트워크·5xx) 서버에 실제 상태를 되물음
 *
 * 응답 유실이 곧 실패는 아님 — 서버가 이미 해제했을 수 있음. 성공을 선언하기 전에
 * 반드시 이 결과를 봄. 호출부는 `still-paired`/`unknown` 이면 같은 키를 유지해야 함
 */
export type UnpairReconciliation =
  /**
   * 세션이 사라졌음 — 해제가 실제로 적용됐음
   */
  | "unpaired"
  /**
   * 아직 SCANNER 세션이 살아 있음 — 해제되지 않았음
   */
  | "still-paired"
  /**
   * 확인 자체가 실패했음 — 여전히 알 수 없음
   */
  | "unknown";

/**
 * 결과 미상 해제 뒤 현재 스캐너를 다시 조회해 해제 여부 확인
 */
export async function reconcileScannerUnpair(signal?: AbortSignal): Promise<UnpairReconciliation> {
  try {
    await getCurrentScanner(signal);
    // 200 = SCANNER 세션이 아직 유효함
    return "still-paired";
  } catch (error) {
    // 401/403 = 세션이 없다 = 해제가 적용됐음. 판정 기준은 classifyUnpairError 한 곳에만 둠
    return classifyUnpairError(error) === "already-unpaired" ? "unpaired" : "unknown";
  }
}
