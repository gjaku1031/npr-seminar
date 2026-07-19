"use client";

/**
 * 게이트웨이 준비 상태 (계약 GET /api/v1/admin/sms/gateway-readiness).
 *
 * 읽기 실패는 발송 금지 사유가 아니다 — 준비 상태를 못 읽었다고 멀쩡한 기능을 잠그면
 * 관측 실패가 곧 장애가 된다. 못 읽었으면 `readiness:null` 로 두고 화면은 경고만 접는다.
 */

import { useCallback, useEffect, useState } from "react";
import { getSmsGatewayReadiness, isAborted, isSmsSendDisabled, smsReadinessWarning } from "@/shared/api";
import type { SmsGatewayReadiness } from "@/shared/api";

export interface SmsGatewayState {
  readiness: SmsGatewayReadiness | null;
  loading: boolean;
  /** 기능 자체가 꺼졌을 때만 true — API 로컬 시크릿 부재는 여기 들어오지 않는다. */
  sendDisabled: boolean;
  /** 짧은 안내 한 줄. 문제 없으면 null. */
  warning: string | null;
  reload: () => void;
}

export function useSmsGateway(): SmsGatewayState {
  const [readiness, setReadiness] = useState<SmsGatewayReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await getSmsGatewayReadiness(controller.signal);
        if (controller.signal.aborted) return;
        setReadiness(next);
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        // 준비 상태를 모르는 것과 "꺼져 있다"는 다르다 — null 로 남긴다.
        setReadiness(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    readiness,
    loading,
    sendDisabled: isSmsSendDisabled(readiness),
    warning: smsReadinessWarning(readiness),
    reload,
  };
}
