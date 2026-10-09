"use client";

/**
 * 발송 로그 조회 훅. 계약 GET /api/v1/admin/sms/messages
 *
 * 서버가 `batches` 로 배치를 이미 집계해 줌 — 그 수치가 유일한 진실이고, 화면은 배치의
 * 구성원 행을 다시 묶지 않음 (같은 발송을 두 번 세게 됨). 배치에 속하지 않는 행만 따로 붙임
 */

import { useCallback, useEffect, useState } from "react";
import { defaultErrorMessage, isAborted, listSmsMessages, smsSuccessRate, toSmsLogRows } from "@/shared/api";
import type { Branch, SmsLogRow } from "@/shared/api";

/**
 * 계약 최대 200. 화면은 최근 것만 보면 되므로 넉넉히 낮춤
 */
const LOG_LIMIT = 100;

/**
 * 문자 발송 로그 상태
 */
export interface SmsLogsState {
  /**
   * 로그 행
   */
  rows: SmsLogRow[];
  /**
   * 확정된 건이 없으면 null — 배지를 그리지 않음 (100% 라고 쓰지 않기 위해서)
   */
  successRate: number | null;

  /**
   * 불러오는 중 여부
   */
  loading: boolean;

  /**
   * 배경 갱신 중 여부
   */
  refreshing: boolean;

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
 * 결과에 어떤 요청의 답인지 붙여 둠 — 진행 중 여부를 effect 안에서 setState 로 알리는 대신
 * "지금 필요한 요청 키"와 "손에 든 결과의 키"를 비교해 파생시킴 (useFamilyBookings 와 같은 방식)
 */
interface LogsResult {
  /**
   * 필터 조합 키
   */
  key: string;

  /**
   * 로그 행. 실패면 null
   */
  rows: SmsLogRow[] | null;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;
}

/**
 * 문자 발송 로그를 불러오는 훅
 */
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
        // 이전에 읽어 둔 목록은 남김 — 새로고침 실패가 화면을 비우면 안 됨
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
