"use client";

/**
 * 회차 종료·삭제 — 계약 PATCH(status) / DELETE(보관) /admin/seminar-sessions/{id}.
 *
 * 규칙은 비재원생 토글과 같다:
 * - **낙관적 확정 금지**: 서버 200 을 받기 전에는 바뀐 척하지 않는다.
 * - 멱등 키는 회차별로 잡는다. 결과 미상(network·5xx) 뒤 같은 회차를 다시 눌러도 같은 키가
 *   나가 리플레이된다 — 되돌릴 수 없는 조작일수록 중복 실행이 없어야 한다.
 * - 409 낙관적 잠금 충돌은 "다른 관리자 변경"으로 안내하고 목록을 다시 읽는다.
 *
 * 확인 절차(경고문 + 문구 타이핑)는 화면 쪽 SessionLifecycleDialog 가 맡는다. 이 훅은
 * 이미 확인된 요청만 받는다.
 */

import { useCallback, useState } from "react";
import {
  archiveAdminSeminarSession,
  defaultErrorMessage,
  isApiError,
  updateAdminSeminarSession,
  useKeyedOperationKeys,
  type AdminSeminarSession,
} from "@/shared/api";

export type SessionLifecycleAction = "CLOSE" | "ARCHIVE";

export interface SessionLifecycleState {
  busy: boolean;
  error: string | null;
  status: string | null;
  run: (session: AdminSeminarSession, action: SessionLifecycleAction) => Promise<boolean>;
  clear: () => void;
}

export function useSessionLifecycle(reload: () => void): SessionLifecycleState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const keys = useKeyedOperationKeys();

  const run = useCallback(
    async (session: AdminSeminarSession, action: SessionLifecycleAction): Promise<boolean> => {
      const id = session.seminarSessionId;
      // 종료와 삭제는 서로 다른 조작이다 — 키를 나눠야 한쪽의 미확정이 다른 쪽을 막지 않는다.
      const lookup = keys.keyFor(`${action}:${id}`);
      if (!lookup.ok) {
        setError("결과가 확인되지 않은 변경이 쌓였어요. 잠시 후 목록을 새로고침한 뒤 다시 시도해 주세요.");
        return false;
      }

      setBusy(true);
      setError(null);
      setStatus(null);

      try {
        if (action === "CLOSE") {
          await updateAdminSeminarSession(
            id,
            { status: "CLOSED", expectedVersion: session.version },
            { idempotencyKey: lookup.key },
          );
        } else {
          await archiveAdminSeminarSession(
            id,
            { expectedVersion: session.version, reason: "관리자 콘솔에서 삭제" },
            { idempotencyKey: lookup.key },
          );
        }
        keys.settle(`${action}:${id}`);
        setStatus(action === "CLOSE" ? "설명회를 종료했어요." : "설명회를 삭제했어요.");
        reload();
        return true;
      } catch (caught) {
        keys.settle(`${action}:${id}`, caught);
        if (isApiError(caught) && caught.status === 409) {
          setError("다른 관리자 변경을 반영했어요. 다시 확인해 주세요.");
          reload();
        } else {
          setError(defaultErrorMessage(caught));
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [keys, reload],
  );

  const clear = useCallback(() => { setError(null); setStatus(null); }, []);

  return { busy, error, status, run, clear };
}
