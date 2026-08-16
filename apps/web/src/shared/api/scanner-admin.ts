"use client";

/**
 * ADMIN 스캐너 기기 엔드포인트 (계약 tag: Admin scanner devices).
 * 발급 취소만 파기 위험이 커서 `scanner-pairing-cancel.ts` 로 분리했다.
 *
 * 기기 제거는 하드 삭제(`deleteScannerDevice`, DELETE)를 쓴다. 예전 revoke(durable
 * 상태 전이, POST)는 호환을 위해 남겨 두지만 UI 는 더는 호출하지 않는다.
 */

import { apiRequest } from "./client";
import { isApiError } from "./problem";
import type {
  Branch,
  PairingCodeCreateRequest,
  PairingCodeCreateResult,
  ScannerDevice,
  ScannerDeviceDetail,
  ScannerDevicePage,
  ScannerDeviceStatus,
} from "./contract";

/** durable 변경 공통 옵션 — 키는 호출부(useOperationKey)가 소유한다. */
export interface DurableCallOptions {
  /** 계약 `x-idempotency: required`. 재시도 시 반드시 같은 값을 다시 넘긴다. */
  idempotencyKey: string;
  signal?: AbortSignal;
}

export interface ListScannerDevicesParams {
  branch?: Branch;
  status?: ScannerDeviceStatus;
  page?: number;
  pageSize?: number;
}

function listScannerDevices(
  params: ListScannerDevicesParams = {},
  signal?: AbortSignal,
): Promise<ScannerDevicePage> {
  return apiRequest<ScannerDevicePage>("/admin/scanner-devices", {
    method: "GET",
    query: { branch: params.branch, status: params.status, page: params.page, pageSize: params.pageSize },
    signal,
  });
}

/** 계약 최대 200. */
const DEVICE_PAGE_SIZE = 200;

/**
 * 조건에 맞는 기기 **전체** — `page.totalPages` 를 끝까지 따라간다.
 *
 * 첫 페이지만 세고 "전체 기기"라고 부르면 페이지 경계 너머의 기기가 조용히 사라진다.
 * 온라인 판정은 서버가 준 `online` 만 쓴다 — heartbeat 시각으로 재계산하지 않는다.
 */
export async function listAllScannerDevices(
  params: Omit<ListScannerDevicesParams, "page" | "pageSize"> = {},
  signal?: AbortSignal,
): Promise<ScannerDevice[]> {
  const first = await listScannerDevices({ ...params, page: 1, pageSize: DEVICE_PAGE_SIZE }, signal);
  if (first.page.totalPages <= 1) return first.items;

  const rest = await Promise.all(
    Array.from({ length: first.page.totalPages - 1 }, (_, index) =>
      listScannerDevices({ ...params, page: index + 2, pageSize: DEVICE_PAGE_SIZE }, signal),
    ),
  );

  return [first, ...rest].flatMap((page) => page.items);
}

function getScannerDevice(deviceId: string, signal?: AbortSignal): Promise<ScannerDeviceDetail> {
  return apiRequest<ScannerDeviceDetail>(`/admin/scanner-devices/${encodeURIComponent(deviceId)}`, {
    method: "GET",
    signal,
  });
}

/**
 * 5분 1회용 페어링 코드 발급.
 *
 * 원문 코드(`pairingCode`)는 **신규 발급 응답에만** 있고 재조회할 수 없다.
 * 호출부는 이 값을 화면 표시 외 어디에도 (storage/URL/log) 남기면 안 된다.
 *
 * 같은 키로 재시도하면 계약상 `replayed: true` 가 오고 원문 코드는 생략된다 —
 * 응답 유실 후 재시도가 **두 번째 코드를 만들지 않게** 하는 것이 이 키의 목적이다.
 */
export function createScannerPairingCode(
  body: PairingCodeCreateRequest,
  options: DurableCallOptions,
): Promise<PairingCodeCreateResult> {
  return apiRequest<PairingCodeCreateResult>("/admin/scanner-devices/pairing-codes", {
    method: "POST",
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * @deprecated 하드 삭제(`deleteScannerDevice`)로 대체됐다. 호환을 위해 남겨 둘 뿐 UI 는 호출하지 않는다.
 *
 * 연결 해제 — durable 상태 전이(hard delete 아님).
 * 세션·presence·shift lock 이 즉시 무효화되고 기기 identity 와 이력은 보존된다.
 */
export function deleteScannerDevice(deviceId: string, options: DurableCallOptions): Promise<void> {
  return apiRequest<void>(`/admin/scanner-devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * 삭제 결과가 미상일 때(네트워크·5xx) 기기 상세를 되물어 실제 상태로 화해한다.
 * 응답 유실 ≠ 실패 — 서버가 이미 삭제했을 수 있다.
 */
export type DeleteReconciliation =
  /** GET 404 — 기기 identity 가 사라졌다 = 이 삭제가 적용됐다(성공). */
  | "deleted"
  /** GET 200 — 아직 존재한다 = 삭제가 적용되지 않았다. 호출부는 같은 키로 재시도한다. */
  | "still-present"
  /** 확인 자체가 실패했다 — 여전히 알 수 없다. 같은 키를 유지한다. */
  | "unknown";

/** GET 되묻기 실패를 삭제 판정으로 좁힌다 — 하드 삭제라 404 만 "삭제됨"(정체성 소멸)이다. */
export function deleteReconciliationFromError(error: unknown): "deleted" | "unknown" {
  return isApiError(error) && error.status === 404 ? "deleted" : "unknown";
}

export async function reconcileScannerDelete(
  deviceId: string,
  signal?: AbortSignal,
): Promise<DeleteReconciliation> {
  try {
    await getScannerDevice(deviceId, signal);
    // 200 = 기기가 아직 존재한다 = 삭제가 적용되지 않았다.
    return "still-present";
  } catch (error) {
    return deleteReconciliationFromError(error);
  }
}
