"use client";

/**
 * 현장 입장 — 연락처 뒷 4자리 다이얼 입력 (명세 §9.3) — qr-poc ScannerManualEntry 이식.
 * 스캔 화면 우측 패널: 키패드로 뒷 4자리 입력 → 조회 → 재원생(모/부 모두 매칭)·비재원 예약 카드 →
 * 기존 예약은 체크인, 무예약 재원생은 즉석 예약+체크인(현장 예약). 비재원 무예약은 수동 추가 안내.
 * 다크 전체화면 위 패널이라 색은 다크 표면 기준 — 디자인 토큰만 사용, shared/ui는 수정하지 않는다.
 */

import { useMemo, useState } from "react";
import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { Student } from "@/entities/student";
import { fmtDateTimeShort } from "@/shared/lib/format";
import { idleState } from "@/shared/lib/action";
import { checkInAction, walkInAction } from "@/features/check-in";

export interface ManualEntryDone {
  name: string;
  school: string;
  grade: string;
  code: string;
}

export interface ManualEntryPanelProps {
  session: Session;
  students: Student[];
  reservations: Reservation[];
  scannerNo: number;
  /** 입장 성공 — 부모가 확인 팝업(2초)을 띄운다 (명세 §9.2) */
  onEntered: (done: ManualEntryDone) => void;
}

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const digitsOf = (value: string) => value.replace(/\D/g, "");
const last4Of = (value: string) => digitsOf(value).slice(-4);

/* ── 다크 표면 팔레트 (스캔 전체화면 #0A0F1A 위) ── */
const ink = {
  strong: "var(--gray-1)",
  muted: "rgba(248,250,252,0.62)",
  faint: "rgba(248,250,252,0.4)",
  card: "rgba(248,250,252,0.05)",
  cardHover: "rgba(248,250,252,0.09)",
  border: "rgba(248,250,252,0.12)",
  borderSoft: "rgba(248,250,252,0.08)",
};

const keyStyle: React.CSSProperties = {
  height: 52,
  borderRadius: "var(--radius-md)",
  border: `1px solid ${ink.border}`,
  background: ink.card,
  color: ink.strong,
  fontFamily: "var(--font-display)",
  fontSize: 20,
  fontWeight: 800,
  cursor: "pointer",
  transition: "all var(--dur-fast) var(--ease-out)",
};

type MatchStatus = "entered" | "reserved" | "none";

interface MatchRow {
  key: string;
  studentId: string | null;
  name: string;
  school: string;
  grade: string;
  className: string;
  phone: string;
  /** 매칭된 학부모 (모/부/모·부) — 재원생만 */
  matchedBy: string;
  member: boolean;
  status: MatchStatus;
  reservation: Reservation | null;
}

export function ManualEntryPanel({ session, students, reservations, scannerNo, onEntered }: ManualEntryPanelProps) {
  const [last4, setLast4] = useState("");
  const [searchedDigits, setSearchedDigits] = useState<string | null>(null);
  const [enteringKey, setEnteringKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [doneKey, setDoneKey] = useState<string | null>(null);

  /* 조회 결과는 props에서 파생 — 입장 처리 후 revalidate로 새 props가 오면 자동 갱신된다 */
  const rows = useMemo<MatchRow[]>(() => {
    if (!searchedDigits) return [];
    const bySession = reservations.filter((r) => r.sessionId === session.id);
    const found: MatchRow[] = [];

    for (const s of students) {
      const motherHit = last4Of(s.motherPhone) === searchedDigits;
      const fatherHit = last4Of(s.fatherPhone) === searchedDigits;
      if (!motherHit && !fatherHit) continue;

      const mine = bySession
        .filter((r) => r.studentId === s.id)
        .sort((a, b) => b.reservedAt.getTime() - a.reservedAt.getTime());
      const active = mine.find((r) => r.status === "entered") ?? mine.find((r) => r.status === "reserved") ?? null;

      found.push({
        key: `student:${s.id}`,
        studentId: s.id,
        name: s.name,
        school: s.school,
        grade: s.grade,
        className: s.className,
        phone: motherHit ? s.motherPhone : s.fatherPhone,
        matchedBy: motherHit && fatherHit ? "모·부" : motherHit ? "모" : "부",
        member: true,
        status: active ? (active.status === "entered" ? "entered" : "reserved") : "none",
        reservation: active,
      });
    }

    // 비재원생 예약(전화·선생님 예약 등) — 예약 연락처 뒷 4자리 매칭 (qr-poc 병합 로직)
    for (const r of bySession) {
      if (r.studentId || last4Of(r.phone) !== searchedDigits) continue;
      if (r.status !== "reserved" && r.status !== "entered") continue;
      found.push({
        key: `guest:${r.id}`,
        studentId: null,
        name: r.name,
        school: r.school,
        grade: r.grade,
        className: r.className,
        phone: r.phone,
        matchedBy: "",
        member: false,
        status: r.status === "entered" ? "entered" : "reserved",
        reservation: r,
      });
    }

    return found.sort((a, b) => (a.status === "none" ? 1 : 0) - (b.status === "none" ? 1 : 0));
  }, [searchedDigits, students, reservations, session.id]);

  const appendDigit = (digit: string) => {
    if (enteringKey) return;
    setLast4((cur) => (cur.length >= 4 ? cur : `${cur}${digit}`));
    setError("");
    setSearchedDigits(null);
    setDoneKey(null);
  };

  const deleteDigit = () => {
    if (enteringKey) return;
    setLast4((cur) => cur.slice(0, -1));
    setError("");
    setSearchedDigits(null);
    setDoneKey(null);
  };

  const clearAll = () => {
    if (enteringKey) return;
    setLast4("");
    setError("");
    setSearchedDigits(null);
    setDoneKey(null);
  };

  const search = () => {
    if (last4.length !== 4) {
      setError("연락처 뒷자리 4자리를 입력해 주세요.");
      return;
    }
    setError("");
    setDoneKey(null);
    setSearchedDigits(last4);
  };

  /* 입장 처리 — 기존 예약은 checkIn, 무예약 재원생은 즉석 예약+체크인 (명세 §9.3) */
  const enter = async (row: MatchRow) => {
    if (enteringKey) return;
    setEnteringKey(row.key);
    setError("");
    try {
      const fd = new FormData();
      fd.set("scannerNo", String(scannerNo));
      let result;
      if (row.reservation && row.status === "reserved") {
        fd.set("reservationId", row.reservation.id);
        result = await checkInAction(idleState, fd);
      } else if (row.studentId) {
        fd.set("studentId", row.studentId);
        fd.set("sessionId", session.id);
        result = await walkInAction(idleState, fd);
      } else {
        return;
      }

      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (result.status === "success" && result.data) {
        setDoneKey(row.key);
        onEntered({ name: row.name, school: row.school, grade: row.grade, code: result.data.code });
      }
    } catch {
      setError("입장 처리 중 오류가 발생했어요.");
    } finally {
      setEnteringKey(null);
    }
  };

  const statusPill = (status: MatchStatus) => {
    const map = {
      entered: { label: "입장 완료", color: "var(--status-success)", bg: "rgba(34,197,94,0.14)" },
      reserved: { label: "예약", color: "var(--mint-400)", bg: "rgba(56,189,248,0.14)" },
      none: { label: "미예약", color: "var(--status-warning)", bg: "rgba(245,158,11,0.16)" },
    } as const;
    const t = map[status];
    return (
      <span style={{ flexShrink: 0, borderRadius: "var(--radius-pill)", padding: "4px 10px", fontSize: 11.5, fontWeight: 700, color: t.color, background: t.bg }}>
        {t.label}
      </span>
    );
  };

  return (
    <section
      aria-label="현장 입장 — 학부모 연락처 뒷 4자리"
      style={{ borderRadius: "var(--radius-xl)", border: `1px solid ${ink.borderSoft}`, background: ink.card, padding: 18 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: ink.strong }}>현장 입장</div>
          <div style={{ fontSize: 12, color: ink.muted, marginTop: 3 }}>학부모 연락처 뒷자리 4자리 — 모/부 모두 조회돼요</div>
        </div>
        <span style={{ borderRadius: "var(--radius-pill)", background: "rgba(56,189,248,0.15)", color: "var(--mint-400)", fontSize: 11.5, fontWeight: 700, padding: "4px 10px", flexShrink: 0 }}>
          수동
        </span>
      </div>

      {/* 입력 슬롯 4칸 */}
      <div aria-label="입력된 연락처 뒷자리" aria-live="polite" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 10 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 52,
              borderRadius: "var(--radius-md)",
              border: last4[i] ? "1.5px solid var(--mint-500)" : `1px solid ${ink.border}`,
              background: last4[i] ? "rgba(56,189,248,0.12)" : "rgba(10,15,26,0.4)",
              color: last4[i] ? "var(--mint-400)" : ink.faint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontSize: 21,
              fontWeight: 800,
              transition: "all var(--dur-fast) var(--ease-out)",
            }}
          >
            {last4[i] ?? ""}
          </div>
        ))}
      </div>

      {/* 키패드 3×4 — qr-poc 다이얼 배열 (1~9 · 지움 · 0 · 조회) */}
      <div aria-label="연락처 뒷자리 키패드" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {DIGIT_KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={Boolean(enteringKey) || last4.length >= 4}
            onClick={() => appendDigit(digit)}
            style={{ ...keyStyle, opacity: last4.length >= 4 ? 0.45 : 1 }}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          disabled={Boolean(enteringKey) || last4.length === 0}
          onClick={deleteDigit}
          style={{ ...keyStyle, fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 700, color: ink.muted, opacity: last4.length === 0 ? 0.45 : 1 }}
        >
          지움
        </button>
        <button
          type="button"
          disabled={Boolean(enteringKey) || last4.length >= 4}
          onClick={() => appendDigit("0")}
          style={{ ...keyStyle, opacity: last4.length >= 4 ? 0.45 : 1 }}
        >
          0
        </button>
        <button
          type="button"
          disabled={Boolean(enteringKey) || last4.length !== 4}
          onClick={search}
          style={{
            ...keyStyle,
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 800,
            border: "none",
            background: last4.length === 4 ? "var(--mint-500)" : "rgba(56,189,248,0.25)",
            color: last4.length === 4 ? "#062033" : "rgba(248,250,252,0.55)",
            cursor: last4.length === 4 ? "pointer" : "not-allowed",
          }}
        >
          조회
        </button>
      </div>

      {last4.length > 0 && (
        <button
          type="button"
          disabled={Boolean(enteringKey)}
          onClick={clearAll}
          style={{ marginTop: 8, width: "100%", padding: "9px 0", borderRadius: "var(--radius-md)", border: `1px solid ${ink.borderSoft}`, background: "transparent", color: ink.muted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
        >
          초기화
        </button>
      )}

      {error && (
        <p style={{ margin: "12px 0 0", borderRadius: "var(--radius-sm)", background: "rgba(239,68,68,0.14)", color: "#FCA5A5", padding: "9px 12px", fontSize: 12.5, fontWeight: 600 }}>
          {error}
        </p>
      )}

      {/* 결과 영역 */}
      <div style={{ marginTop: 14 }}>
        {!searchedDigits && !error && (
          <div style={{ borderRadius: "var(--radius-md)", border: `1px dashed ${ink.border}`, padding: "22px 12px", textAlign: "center", fontSize: 12.5, color: ink.faint }}>
            검색 대기 — 뒷자리 입력 후 조회를 눌러주세요
          </div>
        )}

        {searchedDigits && rows.length === 0 && (
          <div style={{ borderRadius: "var(--radius-md)", border: `1px dashed ${ink.border}`, padding: "20px 14px", textAlign: "center", fontSize: 12.5, color: ink.muted, lineHeight: 1.7 }}>
            뒷자리 <b style={{ color: ink.strong }}>{searchedDigits}</b>와 일치하는 재원생·예약이 없어요.
            <br />
            비재원생은 예약 명단 → 수동 추가로 등록해 주세요.
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto", paddingRight: 2 }}>
            {rows.map((row) => {
              const busy = enteringKey === row.key;
              const justDone = doneKey === row.key;
              const canEnter = row.status !== "entered";
              return (
                <div
                  key={row.key}
                  style={{
                    borderRadius: "var(--radius-md)",
                    border: justDone ? "1.5px solid var(--status-success)" : `1px solid ${ink.borderSoft}`,
                    background: justDone ? "rgba(34,197,94,0.1)" : "rgba(10,15,26,0.35)",
                    padding: "12px 14px",
                    transition: "all var(--dur-fast) var(--ease-out)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: ink.strong }}>{row.name}</span>
                        {statusPill(row.status)}
                      </div>
                      <div style={{ fontSize: 12, color: ink.muted, marginTop: 3 }}>
                        {[row.school, row.grade, row.className].filter(Boolean).join(" · ")}
                      </div>
                      <div style={{ fontSize: 11.5, color: ink.faint, marginTop: 2 }}>
                        {row.phone}
                        {row.matchedBy ? ` (${row.matchedBy})` : ""}
                        {row.status === "entered" && row.reservation?.enteredAt
                          ? ` · 입장 ${fmtDateTimeShort(row.reservation.enteredAt)}`
                          : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!canEnter || Boolean(enteringKey)}
                      onClick={() => enter(row)}
                      style={{
                        flexShrink: 0,
                        borderRadius: "var(--radius-pill)",
                        border: "none",
                        padding: "9px 14px",
                        fontSize: 12.5,
                        fontWeight: 800,
                        fontFamily: "var(--font-body)",
                        cursor: canEnter && !enteringKey ? "pointer" : "not-allowed",
                        background: !canEnter ? "rgba(34,197,94,0.15)" : row.status === "reserved" ? "var(--mint-500)" : "var(--status-warning)",
                        color: !canEnter ? "var(--status-success)" : "#0A0F1A",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {!canEnter ? "입장 완료" : busy ? "처리 중…" : row.status === "reserved" ? "입장 처리" : "현장 입장"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p style={{ margin: "12px 0 0", fontSize: 11.5, color: ink.faint, lineHeight: 1.6 }}>
        미예약 재원생의 현장 입장은 즉석 예약(현장 예약) 후 바로 체크인돼요.
      </p>
    </section>
  );
}
