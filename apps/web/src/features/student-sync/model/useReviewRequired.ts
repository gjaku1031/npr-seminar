"use client";

/**
 * 확인 필요 상세 조회 (계획된 GET /api/v1/admin/students/review-required)
 *
 * 요약 카드의 `확인 필요` 수는 목록 응답의 summary 가 이미 줌 — 이 훅은 그 수를 누가·왜
 * 로 펼칠 팝오버 내용을 담당함. 그래서 팝오버를 한 번도 열지 않았으면(`enabled:false`)
 * 요청조차 내지 않음. 엔드포인트가 아직 없으면 어댑터가 빈 목록으로 떨어뜨리므로(그건
 * 오류가 아님) 여기서 따로 분기하지 않음 — 카드 수는 요약값으로 그대로 온전함
 */

import { useCallback, useEffect, useState } from "react";
import { listReviewRequiredStudents } from "@/shared/api";
import type { Branch, ReviewRequiredStudent } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

/**
 * 확인 필요 학생 목록 상태
 */
export interface ReviewRequiredState {
  /**
   * 확인 필요 학생
   */
  items: ReviewRequiredStudent[];
  /**
   * 서버가 센 캠퍼스 범위 확인 필요 총원. 화면은 이 수를 다시 세지 않음
   */
  totalCount: number;

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
 * 확인 필요 학생 목록을 불러오는 훅
 */
export function useReviewRequiredStudents(branch: Branch | undefined, enabled: boolean): ReviewRequiredState {
  // 도착한 응답을 조회 신원(branch)과 함께 들고 있음 — 캠퍼스가 바뀌면 다시 loading 임
  const [state, setState] = useState<{
    branch: Branch | undefined;
    items: ReviewRequiredStudent[];
    totalCount: number;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await listReviewRequiredStudents({ branch }, controller.signal);
        if (controller.signal.aborted) return;
        setState({ branch, items: next.items, totalCount: next.totalCount, error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        // 미배포(404 등)는 어댑터가 이미 빈 목록으로 걸러 줌 — 여기 오는 건 진짜 오류임
        setState({ branch, items: [], totalCount: 0, error: defaultErrorMessage(caught) });
      }
    })();

    return () => controller.abort();
  }, [branch, enabled, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // 아직 이 캠퍼스의 응답이 아니면 loading — 낡은 캠퍼스 목록을 잠깐이라도 보여 주지 않음
  const loaded = state !== null && state.branch === branch;

  return {
    items: loaded ? state.items : [],
    totalCount: loaded ? state.totalCount : 0,
    loading: enabled && !loaded,
    error: loaded ? state.error : null,
    reload,
  };
}
