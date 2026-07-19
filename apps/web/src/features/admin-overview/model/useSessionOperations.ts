"use client";

/**
 * 회차 운영 요약 훅 (Sessions 화면) — 가족 예약 **건수** 요약을 읽는다.
 *
 * 어댑터(`getSessionOperationsSummary`)가 계약 연결 전이면 상태별 건수를 합성해 주므로,
 * 이 훅은 서버/합성 여부를 신경 쓰지 않는다. 값은 항상 실데이터다 — `summary.source` 로
 * 어디서 왔는지만 화면에 알린다. 요청 흐름은 다른 admin-overview 훅과 같은 request-key 방식.
 */

import { useCallback, useEffect, useState } from "react";
import { getSessionOperationsSummary } from "@/shared/api/admin-operations";
import type { SessionOperationsSummary } from "@/shared/api/admin-operations";
import { defaultErrorMessage, isAborted } from "@/shared/api";

export interface SessionOperationsState {
  summary: SessionOperationsSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useSessionOperations(seminarSessionId: string | null): SessionOperationsState {
  const [result, setResult] = useState<{
    key: string;
    summary: SessionOperationsSummary | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${seminarSessionId ?? ""}:${reloadToken}`;

  useEffect(() => {
    if (seminarSessionId === null) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const summary = await getSessionOperationsSummary(seminarSessionId, controller.signal);
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, summary, error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setResult({ key: requestKey, summary: null, error: defaultErrorMessage(caught) });
      }
    })();

    return () => controller.abort();
  }, [seminarSessionId, requestKey]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const fresh = result !== null && result.key === requestKey;

  return {
    summary: fresh ? result.summary : null,
    loading: seminarSessionId !== null && !fresh,
    error: fresh ? result.error : null,
    reload,
  };
}
