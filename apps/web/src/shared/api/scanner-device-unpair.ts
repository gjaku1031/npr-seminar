"use client";

/**
 * 기기 자체 페어링 해제(하드 삭제) — 되돌릴 수 없어 단일 파일로 격리한다.
 *
 * DELETE /api/v1/scanner/device/pairing
 *
 * 계약 불변식:
 * - 하드 삭제다. SCANNER 쿠키·서버 세션·Redis presence·shift lock 이 즉시 만료되고
 *   기기 identity·페어링 등록이 삭제된다. 이미 기록된 체크인은 남는다(다른 소유 테이블).
 * - 204 는 해제 성공이자 성공한 해제의 리플레이다.
 * - 성공 후 서버가 세션 쿠키를 만료시키므로, 클라이언트는 남은 CSRF 토큰을 반드시 버리고
 *   로컬 스캐너·체크인 상태를 초기화해 코드 입력 화면으로 돌아가야 한다.
 * - 다시 연결하려면 새로 발급된 페어링 코드가 필요하다.
 */

import { apiRequest, resetCsrfToken } from "./client";
import { isDefinitiveFailure } from "./idempotency";
import { isApiError } from "./problem";
import type { DurableCallOptions } from "./scanner-admin";
import { getCurrentScanner } from "./scanner-device";

export async function unpairCurrentScanner(options: DurableCallOptions): Promise<void> {
  try {
    await apiRequest<void>("/scanner/device/pairing", {
      method: "DELETE",
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    });
  } finally {
    // 성공이면 세션이 사라졌고, 실패여도 세션 상태를 신뢰할 수 없다.
    // 어느 쪽이든 메모리에 남은 SCANNER 세션 토큰은 무효로 취급한다.
    resetCsrfToken();
  }
}

/**
 * 해제 시도에서 나온 오류를 세 갈래로 분류한다 — 직접 DELETE 의 catch 와 되묻기 GET 이
 * "401/403 = SCANNER 세션이 이미 없다 = 이미 해제됨" 규칙을 **한 곳에서** 공유하게 한다.
 *
 * - `already-unpaired` (401/403): 세션이 이미 무효/삭제됐다. DELETE 자신이 이 상태를
 *   돌려줬다면(관리자가 먼저 하드 삭제했거나 성공한 204 응답이 유실됐거나) 이 기기는 이미
 *   해제된 것이므로 성공으로 마무리해야 한다. 되묻기 GET 이 돌려줬다면 세션이 사라진 것이다.
 * - `definitive-failure` (그 외 4xx): 재시도해도 같은 결과다 — 진짜 실패로 다룬다.
 * - `indeterminate` (network·5xx·취소): 서버가 이미 처리했을 수 있다 — 되물어야 하고
 *   같은 Idempotency-Key 를 유지한다.
 */
export type UnpairErrorDisposition = "already-unpaired" | "definitive-failure" | "indeterminate";

export function classifyUnpairError(error: unknown): UnpairErrorDisposition {
  // 401/403 도 4xx 라 definitive 판정보다 반드시 먼저 가려낸다 — 이 순서가 이 수정의 핵심이다.
  if (isApiError(error) && (error.status === 401 || error.status === 403)) return "already-unpaired";
  if (isDefinitiveFailure(error)) return "definitive-failure";
  return "indeterminate";
}

/**
 * 해제 결과가 미상일 때(네트워크·5xx) 서버에 실제 상태를 되묻는다.
 *
 * 응답 유실이 곧 실패는 아니다 — 서버가 이미 해제했을 수 있다. 성공을 선언하기 전에
 * 반드시 이 결과를 본다. 호출부는 `still-paired`/`unknown` 이면 **같은 키를 유지**해야 한다.
 */
export type UnpairReconciliation =
  /** 세션이 사라졌다 — 해제가 실제로 적용됐다. */
  | "unpaired"
  /** 아직 SCANNER 세션이 살아 있다 — 해제되지 않았다. */
  | "still-paired"
  /** 확인 자체가 실패했다 — 여전히 알 수 없다. */
  | "unknown";

export async function reconcileScannerUnpair(signal?: AbortSignal): Promise<UnpairReconciliation> {
  try {
    await getCurrentScanner(signal);
    // 200 = SCANNER 세션이 아직 유효하다.
    return "still-paired";
  } catch (error) {
    // 401/403 = 세션이 없다 = 해제가 적용됐다. 판정 기준은 classifyUnpairError 한 곳에만 둔다.
    return classifyUnpairError(error) === "already-unpaired" ? "unpaired" : "unknown";
  }
}
