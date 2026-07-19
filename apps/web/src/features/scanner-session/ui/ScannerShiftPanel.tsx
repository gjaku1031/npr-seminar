"use client";

/**
 * 회차 선택/잠금 — 계약 GET·POST /api/v1/scanner/shifts/current,
 * 목록은 GET /api/v1/scanner/check-in/sessions.
 *
 * 기기·지점·게이트는 서버가 세션에서 파생한다 — 화면은 회차만 고른다.
 * 잠금 없이는 계약상 QR·수동 체크인이 모두 거부되므로 스캔 화면을 열지 않는다.
 */

import { useCallback, useEffect, useId, useState } from "react";
import {
  createScannerShiftLock,
  defaultErrorMessage,
  isAborted,
  isApiError,
  isDefinitiveFailure,
  listScannerCheckInSessions,
  useOperationKey,
  type PublicSeminarSession,
  type ScannerShiftState,
} from "@/shared/api";
import { fmtDateTime } from "@/shared/lib/format";

export interface ScannerShiftPanelProps {
  onLocked: (shift: ScannerShiftState) => void;
}

export function ScannerShiftPanel({ onLocked }: ScannerShiftPanelProps) {
  const [sessions, setSessions] = useState<PublicSeminarSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 결과가 확정되지 않은 잠금 요청의 **정확한 첫 페이로드**(seminarSessionId).
   *
   * 계약상 "같은 Idempotency-Key + 다른 본문" 은 409 다. 미상 구간에서 키만 유지한 채
   * 회차를 바꿔 재시도하면 그 조합이 나가므로, 키와 회차를 한 묶음으로 붙잡는다.
   */
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const selectId = useId();
  const lockKey = useOperationKey();

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await listScannerCheckInSessions(controller.signal);
        setSessions(result.items);
        setSelectedId((current) => current || (result.items[0]?.seminarSessionId ?? ""));
        setError(null);
      } catch (caught) {
        if (isAborted(caught)) return;
        setError(defaultErrorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const lock = useCallback(async () => {
    // 미확정 조작이 남아 있으면 그 회차가 유일한 진실이다 — 선택값이 아니라 첫 시도의 본문을 다시 보낸다.
    const sessionId = pendingSessionId ?? selectedId;
    if (!sessionId) return;

    setLocking(true);
    setError(null);

    try {
      const shift = await createScannerShiftLock(sessionId, { idempotencyKey: lockKey.current() });
      lockKey.settle();
      setPendingSessionId(null);
      onLocked(shift);
    } catch (caught) {
      if (isDefinitiveFailure(caught)) {
        // 서버가 확정적으로 거절했다 — 키를 버리고 선택을 풀어 다른 회차를 고를 수 있게 한다.
        lockKey.settle(caught);
        setPendingSessionId(null);
        setError(
          isApiError(caught) && caught.status === 409
            ? "다른 기기가 이 회차를 사용 중이거나 이미 잠금이 있어요. 다른 회차를 고르거나 잠시 후 다시 시도해 주세요."
            : isApiError(caught) && caught.status === 403
              ? "이 기기의 지점에서는 선택한 회차를 스캔할 수 없어요. 다른 회차를 골라 주세요."
              : defaultErrorMessage(caught),
        );
        return;
      }

      // 결과 미상(네트워크·5xx) — 서버가 이미 잠갔을 수 있다. 키를 유지하고(settle 은 미상에서
      // 키를 남긴다) 회차를 고정해 완전히 같은 요청만 재시도한다.
      lockKey.settle(caught);
      setPendingSessionId(sessionId);
      setError(
        `${defaultErrorMessage(caught)} 회차가 설정됐는지 확인되지 않아 같은 회차로만 다시 시도할 수 있어요.`,
      );
    } finally {
      setLocking(false);
    }
  }, [pendingSessionId, selectedId, lockKey, onLocked]);

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px", textAlign: "center" }}>
      <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--gray-1)" }}>
        어느 설명회를 스캔할까요?
      </h2>
      <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "rgba(248,250,252,0.62)", lineHeight: 1.6 }}>
        회차를 선택하면 이 기기가 해당 회차 입장 처리를 시작해요.
      </p>

      {loading ? (
        <p style={{ marginTop: 24, fontSize: 13, color: "rgba(248,250,252,0.4)" }}>회차를 불러오는 중이에요.</p>
      ) : sessions.length === 0 ? (
        <p style={{ marginTop: 24, fontSize: 13.5, color: "rgba(248,250,252,0.62)" }}>
          지금 이 기기에서 스캔할 수 있는 회차가 없어요. 관리자에게 문의해 주세요.
        </p>
      ) : (
        <div style={{ marginTop: 24, textAlign: "left" }}>
          <label
            htmlFor={selectId}
            style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--gray-1)", marginBottom: 8 }}
          >
            설명회 회차
          </label>
          <select
            id={selectId}
            /* 미상 구간에는 첫 시도의 회차를 그대로 보여준다 */
            value={pendingSessionId ?? selectedId}
            /* 미상 구간에는 회차를 못 바꾼다 — 본문이 바뀌면 같은 키를 쓸 수 없다 */
            disabled={locking || pendingSessionId !== null}
            aria-describedby={`${selectId}-hint`}
            onChange={(event) => setSelectedId(event.target.value)}
            style={{
              width: "100%",
              height: 56,
              padding: "0 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(248,250,252,0.12)",
              background: "rgba(248,250,252,0.05)",
              color: "var(--gray-1)",
              fontSize: 15,
              fontFamily: "var(--font-body)",
              opacity: pendingSessionId !== null ? 0.7 : 1,
            }}
          >
            {sessions.map((session) => (
              <option key={session.seminarSessionId} value={session.seminarSessionId} style={{ color: "#0A0F1A" }}>
                {session.seminarTitle} · {fmtDateTime(new Date(session.startsAt))} · {session.location}
              </option>
            ))}
          </select>

          {pendingSessionId !== null && (
            <p
              id={`${selectId}-hint`}
              aria-live="polite"
              style={{ margin: "8px 0 0", fontSize: 12.5, color: "rgba(248,250,252,0.62)", lineHeight: 1.6 }}
            >
              먼저 보낸 요청의 결과가 확인되지 않아 회차를 바꿀 수 없어요. 같은 회차로만 다시 보낼 수 있어요.
            </p>
          )}

          <button
            type="button"
            onClick={() => void lock()}
            disabled={locking || !(pendingSessionId ?? selectedId)}
            style={{
              marginTop: 16,
              width: "100%",
              height: 56,
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "linear-gradient(135deg, var(--violet-800), var(--violet-600))",
              color: "var(--text-on-brand)",
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
              cursor: locking ? "not-allowed" : "pointer",
              opacity: locking ? 0.6 : 1,
            }}
          >
            {locking ? "설정 중..." : pendingSessionId !== null ? "같은 회차로 다시 시도" : "이 회차로 스캔 시작"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 16, fontSize: 13, color: "#FCA5A5", lineHeight: 1.6 }}>
          {error}
        </p>
      )}
    </div>
  );
}
