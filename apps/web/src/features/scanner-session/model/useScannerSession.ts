"use client";

/**
 * 현재 스캐너 세션 — 계약 GET /api/v1/scanner/current.
 *
 * 세션은 HttpOnly 쿠키다: 클라이언트는 토큰을 보관하지 않고, "연결됐는지"는
 * 이 엔드포인트가 200 을 주는지로만 판단한다. 401/403 이면 페어링이 필요한 상태다.
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

export type ScannerSessionStatus =
  /** 세션 존재 여부 확인 중. */
  | "checking"
  /** 세션 없음 — 코드 입력 필요. */
  | "unpaired"
  /** 세션 있음. */
  | "paired"
  /** 확인 자체가 실패 (네트워크 등) — 재시도 가능. */
  | "error";

export interface ScannerSessionState {
  status: ScannerSessionStatus;
  device: ScannerDevice | null;
  shift: ScannerShiftState | null;
  error: string | null;
  refresh: () => void;
  /** claim 직후 서버 왕복 없이 상태를 심는다. */
  adopt: (current: ScannerCurrent) => void;
  adoptDevice: (device: ScannerDevice) => void;
  setShift: (shift: ScannerShiftState) => void;
  /** 해제·세션 만료 시 로컬 상태를 완전히 되돌린다. */
  clear: () => void;
}

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

        // 401/403 = 아직(또는 더는) 페어링되지 않음. 오류가 아니라 정상 상태다.
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
