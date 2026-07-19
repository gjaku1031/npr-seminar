"use client";

/**
 * SCANNER 세션 전용 엔드포인트 (계약 tag: Scanner, Scanner check-in).
 * 기기 자체 페어링 해제만 `scanner-device-unpair.ts` 로 분리했다.
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

export function getCurrentScanner(signal?: AbortSignal): Promise<ScannerCurrent> {
  return apiRequest<ScannerCurrent>("/scanner/current", { method: "GET", signal });
}

/**
 * presence TTL 갱신 — 계약상 ephemeral 이라 Idempotency-Key 가 면제된다
 * (`x-idempotency: exempt`). CSRF/same-origin 은 그대로 적용된다.
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

export function getCurrentScannerShift(signal?: AbortSignal): Promise<ScannerShiftState> {
  return apiRequest<ScannerShiftState>("/scanner/shifts/current", { method: "GET", signal });
}

/** 기기·지점·게이트는 서버가 세션에서 파생한다 — 회차만 고른다. */
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

export function listScannerCheckInSessions(signal?: AbortSignal): Promise<ScannerSessionList> {
  return apiRequest<ScannerSessionList>("/scanner/check-in/sessions", { method: "GET", signal });
}

/** 기존 예약 후보 조회 — 어머니 연락처 뒷 4자리 완전 일치. 워크인 생성 경로는 없다. */
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
 * 서버가 세션과 shift lock 에서 파생한다. 원문 QR 은 저장·로깅하지 않는다.
 */
export function checkInFamilyByQr(qrToken: string, options: DurableCallOptions): Promise<CheckInOutcome> {
  return apiRequest<CheckInOutcome>("/scanner/check-ins/qr", {
    method: "POST",
    body: { qrToken },
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/** 수동 체크인 — 이미 존재하는 가족 예약만 대상. */
export function checkInFamilyManually(
  familyBookingId: string,
  options: DurableCallOptions,
): Promise<CheckInOutcome> {
  return apiRequest<CheckInOutcome>("/scanner/check-ins/manual", {
    method: "POST",
    body: { familyBookingId },
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}
