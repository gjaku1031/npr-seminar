"use client";

/**
 * 공개 iPad 페어링 claim (계약 tag: Scanner pairing)
 * POST /api/v1/public/scanner-pairing/claims
 *
 * 계약 요구: 사전 인증 세션 + CSRF + same-origin + Idempotency-Key
 * 성공하면 세션이 SCANNER 로 재생성되므로 기존 CSRF 토큰은 무효임 —
 * 응답이 주는 새 토큰을 즉시 어댑터에 심음
 *
 * 원문 코드는 요청 본문에만 잠깐 존재함. storage/URL/log 로 나가지 않음
 */

import { adoptCsrfToken, apiRequest, bootstrapCsrf, resetCsrfToken } from "./client";
import {
  PAIRING_CODE_PATTERN,
  type PairingClaimRequest,
  type PairingClaimResponse,
  type ScannerCurrent,
} from "./contract";
import { isApiError } from "./problem";
import type { DurableCallOptions } from "./scanner-admin";
import { getCurrentScanner } from "./scanner-device";

/**
 * 계약과 동일하게 trim → uppercase 후 검증함(서버도 같은 정규화를 함)
 */
export function normalizePairingCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * 정규화한 코드가 계약 형식인지 확인
 */
export function isValidPairingCode(normalized: string): boolean {
  return PAIRING_CODE_PATTERN.test(normalized);
}

/**
 * 계약 clientPlatform(<=200자) — 진단용이며 개인정보가 아님
 */
export function describeClientPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  return navigator.userAgent.slice(0, 200);
}

/**
 * 페어링 코드로 이 기기를 스캐너로 등록
 */
export async function claimScannerPairingCode(
  body: PairingClaimRequest,
  options: DurableCallOptions,
): Promise<PairingClaimResponse> {
  // 사전 인증 세션과 CSRF 토큰을 먼저 확보함 — 계약상 claim 의 전제
  await bootstrapCsrf(options.signal);

  try {
    const response = await apiRequest<PairingClaimResponse>("/public/scanner-pairing/claims", {
      method: "POST",
      body,
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    });

    // 세션 재생성 → 이전 pre-auth 토큰 폐기하고 SCANNER 세션 토큰으로 교체
    adoptCsrfToken(response.csrfToken);
    return response;
  } catch (error) {
    // 실패해도 세션 상태가 흔들렸을 수 있으니 토큰을 다시 받게 함
    resetCsrfToken();
    throw error;
  }
}

/**
 * claim 결과가 미상일 때(네트워크·5xx) 실제로 페어링됐는지 되물음
 *
 * claim 은 성공 시 세션을 SCANNER 로 재생성하므로, 응답을 잃었어도 서버에서는
 * 이미 성립했을 수 있음. 실패를 선언하거나 다른 키로 재시도하기 전에 반드시 확인함
 */
export type ClaimReconciliation =
  /**
   * 세션이 SCANNER 로 살아 있음 — claim 이 실제로 성공했음
   */
  | { kind: "paired"; current: ScannerCurrent }
  /**
   * 아직 페어링되지 않았음 — 같은 코드·같은 키로 재시도해야 함
   */
  | { kind: "unpaired" }
  /**
   * 확인 자체가 실패했음
   */
  | { kind: "unknown" };

/**
 * 결과 미상 등록 뒤 현재 스캐너를 다시 조회해 등록 여부 확인
 */
export async function reconcileScannerClaim(signal?: AbortSignal): Promise<ClaimReconciliation> {
  try {
    const current = await getCurrentScanner(signal);
    return { kind: "paired", current };
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) return { kind: "unpaired" };
    return { kind: "unknown" };
  }
}
