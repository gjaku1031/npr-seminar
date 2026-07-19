"use client";

/**
 * 회차 통계 훅 (Stats 화면) — 회차 × 캠퍼스 필터.
 *
 * 어댑터(`getSessionStatistics`)는 statistics 서버 응답을 그대로 소비하고, 아직 안 붙은 배포
 * (404/501)에서만 5개 요약 지표와 설문 summary 를 합성하고 단위·채널 분해는 `null` 로 준다.
 * 이 훅은 그 상태를 그대로 흘려보내며(요약은 실데이터, 분해는 서버면 배열·폴백이면 null),
 * 화면이 `stats.source`·`units`·`channels` 를 보고 정직하게 채우거나 비운다. request-key 방식은
 * 다른 admin-overview 훅과 동일하다.
 */

import { useCallback, useEffect, useState } from "react";
import { getSessionStatistics } from "@/shared/api/admin-operations";
import type { SessionStatistics } from "@/shared/api/admin-operations";
import type { Branch } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

export interface SessionStatisticsState {
  stats: SessionStatistics | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * @param seminarSessionId 선택된 회차. null 이면 아무것도 부르지 않는다.
 * @param branch           분원 필터. null 이면 회차 전체.
 */
export function useSessionStatistics(
  seminarSessionId: string | null,
  branch: Branch | null,
): SessionStatisticsState {
  const [result, setResult] = useState<{
    key: string;
    stats: SessionStatistics | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${seminarSessionId ?? ""}:${branch ?? ""}:${reloadToken}`;

  useEffect(() => {
    if (seminarSessionId === null) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const stats = await getSessionStatistics(seminarSessionId, branch, controller.signal);
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, stats, error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setResult({ key: requestKey, stats: null, error: defaultErrorMessage(caught) });
      }
    })();

    return () => controller.abort();
  }, [seminarSessionId, branch, requestKey]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const fresh = result !== null && result.key === requestKey;

  return {
    stats: fresh ? result.stats : null,
    loading: seminarSessionId !== null && !fresh,
    error: fresh ? result.error : null,
    reload,
  };
}
