"use client";

/**
 * 발송 로그 (계약 GET /api/v1/admin/sms/messages · 명세 §5.4).
 *
 * 서버가 `batches` 로 배치를 이미 집계해 준다 — 그 수치가 유일한 진실이고, 화면은 배치의
 * 구성원 행을 다시 묶지 않는다 (같은 발송을 두 번 세게 된다). 배치에 속하지 않는 행만 따로 붙인다.
 */

import { useCallback, useEffect, useState } from "react";
import { defaultErrorMessage, isAborted, listSmsMessages, smsSuccessRate, toSmsLogRows } from "@/shared/api";
import type { Branch, SmsLogRow } from "@/shared/api";

/** 계약 최대 200. 화면은 최근 것만 보면 되므로 넉넉히 낮춘다. */
const LOG_LIMIT = 100;

export interface SmsLogsState {
  rows: SmsLogRow[];
  /** 확정된 건이 없으면 null — 배지를 그리지 않는다 (100% 라고 쓰지 않기 위해서). */
  successRate: number | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * 결과에 어떤 요청의 답인지 붙여 둔다 — 진행 중 여부를 effect 안에서 setState 로 알리는 대신
 * "지금 필요한 요청 키"와 "손에 든 결과의 키"를 비교해 파생시킨다 (useFamilyBookings 와 같은 방식).
 */
interface LogsResult {
  key: string;
  rows: SmsLogRow[] | null;
  error: string | null;
}

export function useSmsLogs(filters: { branch?: Branch; seminarSessionId?: string } = {}): SmsLogsState {
  const [result, setResult] = useState<LogsResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const { branch, seminarSessionId } = filters;
  const requestKey = JSON.stringify([branch ?? "", seminarSessionId ?? "", reloadToken]);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const list = await listSmsMessages(
          { branch, seminarSessionId, source: "ADMIN_GROUP", limit: LOG_LIMIT },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, rows: toSmsLogRows(list), error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        // 이전에 읽어 둔 목록은 남긴다 — 새로고침 실패가 화면을 비우면 안 된다.
        setResult((previous) => ({
          key: requestKey,
          rows: previous?.rows ?? null,
          error: defaultErrorMessage(caught),
        }));
      }
    })();

    return () => controller.abort();
  }, [branch, seminarSessionId, requestKey]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const rows = result?.rows ?? null;

  return {
    rows: rows ?? [],
    successRate: rows === null ? null : smsSuccessRate(rows),
    loading: result === null,
    refreshing: result !== null && result.key !== requestKey,
    error: result?.error ?? null,
    reload,
  };
}
