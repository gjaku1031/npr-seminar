"use client";

/**
 * 현재 스캐너 세션 — 계약 GET /api/v1/scanner/current
 *
 * 세션은 HttpOnly 쿠키임: 클라이언트는 토큰을 보관하지 않고, "연결됐는지"는
 * 이 엔드포인트가 200 을 주는지로만 판단함. 401/403 이면 페어링이 필요한 상태임
 */

import { useCallback, useEffect, useState } from "react";
import {
  getCurrentScanner,
  isAborted,
  isApiError,
  defaultErrorMessage,
  type ScannerCurrent,
  type ScannerDevice,
  type ScannerShiftState,
} from "@/shared/api";

/**
 * 스캐너 세션 확인 상태
 */
export type ScannerSessionStatus =
  /**
   * 세션 존재 여부 확인 중
   */
  | "checking"
  /**
   * 세션 없음 — 코드 입력 필요
   */
  | "unpaired"
  /**
   * 세션 있음
   */
  | "paired"
  /**
   * 확인 자체가 실패 (네트워크 등) — 재시도 가능
   */
  | "error";

/**
 * 스캐너 세션 상태와 동작
 */
export interface ScannerSessionState {
  /**
   * 세션 확인 상태
   */
  status: ScannerSessionStatus;

  /**
   * 현재 기기. 세션이 없으면 null
   */
  device: ScannerDevice | null;

  /**
   * 회차 잠금 상태. 세션이 없으면 null
   */
  shift: ScannerShiftState | null;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

  /**
   * 세션 다시 확인
   */
  refresh: () => void;
  /**
   * claim 직후 서버 왕복 없이 상태를 심음
   */
  adopt: (current: ScannerCurrent) => void;

  /**
   * 연결 직후 받은 기기를 세션으로 반영
   */
  adoptDevice: (device: ScannerDevice) => void;

  /**
   * 회차 잠금 상태 반영
   */
  setShift: (shift: ScannerShiftState) => void;
  /**
   * 해제·세션 만료 시 로컬 상태를 완전히 되돌림
   */
  clear: () => void;
}

/**
 * 스캐너 세션과 회차 잠금 상태를 확인하는 훅
 */
export function useScannerSession(): ScannerSessionState {
  const [status, setStatus] = useState<ScannerSessionStatus>("checking");
  const [device, setDevice] = useState<ScannerDevice | null>(null);
  const [shift, setShiftState] = useState<ScannerShiftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const current = await getCurrentScanner(controller.signal);
        setDevice(current.device);
        setShiftState(current.shift);
        setStatus("paired");
        setError(null);
      } catch (caught) {
        if (isAborted(caught)) return;

        // 401/403 = 아직(또는 더는) 페어링되지 않음. 오류가 아니라 정상 상태임
        if (isApiError(caught) && (caught.status === 401 || caught.status === 403)) {
          setDevice(null);
          setShiftState(null);
          setStatus("unpaired");
          setError(null);
          return;
        }

        setStatus("error");
        setError(defaultErrorMessage(caught));
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const adopt = useCallback((current: ScannerCurrent) => {
    setDevice(current.device);
    setShiftState(current.shift);
    setStatus("paired");
    setError(null);
  }, []);

  const adoptDevice = useCallback((next: ScannerDevice) => {
    setDevice(next);
    setStatus("paired");
    setError(null);
  }, []);

  const setShift = useCallback((next: ScannerShiftState) => setShiftState(next), []);

  const clear = useCallback(() => {
    setDevice(null);
    setShiftState(null);
    setStatus("unpaired");
    setError(null);
  }, []);

  return { status, device, shift, error, refresh, adopt, adoptDevice, setShift, clear };
}
