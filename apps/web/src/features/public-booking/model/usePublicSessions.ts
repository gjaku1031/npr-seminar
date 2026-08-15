"use client";

/**
 * 공개 회차 목록 — 계약 GET /public/seminar-sessions.
 *
 * 예약 가능 여부는 **서버가 준 availability 만** 쓴다.
 * 클라이언트가 예약 건수로 마감 여부를 추정하지 않는다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultErrorMessage,
  isAborted,
  listPublicSeminarSessions,
  type Branch,
  type PublicSeminarSession,
} from "@/shared/api";

export interface PublicSessionsState {
  sessions: PublicSeminarSession[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** 계약 페이지 상한(pageSize<=100). 공개 예약 창은 이보다 훨씬 작다. */
const PAGE_SIZE = 100;

export function usePublicSessions(): PublicSessionsState {
  const [sessions, setSessions] = useState<PublicSeminarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        // 지점 필터 없이 전부 받아 캠퍼스별로 나눈다 — ALL 회차가 모든 캠퍼스에 보여야 한다.
        const page = await listPublicSeminarSessions({ pageSize: PAGE_SIZE }, controller.signal);
        if (controller.signal.aborted) return;
        setSessions(page.items);
        setError(null);
      } catch (caught) {
        // 앞선 요청이 취소된 것이면 조용히 버린다 — 낡은 응답이 화면을 덮지 않게.
        if (isAborted(caught) || controller.signal.aborted) return;
        setError(defaultErrorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  return { sessions, loading, error, reload };
}

/**
 * 캠퍼스 노출 규칙 (계약):
 * - ALL 회차(branch=null)는 **모든 캠퍼스**에 보인다.
 * - BRANCH 회차는 **자기 지점**에만 보인다.
 */
export function isVisibleAtBranch(session: PublicSeminarSession, branch: Branch): boolean {
  return session.scope === "ALL" || session.branch === branch;
}

export function useSessionsByBranch(
  sessions: PublicSeminarSession[],
  branch: Branch | null,
): PublicSeminarSession[] {
  return useMemo(
    () => (branch === null ? [] : sessions.filter((s) => isVisibleAtBranch(s, branch))),
    [sessions, branch],
  );
}
