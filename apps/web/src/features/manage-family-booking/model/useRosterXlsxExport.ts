"use client";

/**
 * 명단 XLSX 내보내기 (계약 GET .../roster.xlsx)
 *
 * 지금 회차·캠퍼스·단위·담임·검색 조건 그대로의 전체 명단을 서버가 XLSX 로 뽑아 줌
 * 여기서는 그 바이너리를 받아 브라우저 다운로드로 흘려보내고, object URL 을 잠시 뒤 폐기함
 *
 * `exportAdminSessionRosterXlsx` 는 배럴에 아직 없는 새 심볼이라 어댑터에서 직접 가져옴
 * 응답은 전체 연락처를 담은 ADMIN 전용 민감 데이터임 — Blob 내용을 로깅하지 않음
 */

import { useCallback, useRef, useState } from "react";
import {
  exportAdminSessionRosterXlsx,
  type ExportSessionRosterParams,
} from "@/shared/api/admin-session-roster";
import { defaultErrorMessage, isAborted } from "@/shared/api";

/**
 * 명단 XLSX 내보내기 상태
 */
export interface RosterXlsxExportState {
  /**
   * 내려받는 중 여부
   */
  downloading: boolean;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

  /**
   * 필터 조건으로 XLSX 내려받기
   */
  download: (params: ExportSessionRosterParams) => Promise<void>;

  /**
   * 오류 문구 지우기
   */
  dismiss: () => void;
}

/**
 * 회차 명단 XLSX 내려받기 훅
 */
export function useRosterXlsxExport(sessionId: string | undefined): RosterXlsxExportState {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 중복 클릭을 렌더 없이 막음 — 버튼 disabled 는 백업이고 이 ref 가 1차 방어임
  const inFlight = useRef(false);

  const download = useCallback(
    async (params: ExportSessionRosterParams) => {
      if (sessionId === undefined || inFlight.current) return;
      inFlight.current = true;
      setDownloading(true);
      setError(null);

      let objectUrl: string | null = null;
      try {
        const { blob, filename } = await exportAdminSessionRosterXlsx(sessionId, params);
        objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = "noopener";
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch (caught) {
        // 취소는 조용히 넘김 — 사용자가 떠난 것임
        if (!isAborted(caught)) setError(defaultErrorMessage(caught));
      } finally {
        if (objectUrl !== null) {
          const url = objectUrl;
          // 다운로드가 시작될 틈을 준 뒤 폐기함 — 즉시 revoke 하면 일부 브라우저가 저장을 취소함
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
        inFlight.current = false;
        setDownloading(false);
      }
    },
    [sessionId],
  );

  const dismiss = useCallback(() => setError(null), []);

  return { downloading, error, download, dismiss };
}
