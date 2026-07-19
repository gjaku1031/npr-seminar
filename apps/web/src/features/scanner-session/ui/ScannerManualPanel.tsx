"use client";

/**
 * 연락처 뒷 4자리 수동 입장 — qr-poc `ScannerManualEntry` 의 키패드 UI 이식 (pinned c4194a0).
 *
 * ⚠️ 이식하지 않은 것 (의도적):
 * - 원본의 `enterUnreservedStudentFromScanner` / "미예약 입장" 경로. 계약의 수동 체크인은
 *   **이미 존재하는 가족 예약**(familyBookingId)만 대상이고 워크인 생성은 지원하지 않는다.
 * - 원본의 Server Action·DB 접근. 조회/처리 모두 계약 API 로만 한다.
 *
 * 멱등성: 키를 **예약(familyBookingId)별로** 잡는다. 결과 미상 뒤 같은 후보를 다시 누르면
 * 같은 키가 나가 리플레이된다 — 매번 새 키면 이중 체크인이 된다. 다른 후보는 별개 조작.
 *
 * 연락처는 서버가 마스킹해서 준다 — 스캐너 후보(ManualCheckInCandidate)는 관리자 응답이
 * 전체 번호로 바뀐 뒤에도 **의도적으로 마스킹을 유지한다**. 현장 태블릿은 공용 화면이다.
 */

import { useCallback, useState } from "react";
import { Delete, Search } from "lucide-react";
import {
  ATTENDANCE_PARTY_LABELS,
  checkInFamilyManually,
  defaultErrorMessage,
  FAMILY_BOOKING_STATUS_LABELS,
  isApiError,
  listScannerManualCandidates,
  useKeyedOperationKeys,
  type CheckInOutcome,
  type ManualCheckInCandidate,
} from "@/shared/api";

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const PHONE_LAST4_LENGTH = 4;

export interface ScannerManualPanelProps {
  /** 회차 잠금이 없으면 계약상 조회·처리가 모두 거부된다. */
  enabled: boolean;
  onOutcome: (outcome: CheckInOutcome) => void;
  /**
   * 수동 조회·검증·정원·처리 실패마다 정확히 한 번 호출 — 공용 결과음(오류)을 울린다.
   * 성공·중복 결과는 onOutcome(공용 패널)로만 가므로 오류음과 겹치지 않는다.
   * 인자를 받지 않는다: 연락처·예약 id 등 민감 값을 콜백으로 흘리지 않기 위함이다.
   */
  onError?: () => void;
}

const ink = {
  strong: "var(--gray-1)",
  muted: "rgba(248,250,252,0.62)",
  faint: "rgba(248,250,252,0.4)",
  border: "rgba(248,250,252,0.12)",
  card: "rgba(248,250,252,0.05)",
};

const keyStyle: React.CSSProperties = {
  height: 56,
  borderRadius: "var(--radius-md)",
  border: `1px solid ${ink.border}`,
  background: ink.card,
  color: ink.strong,
  fontFamily: "var(--font-display)",
  fontWeight: 800,
  fontSize: 20,
  cursor: "pointer",
};

export function ScannerManualPanel({ enabled, onOutcome, onError }: ScannerManualPanelProps) {
  const [last4, setLast4] = useState("");
  const [candidates, setCandidates] = useState<ManualCheckInCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entryKeys = useKeyedOperationKeys();

  const resetLookup = useCallback(() => {
    setCandidates([]);
    setHasSearched(false);
    setError(null);
  }, []);

  const appendDigit = useCallback(
    (digit: string) => {
      if (searching) return;
      setLast4((current) => (current.length >= PHONE_LAST4_LENGTH ? current : `${current}${digit}`));
      resetLookup();
    },
    [searching, resetLookup],
  );

  const deleteDigit = useCallback(() => {
    if (searching) return;
    setLast4((current) => current.slice(0, -1));
    resetLookup();
  }, [searching, resetLookup]);

  const search = useCallback(async () => {
    if (last4.length !== PHONE_LAST4_LENGTH) {
      setError("연락처 뒷자리 4자리를 입력해 주세요.");
      onError?.();
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const result = await listScannerManualCandidates(last4);
      setCandidates(result.items);
      setHasSearched(true);
    } catch (caught) {
      setCandidates([]);
      setHasSearched(true);
      setError(
        isApiError(caught) && caught.status === 409
          ? "회차를 먼저 선택해야 조회할 수 있어요."
          : defaultErrorMessage(caught),
      );
      onError?.();
    } finally {
      setSearching(false);
    }
  }, [last4, onError]);

  const enter = useCallback(
    async (candidate: ManualCheckInCandidate) => {
      const bookingId = candidate.familyBookingId;
      /**
       * 이 예약의 키 — 결과 미상 뒤 같은 후보를 다시 눌러도 서버가 리플레이한다.
       * mutation 을 보내기 **전에** 확보한다: 상한에 걸리면 아예 보내지 않아야 한다.
       */
      const lookup = entryKeys.keyFor(bookingId);

      if (!lookup.ok) {
        // 미확정 건이 가득 찼다 — 새 예약은 처리하지 않는다. 기존 미확정 건 재시도는 계속 가능하다.
        setError(
          "결과가 확인되지 않은 입장 처리가 많이 쌓여 새 예약을 처리할 수 없어요. 네트워크를 확인한 뒤 이미 시도한 예약을 다시 눌러 결과를 확정해 주세요.",
        );
        onError?.();
        return;
      }

      setEnteringId(bookingId);
      setError(null);

      try {
        const outcome = await checkInFamilyManually(bookingId, { idempotencyKey: lookup.key });
        entryKeys.settle(bookingId);
        onOutcome(outcome);
        // 처리된 예약은 목록에서 상태를 갱신한다.
        setCandidates((current) =>
          current.map((item) => (item.familyBookingId === bookingId ? { ...item, status: "CHECKED_IN" } : item)),
        );
      } catch (caught) {
        // 확정 4xx 면 키를 버리고, network·5xx 면 유지해 같은 후보 재시도가 리플레이되게 한다.
        entryKeys.settle(bookingId, caught);
        setError(`${defaultErrorMessage(caught)} 같은 예약을 다시 눌러 재시도할 수 있어요.`);
        onError?.();
      } finally {
        setEnteringId(null);
      }
    },
    [onOutcome, entryKeys, onError],
  );

  return (
    <section
      style={{
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${ink.border}`,
        background: ink.card,
        padding: 18,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, color: ink.strong }}>
        연락처로 입장
      </h2>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: ink.faint }}>학부모 연락처 뒷 4자리</p>

      {/* 입력된 자리 — 값이 바뀔 때만 낭독 */}
      <div
        aria-live="polite"
        aria-label="입력된 연락처 뒷자리"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, margin: "14px 0" }}
      >
        {Array.from({ length: PHONE_LAST4_LENGTH }).map((_, index) => (
          <span
            key={index}
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-md)",
              border: last4[index] ? "1.5px solid var(--mint-500)" : `1px solid ${ink.border}`,
              background: last4[index] ? "rgba(0,171,219,0.12)" : "transparent",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 22,
              color: last4[index] ? "var(--mint-400)" : ink.faint,
            }}
          >
            {last4[index] ?? ""}
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {DIGIT_KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={!enabled || searching || last4.length >= PHONE_LAST4_LENGTH}
            onClick={() => appendDigit(digit)}
            style={{ ...keyStyle, opacity: !enabled || last4.length >= PHONE_LAST4_LENGTH ? 0.5 : 1 }}
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          aria-label="한 자리 지우기"
          disabled={!enabled || searching || last4.length === 0}
          onClick={deleteDigit}
          style={{ ...keyStyle, fontSize: 14, opacity: !enabled || last4.length === 0 ? 0.5 : 1 }}
        >
          <Delete size={18} aria-hidden="true" />
        </button>

        <button
          type="button"
          disabled={!enabled || searching || last4.length >= PHONE_LAST4_LENGTH}
          onClick={() => appendDigit("0")}
          style={{ ...keyStyle, opacity: !enabled || last4.length >= PHONE_LAST4_LENGTH ? 0.5 : 1 }}
        >
          0
        </button>

        <button
          type="button"
          disabled={!enabled || searching || last4.length !== PHONE_LAST4_LENGTH}
          onClick={() => void search()}
          style={{
            ...keyStyle,
            background: "var(--violet-800)",
            border: "1px solid transparent",
            color: "var(--text-on-brand)",
            fontSize: 14,
            fontWeight: 700,
            opacity: !enabled || last4.length !== PHONE_LAST4_LENGTH ? 0.5 : 1,
          }}
        >
          {searching ? "조회 중" : <Search size={18} aria-hidden="true" />}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ margin: "12px 0 0", fontSize: 12.5, color: "#FCA5A5", lineHeight: 1.6 }}>
          {error}
        </p>
      )}

      <div aria-live="polite" style={{ marginTop: 14 }}>
        {hasSearched && !searching && candidates.length === 0 && !error && (
          <p style={{ margin: 0, fontSize: 12.5, color: ink.faint, textAlign: "center", padding: "18px 0" }}>
            조회된 예약이 없어요. 현장 접수로 안내해 주세요.
          </p>
        )}

        {candidates.map((candidate) => {
          // 계약 FamilyBookingStatus: RESERVED | CHECKED_IN | CANCELLED | NO_SHOW.
          // 입장 처리는 아직 입장하지 않은 유효 예약(RESERVED)만 대상이다.
          const enterable = candidate.status === "RESERVED";
          const busy = enteringId === candidate.familyBookingId;
          // 학생 스냅샷은 계약 필드(name/schoolName/grade)를 그대로 쓴다.
          const lead = candidate.students[0];
          const studentNames = candidate.students.map((student) => student.name).join(", ");
          const schoolLine = [lead?.schoolName, lead?.grade].filter(Boolean).join(" ");

          return (
            <div
              key={candidate.familyBookingId}
              style={{
                borderRadius: "var(--radius-md)",
                border: `1px solid ${ink.border}`,
                padding: 12,
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: ink.strong }}>{studentNames}</span>
                {/* 상태를 색이 아니라 문구로 함께 전달한다 */}
                <span style={{ fontSize: 11, fontWeight: 700, color: enterable ? "var(--mint-400)" : ink.faint }}>
                  {FAMILY_BOOKING_STATUS_LABELS[candidate.status]}
                </span>
              </div>

              {schoolLine && (
                <div style={{ fontSize: 11.5, color: ink.muted, marginTop: 3 }}>{schoolLine}</div>
              )}

              <div style={{ fontSize: 11.5, color: ink.muted, marginTop: 3 }}>
                {/* 스캐너 경로는 의도적으로 마스킹 유지 — 공용 태블릿에 전체 번호를 띄우지 않는다 */}
                {candidate.maskedContact} · {ATTENDANCE_PARTY_LABELS[candidate.attendanceParty]} ·{" "}
                {candidate.seatCount}석
              </div>

              <button
                type="button"
                disabled={!enabled || busy || !enterable}
                onClick={() => void enter(candidate)}
                style={{
                  marginTop: 10,
                  width: "100%",
                  height: 40,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid transparent",
                  background: enterable ? "var(--violet-800)" : "transparent",
                  color: enterable ? "var(--text-on-brand)" : ink.faint,
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "var(--font-body)",
                  cursor: enterable && enabled ? "pointer" : "not-allowed",
                }}
              >
                {busy
                  ? "처리 중..."
                  : enterable
                    ? "입장 처리"
                    : FAMILY_BOOKING_STATUS_LABELS[candidate.status]}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
