"use client";

/**
 * ADMIN 스캐너 기기 목록 — 계약 GET /api/v1/admin/scanner-devices 를 유일한 사실로 씀
 * ACTIVE 만 카드로 보여주되 페이지 경계 너머까지 전부 따라감(첫 페이지만 세면 5대째부터
 * 조용히 사라짐). online·배터리·마지막 신호는 서버가 준 값만 표시하고 추정하지 않음
 */

import { useCallback, useEffect, useState } from "react";
import { defaultErrorMessage, isAborted, listAllScannerDevices, type ScannerDevice } from "@/shared/api";

/**
 * 관리자 화면이 열려 있는 동안 presence 를 따라가기 위한 주기 (계약상 presence 는 단명함)
 */
const REFRESH_INTERVAL_MS = 15_000;

/**
 * 스캐너 기기 목록 상태
 */
export interface ScannerDevicesState {
  /**
   * 기기 목록
   */
  devices: ScannerDevice[];

  /**
   * 불러오는 중 여부
   */
  loading: boolean;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

  /**
   * 다시 불러오기
   */
  reload: () => void;
  /**
   * 하드 삭제가 확정된 기기를 재조회 전에 즉시 목록에서 뺌
   */
  removeDevice: (deviceId: string) => void;
}

/**
 * 스캐너 기기 목록을 불러오는 훅
 */
export function useScannerDevices(): ScannerDevicesState {
  const [devices, setDevices] = useState<ScannerDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        // ACTIVE 기기 전체 — listAllScannerDevices 가 totalPages 를 끝까지 따라감
        const items = await listAllScannerDevices({ status: "ACTIVE" }, controller.signal);
        if (controller.signal.aborted) return;
        setDevices(items);
        setError(null);
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setError(defaultErrorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const removeDevice = useCallback((deviceId: string) => {
    setDevices((current) => current.filter((item) => item.deviceId !== deviceId));
  }, []);

  return { devices, loading, error, reload, removeDevice };
}
