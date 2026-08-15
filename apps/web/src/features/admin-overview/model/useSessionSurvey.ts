"use client";

/**
 * 한 회차의 설문 응답 (계약 GET /admin/seminar-sessions/{id}/survey-responses).
 *
 * ★ 계약이 주는 응답에는 학생·반·담임·연락처가 **없다** — 설문 화면에서 사람을 특정할 수
 *   없게 서버가 일부러 뺐다. 그래서 이 훅도 별점·후기·제출 시각만 다룬다.
 * ★ 평균은 `summary.averageRating`(서버가 회차 전체로 센 값)만 쓴다. 한 페이지의 평균은
 *   회차 평균이 아니다.
 */

import { useCallback, useEffect, useState } from "react";
import { listSessionSurveyResponses } from "@/shared/api";
import type { SurveyResponse, SurveyResponseSummary } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

/** 계약 최대 200. 설문은 한 회차 분량이라 한 번에 넉넉히 읽는다. */
const SURVEY_PAGE_SIZE = 100;

export interface SessionSurveyState {
  items: SurveyResponse[];
  summary: SurveyResponseSummary | null;
  /** 서버가 센 전체 응답 수 — items.length 는 이 중 첫 페이지일 뿐이다. */
  totalItems: number;
  /** 아직 화면에 없는 응답이 남아 있는지 — 있으면 화면이 그렇게 말해야 한다. */
  truncated: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useSessionSurvey(seminarSessionId: string | null): SessionSurveyState {
  const [result, setResult] = useState<{
    key: string;
    items: SurveyResponse[];
    summary: SurveyResponseSummary | null;
    totalItems: number;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${seminarSessionId ?? ""}:${reloadToken}`;

  useEffect(() => {
    if (seminarSessionId === null) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const page = await listSessionSurveyResponses(
          seminarSessionId,
          { pageSize: SURVEY_PAGE_SIZE },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          items: page.items,
          summary: page.summary,
          totalItems: page.page.totalItems,
          error: null,
        });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setResult({
          key: requestKey,
          items: [],
          summary: null,
          totalItems: 0,
          error: defaultErrorMessage(caught),
        });
      }
    })();

    return () => controller.abort();
  }, [seminarSessionId, requestKey]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const fresh = result !== null && result.key === requestKey;

  return {
    items: fresh ? result.items : [],
    summary: fresh ? result.summary : null,
    totalItems: fresh ? result.totalItems : 0,
    truncated: fresh ? result.items.length < result.totalItems : false,
    loading: seminarSessionId !== null && !fresh,
    error: fresh ? result.error : null,
    reload,
  };
}
