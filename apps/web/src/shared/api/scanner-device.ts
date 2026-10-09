"use client";

/**
 * SCANNER 세션 전용 엔드포인트 (계약 tag: Scanner, Scanner check-in)
 * 기기 자체 페어링 해제만 `scanner-device-unpair.ts` 로 분리했음
 */

import { apiRequest } from "./client";
import type { DurableCallOptions } from "./scanner-admin";
import type {
  CheckInOutcome,
  ManualCheckInCandidateList,
  ScannerCurrent,
  ScannerHeartbeatRequest,
  ScannerHeartbeatResponse,
  ScannerSessionList,
  ScannerShiftState,
} from "./contract";

/**
 * 현재 스캐너 기기와 회차 잠금 상태 조회
 */
export function getCurrentScanner(signal?: AbortSignal): Promise<ScannerCurrent> {
  return apiRequest<ScannerCurrent>("/scanner/current", { method: "GET", signal });
}

/**
 * presence TTL 갱신 — 계약상 ephemeral 이라 Idempotency-Key 가 면제됨
 * (`x-idempotency: exempt`). CSRF/same-origin 은 그대로 적용됨
 */
export function sendScannerHeartbeat(
  body: ScannerHeartbeatRequest,
  signal?: AbortSignal,
): Promise<ScannerHeartbeatResponse> {
  return apiRequest<ScannerHeartbeatResponse>("/scanner/heartbeat", {
    method: "POST",
    body,
    signal,
  });
}

/**
 * 기기·지점·게이트는 서버가 세션에서 파생함 — 회차만 고름
 */
export function createScannerShiftLock(
  seminarSessionId: string,
  options: DurableCallOptions,
): Promise<ScannerShiftState> {
  return apiRequest<ScannerShiftState>("/scanner/shifts/current", {
    method: "POST",
    body: { seminarSessionId },
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * 스캐너가 고를 수 있는 회차 목록 조회
 */
export function listScannerCheckInSessions(signal?: AbortSignal): Promise<ScannerSessionList> {
  return apiRequest<ScannerSessionList>("/scanner/check-in/sessions", { method: "GET", signal });
}

/**
 * 기존 예약 후보 조회 — 어머니 연락처 뒷 4자리 완전 일치. 워크인 생성 경로는 없음
 */
export function listScannerManualCandidates(
  phoneLast4: string,
  signal?: AbortSignal,
): Promise<ManualCheckInCandidateList> {
  return apiRequest<ManualCheckInCandidateList>("/scanner/check-in/candidates", {
    method: "GET",
    query: { phoneLast4 },
    signal,
  });
}

/**
 * QR 체크인 — 본문은 원문 credential 뿐이고 나머지(기기·지점·게이트·회차)는
 * 서버가 세션과 shift lock 에서 파생함. 원문 QR 은 저장·로깅하지 않음
 */
/**
 * @param attendedCount 실제로 들어온 학부모 수. 생략하면 서버가 정함 — 1명 예약은 즉시
 *   입장, 2명 예약은 아무것도 바꾸지 않고 `PARTY_SELECTION_REQUIRED` 로 되물음
 *   인원을 바꿔 다시 부를 때는 반드시 새 Idempotency-Key 를 써야 함. 본문이 달라진
 *     요청은 재시도가 아니라 다른 요청이라 서버가 키 재사용으로 거절함
 */
export function checkInFamilyByQr(
  qrToken: string,
  options: DurableCallOptions,
  attendedCount?: number,
): Promise<CheckInOutcome> {
  return apiRequest<CheckInOutcome>("/scanner/check-ins/qr", {
    method: "POST",
    body: attendedCount === undefined ? { qrToken } : { qrToken, attendedCount },
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * 수동 체크인 — 이미 존재하는 가족 예약만 대상
 */
export function checkInFamilyManually(
  familyBookingId: string,
  options: DurableCallOptions,
  /**
   * 실제 입장 인원. 비우면 서버가 PARTY_SELECTION_REQUIRED 로 되묻고 아무것도 바꾸지 않음
   */
  attendedCount?: number,
): Promise<CheckInOutcome> {
  return apiRequest<CheckInOutcome>("/scanner/check-ins/manual", {
    method: "POST",
    body: attendedCount === undefined ? { familyBookingId } : { familyBookingId, attendedCount },
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}
