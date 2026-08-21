"use client";

/**
 * 실시간 입장 로그 — 게이트에서 일어나는 일을 운영 화면에서 새로고침 없이 본다.
 *
 * 터미널처럼 그린다: 한 줄 한 사건, 새 줄은 아래에 붙는다. 운영 중에 실제로 묻는 것은
 * "방금 그 가족 처리됐나"라서, 표보다 흐르는 로그가 맞다.
 *
 * 전송은 **커서 폴링**이다(3초, afterSequence). 이벤트 원장이 단조 증가 sequence 를 주므로
 * 마지막 줄 뒤만 다시 물으면 새 줄만 온다 — 같은 줄을 두 번 그릴 일도, 놓칠 일도 없다.
 * SSE/웹소켓을 붙일 이유가 아직 없다: 게이트 처리량은 분당 수십 건이고, 3초 폴링 한 번은
 * 로그 몇 줄짜리 응답이다.
 *
 * 실패는 조용히 넘긴다 — 다음 폴링이 같은 커서로 다시 묻는다. 로그가 잠깐 늦는 것은
 * 사고가 아니지만, 오류 배너가 3초마다 깜빡이는 것은 운영 방해다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { listAdminCheckInEvents, type CheckInAuditEvent } from "@/shared/api/admin-operations";
import type { CheckInResult } from "@/shared/api";

/** 화면에 유지하는 최대 줄 수 — 그 이상은 오래된 줄부터 버린다(전체 이력은 원장에 있다). */
const MAX_LINES = 300;
const POLL_MS = 3000;

const RESULT_LABELS: Readonly<Record<CheckInResult, string>> = {
  CHECKED_IN: "입장",
  PARTY_SELECTION_REQUIRED: "인원 확인 대기",
  ALREADY_CHECKED_IN: "이미 입장",
  CANCELLED: "취소된 예약",
  SESSION_MISMATCH: "다른 회차",
  EXPIRED_QR: "만료 QR",
  REVOKED_QR: "폐기 QR",
  INVALID_QR: "잘못된 QR",
  RESERVATION_NOT_FOUND: "예약 없음",
  NOT_AUTHORIZED: "권한 없음",
};

function resultColor(result: CheckInResult): string {
  if (result === "CHECKED_IN") return "var(--mint-400)";
  if (result === "PARTY_SELECTION_REQUIRED") return "var(--status-warning-on-dark)";
  if (result === "ALREADY_CHECKED_IN") return "rgba(248,250,252,0.55)";
  return "var(--status-danger)";
}

function formatLine(event: CheckInAuditEvent): { time: string; gate: string; body: string } {
  const time = new Date(event.occurredAt).toLocaleTimeString("ko-KR", { hour12: false });
  const gate = event.scannerGateCode ?? event.scannerDeviceName ?? "-";
  const name = event.representativeStudentName ?? "(이름 없음)";
  const attended = typeof event.safeMetadata["attendedCount"] === "number"
    ? ` · ${event.safeMetadata["attendedCount"] as number}명`
    : "";
  return { time, gate, body: `${name}${attended} — ${RESULT_LABELS[event.result]}` };
}

export function LiveCheckInLog({ seminarSessionId }: { seminarSessionId: string }) {
  /**
   * 줄에 **어느 회차의 것인지**를 함께 들고 있는다. 회차를 바꾸면 이전 줄은 곧바로 남의
   * 로그다 — effect 에서 비우는 대신 키를 대조해 파생하면 그 사이 한 프레임도 새지 않는다.
   */
  const [log, setLog] = useState<{ sessionId: string; lines: CheckInAuditEvent[] } | null>(null);
  const lines = useMemo(
    () => (log !== null && log.sessionId === seminarSessionId ? log.lines : []),
    [log, seminarSessionId],
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    /** 다음 폴링이 이어받을 커서 — state 로 두면 interval 콜백이 낡은 값을 본다. */
    let cursor: string | undefined;

    const pull = async () => {
      try {
        // 원장은 오름차순이라 첫 회는 처음부터 끝까지 비운다(페이지당 200줄).
        // 회차 하나의 이벤트는 수백 건 규모라 몇 페이지면 끝난다.
        for (;;) {
          const page = await listAdminCheckInEvents(
            { sessionId: seminarSessionId, afterSequence: cursor, limit: 200 },
            controller.signal,
          );
          if (stopped) return;
          if (page.items.length > 0) {
            cursor = page.items[page.items.length - 1]!.sequence;
            setLog((current) => {
              const base = current !== null && current.sessionId === seminarSessionId ? current.lines : [];
              return { sessionId: seminarSessionId, lines: [...base, ...page.items].slice(-MAX_LINES) };
            });
          }
          if (!page.page.hasMore) return;
        }
      } catch {
        // 다음 폴링이 같은 커서로 다시 묻는다.
      }
    };

    void pull();
    const timer = setInterval(() => { void pull(); }, POLL_MS);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [seminarSessionId]);

  // 새 줄이 붙으면 바닥으로 — 위로 올려 둔 상태(과거 확인 중)면 건드리지 않는다.
  useEffect(() => {
    const box = scrollRef.current;
    if (box === null) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      aria-label="실시간 입장 로그"
      style={{
        height: 260,
        overflowY: "auto",
        background: "#0b1016",
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(248,250,252,0.08)",
        padding: "10px 14px",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 12.5,
        lineHeight: 1.9,
      }}
    >
      {lines.length === 0 ? (
        <span style={{ color: "rgba(248,250,252,0.4)" }}>아직 입장 기록이 없어요. 게이트 처리가 생기면 여기로 흘러요.</span>
      ) : (
        lines.map((event) => {
          const line = formatLine(event);
          return (
            <div key={event.eventId} style={{ display: "flex", gap: 10, whiteSpace: "nowrap" }}>
              <span style={{ color: "rgba(248,250,252,0.45)" }}>{line.time}</span>
              <span style={{ color: "rgba(248,250,252,0.6)", minWidth: 64 }}>[{line.gate}]</span>
              <span style={{ color: resultColor(event.result), overflow: "hidden", textOverflow: "ellipsis" }}>
                {line.body}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
