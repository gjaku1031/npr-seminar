"use client";

/**
 * 회차별 비재원생 예약 허용 토글 — 계약 PATCH /admin/seminar-sessions/{id}.
 *
 * 규칙:
 * - **낙관적 확정 금지**(pessimistic): 서버 200 을 받기 전에는 값을 바꾼 척하지 않는다.
 * - 멱등 키는 회차별로 잡는다(useKeyedOperationKeys). 결과 미상(network·5xx) 뒤 같은 회차를
 *   다시 눌러도 같은 키가 나가 리플레이된다. 회차를 바꾸면 그 회차의 미확정 키를 재사용하지 않는다.
 * - 성공/409 는 목록 reload 로 실제 상태를 다시 읽는다(단건 PATCH 응답은 operationsSummary 를
 *   0 으로 폴백할 수 있어, 이 응답으로 목록의 실집계를 덮지 않는다).
 * - 409 낙관적 잠금 충돌은 "다른 관리자 변경" 으로 안내하고 reload.
 * - network/5xx 는 결과 미상이므로 키를 유지하고, 재시도 전 reload 로 실제 상태를 확인하게 한다.
 */

import { useCallback, useState } from "react";
import {
  defaultErrorMessage,
  isApiError,
  updateAdminSeminarSession,
  useKeyedOperationKeys,
  type AdminSeminarSession,
} from "@/shared/api";

export interface GuestBookingToggleState {
  /** 저장 중인 회차 id (없으면 null) — 저장 중에는 스위치를 disabled 로 둔다. */
  savingId: string | null;
  /** 짧게 알릴 성공 상태 문구 ("허용됨" | "허용 안 함"). */
  status: string | null;
  error: string | null;
  toggle: (session: AdminSeminarSession, next: boolean) => Promise<void>;
  clearStatus: () => void;
}

/** reload 는 목록 훅의 reload — 성공/충돌 시 실제 상태를 다시 읽는다. */
export function useGuestBookingToggle(reload: () => void): GuestBookingToggleState {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = useKeyedOperationKeys();

  const toggle = useCallback(
    async (session: AdminSeminarSession, next: boolean) => {
      const id = session.seminarSessionId;
      const lookup = keys.keyFor(id);
      if (!lookup.ok) {
        setError("결과가 확인되지 않은 변경이 쌓였어요. 잠시 후 목록을 새로고침한 뒤 다시 시도해 주세요.");
        return;
      }

      setSavingId(id);
      setError(null);
      setStatus(null);

      try {
        await updateAdminSeminarSession(
          id,
          { guestBookingEnabled: next, expectedVersion: session.version },
          { idempotencyKey: lookup.key },
        );
        keys.settle(id);
        setStatus(next ? "허용됨" : "허용 안 함");
        // 실집계(operationsSummary)를 지키려고 목록을 다시 읽는다.
        reload();
      } catch (caught) {
        keys.settle(id, caught);
        if (isApiError(caught) && caught.status === 409) {
          setError("다른 관리자 변경을 반영했어요. 다시 확인해 주세요.");
          reload();
        } else {
          setError(`${defaultErrorMessage(caught)} 목록을 새로고침한 뒤 다시 시도해 주세요.`);
        }
      } finally {
        setSavingId(null);
      }
    },
    [keys, reload],
  );

  /** 다른 회차를 고를 때 이전 회차의 성공/오류 알림을 지운다(조작 키는 회차별이라 이미 분리돼 있다). */
  const clearStatus = useCallback(() => {
    setStatus(null);
    setError(null);
  }, []);

  return { savingId, status, error, toggle, clearStatus };
}
