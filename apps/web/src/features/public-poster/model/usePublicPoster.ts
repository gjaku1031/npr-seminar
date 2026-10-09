"use client";

/**
 * 공개 포스터 메타데이터 훅 — 계약 GET /api/v1/public/poster
 *
 * 상태를 정직하게 가름(계약상 항상 200 이라 상태코드로 못 가름):
 * - `pending`  : 첫 요청/재시도 중
 * - `empty`    : 200 이고 `poster: null`(아직 게시된 포스터가 없음)
 * - `ready`    : 200 이고 검증된 서술자. 이미지 로드 실패는 화면(컴포넌트) 이 별도로 다룸
 * - `error`    : 네트워크·5xx·깨진 메타데이터. 재시도로 다시 pending 이 됨
 *
 * 이미지 URL 검증은 어댑터(getPublicPoster→parsePosterResource)가 이미 끝냈으므로,
 * `ready` 서술자의 imageUrl 은 same-origin `/api/v1/public/poster/image/<64 hex>` 임이 보장됨
 */

import { useCallback, useEffect, useState } from "react";
import { getPublicPoster, isAborted, publicPosterErrorMessage, type PosterDescriptor } from "@/shared/api";

/**
 * 공개 포스터 조회 상태
 */
export type PublicPosterState =
  | { status: "pending" }
  | { status: "empty" }
  | { status: "ready"; descriptor: PosterDescriptor }
  | { status: "error"; message: string };

/**
 * 공개 포스터 상태와 다시 읽기
 */
export interface UsePublicPosterResult {
  /**
   * 조회 상태
   */
  state: PublicPosterState;

  /**
   * 다시 불러오기
   */
  reload: () => void;
}

/**
 * 공개 포스터를 불러오는 훅
 */
export function usePublicPoster(): UsePublicPosterResult {
  const [state, setState] = useState<PublicPosterState>({ status: "pending" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const resource = await getPublicPoster(controller.signal);
        if (controller.signal.aborted) return;
        setState(
          resource.poster
            ? { status: "ready", descriptor: resource.poster }
            : { status: "empty" },
        );
      } catch (caught) {
        // 취소된 앞선 요청은 조용히 버림 — 낡은 응답이 화면을 덮지 않게
        if (isAborted(caught) || controller.signal.aborted) return;
        setState({ status: "error", message: publicPosterErrorMessage(caught) });
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => {
    setState({ status: "pending" });
    setReloadToken((token) => token + 1);
  }, []);

  return { state, reload };
}
