"use client";

/**
 * ⚠️ 계약 미반영 경로 — 이 파일 하나에 격리한다.
 *
 * TODO(contract): **지금은 어떤 렌더되는 UI 도 이 파일을 import·호출하지 않는다.**
 * 계약에 경로가 없는 동안 조작자가 누를 때마다 404 를 받아내는 건 동작을 지어내는 것이라,
 * `/scanner/connect` 의 "회차 변경" 버튼을 제거했다 (ScannerConnectView 참고).
 * 계약에 기기용 release 가 생기면 이 파일의 경로만 확인하고 버튼을 되살리면 된다.
 *
 * 스캐너가 **자기** shift lock 을 스스로 푸는 경로는 현재
 * packages/contracts/openapi.yaml 에 없다. 계약에 있는 release 는
 * ADMIN 전용 `POST /api/v1/admin/scanner-devices/{deviceId}/shift/release` 뿐이고,
 * 기기 세션에는 `GET`·`POST /api/v1/scanner/shifts/current` 만 정의돼 있다.
 *
 * 그래서 여기서는 계약의 다른 durable 변경 엔드포인트와 같은 규약
 * (CSRF · same-origin · Idempotency-Key · ShiftReleaseRequest · ScannerShiftState)을
 * 그대로 따르는 형태로 경로만 결정해 둔다. 계약이 확정되면 이 파일만 고치면 된다.
 * 다른 API 동작을 지어내지 않는다 — 계약이 정의한 것 외의 필드·상태는 없다.
 *
 * 계약에 이 경로가 생기기 전까지 서버는 404 를 준다. 호출부는 그 경우를
 * "이 기기에서는 회차를 바꿀 수 없다"로 안내하고 관리자 해제를 유도해야 한다.
 */

import { apiRequest } from "./client";
import { isApiError } from "./problem";
import type { ScannerShiftState } from "./contract";
import type { DurableCallOptions } from "./scanner-admin";

/** 계약 확정 전까지의 결정 경로. 변경 지점을 한 곳으로 묶어 둔다. */
const PENDING_CONTRACT_PATH = "/scanner/shifts/current/release";

export type ReleaseShiftOutcome =
  | { kind: "released"; shift: ScannerShiftState }
  /** 서버에 아직 이 경로가 없다 — 계약 확정 전 예상 상태. */
  | { kind: "unsupported" };

export async function releaseCurrentScannerShift(
  reason: string,
  options: DurableCallOptions,
): Promise<ReleaseShiftOutcome> {
  try {
    const shift = await apiRequest<ScannerShiftState>(PENDING_CONTRACT_PATH, {
      method: "POST",
      body: { reason },
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    });
    return { kind: "released", shift };
  } catch (error) {
    if (isApiError(error) && error.status === 404) return { kind: "unsupported" };
    throw error;
  }
}
