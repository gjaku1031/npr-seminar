"use client";

import { useCallback, useEffect, useState } from "react";
import { defaultErrorMessage, getSmsTemplatePolicy, isAborted, isApiError, type SmsTemplatePolicy } from "@/shared/api";

/**
 * 관리자 문자 편집 정책의 조회 상태와 재시도 동작
 */
export interface SmsTemplatePolicyState {
  /**
   * 문자 편집 정책. 아직 없으면 null
   */
  policy: SmsTemplatePolicy | null;

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
 * 서버 편집 정책을 조회함. 다시 읽는 동안 기존 정책을 남겨 초안과 선택을 보존함
 */
export function useSmsTemplatePolicy(): SmsTemplatePolicyState {
  const [policy, setPolicy] = useState<SmsTemplatePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await getSmsTemplatePolicy(controller.signal);
        if (controller.signal.aborted) return;
        setPolicy(next);
      } catch (caught) {
        if (controller.signal.aborted || isAborted(caught)) return;
        setError(!isApiError(caught) && caught instanceof Error ? caught.message : defaultErrorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  // 진행 중인 조회를 취소하고 정책을 다시 읽음
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadToken((token) => token + 1);
  }, []);
  return { policy, loading, error, reload };
}
