"use client";

/**
 * 공개 회차 목록 — 계약 GET /public/seminar-sessions
 *
 * 예약 가능 여부는 서버가 준 availability 만 씀
 * 클라이언트가 예약 건수로 마감 여부를 추정하지 않음
 */

import { useCallback, useEffect, useState } from "react";
import {
  defaultErrorMessage,
  isAborted,
  listPublicSeminarSessions,
  type PublicSeminarSession,
} from "@/shared/api";

/**
 * 공개 회차 목록 상태
 */
export interface PublicSessionsState {
  /**
   * 회차 목록
   */
  sessions: PublicSeminarSession[];

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
}

/**
 * 계약 페이지 상한(pageSize<=100). 공개 예약 창은 이보다 훨씬 작음
 */
const PAGE_SIZE = 100;

/**
 * 공개 회차 목록을 불러옴
 */
export function usePublicSessions(): PublicSessionsState {
  const [sessions, setSessions] = useState<PublicSeminarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        // 지점 필터 없이 전부 받아 캠퍼스별로 나눔 — ALL 회차가 모든 캠퍼스에 보여야 함
        const page = await listPublicSeminarSessions({ pageSize: PAGE_SIZE }, controller.signal);
        if (controller.signal.aborted) return;
        setSessions(page.items);
        setError(null);
      } catch (caught) {
        // 앞선 요청이 취소된 것이면 조용히 버림 — 낡은 응답이 화면을 덮지 않게
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
