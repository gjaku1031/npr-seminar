"use client";

/**
 * 예약 가능한 회차 선택지 (계약 tag: Admin seminars).
 *
 * 예약 명단 화면이 "어느 회차를 볼지" 고르는 데 쓴다. 목록을 읽기 전에는 회차가
 * undefined 이므로, 호출부는 그동안 회차별 조회를 시작하지 않는다 — 전 회차를 긁어 놓고
 * 한 회차인 척하지 않기 위해서다.
 */

import { useCallback, useEffect, useState } from "react";
import { listBookableSessions } from "@/shared/api";
import type { SeminarSessionOption } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

export interface SessionOptionsState {
  options: SeminarSessionOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useBookableSessions(): SessionOptionsState {
  const [options, setOptions] = useState<SeminarSessionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await listBookableSessions(controller.signal);
        if (controller.signal.aborted) return;
        setOptions(next);
        setError(null);
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setError(defaultErrorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { options, loading, error, reload };
}
