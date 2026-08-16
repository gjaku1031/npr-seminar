"use client";

/**
 * 콘솔 공통 회차 목록 (계약 tag: Admin seminars).
 *
 * 운영·통계·스캐너가 모두 "고를 수 있는 회차"를 필요로 하는데, 계약에는 회차만
 * 평평하게 주는 엔드포인트가 없어 설명회 → 회차 두 단계를 읽어야 한다. 화면마다 그 절차를
 * 되풀이하지 않도록 여기 한 번만 둔다.
 */

import { useCallback, useEffect, useState } from "react";
import { listBookableSessions } from "@/shared/api";
import type { SeminarSessionOption } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

export interface SeminarSessionsState {
  options: SeminarSessionOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useSeminarSessions(): SeminarSessionsState {
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
