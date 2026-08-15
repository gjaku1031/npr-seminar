"use client";

/**
 * 만족도 설문 (명세 §10.9) — 계약 POST /public/family-bookings/{id}/survey-response.
 *
 * 정직성 규칙:
 * - 201 을 받아야만 완료 화면을 보여준다.
 * - 자격(미입장·미종료)·중복은 서버 판정을 그대로 한국어로 옮긴다.
 */

import { useCallback, useState } from "react";
import { Check, Star } from "lucide-react";
import { Button } from "@/shared/ui";
import { submitFamilyBookingSurveyResponse, useKeyedOperationIntents } from "@/shared/api";
import { BottomBar, ErrorNote, FlowHeader } from "./MobileChrome";
import { surveyErrorMessage } from "./survey-error-message";

const RATING_LABELS = ["", "아쉬워요", "보통이에요", "괜찮아요", "좋았어요", "매우 좋았어요"];

interface SurveyIntent {
  familyBookingId: string;
  bookingProof: string;
  rating: number;
  comment?: string;
}

export interface SurveyPanelProps {
  familyBookingId: string;
  /**
   * 사용 가능한 BOOKING_MANAGE proof 값 — 이 화면에 들어온 시점에 부모가 이미 확보해 넘긴다.
   * ★ 관리 세션(쿠키)으로는 설문을 제출할 수 없다 — 언제나 proof 로만 인증한다.
   */
  bookingProof: string;
  onBack: () => void;
  /** 설문 제출이 성공하면 계약상 proof 가 소비된다 — 부모가 즉시 버린다. */
  onConsumed: () => void;
  onDone: (message: string) => void;
}

export function SurveyPanel({ familyBookingId, bookingProof, onBack, onConsumed, onDone }: SurveyPanelProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [hasRetainedIntent, setHasRetainedIntent] = useState(false);
  const submitIntents = useKeyedOperationIntents<SurveyIntent>(1);
  const intentTarget = `survey:${familyBookingId}`;

  const submit = useCallback(async () => {
    if (!bookingProof || rating < 1) return;

    const operation = submitIntents.begin(intentTarget, {
      familyBookingId,
      bookingProof,
      rating,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    });
    if (!operation.ok) {
      const retained = submitIntents.retained(intentTarget);
      if (retained !== null) {
        setRating(retained.rating);
        setComment(retained.comment ?? "");
        setHasRetainedIntent(true);
      }
      setError(
        operation.reason === "diverged"
          ? "직전 설문 요청의 결과를 확인하지 못했습니다. 이전 내용으로 되돌렸습니다. 같은 요청을 다시 시도해 주세요."
          : "결과를 확인하지 못한 설문 요청이 남아 있습니다. 같은 요청을 다시 시도해 주세요.",
      );
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const intent = operation.intent;
      const result = await submitFamilyBookingSurveyResponse(
        intent.familyBookingId,
        {
          rating: intent.rating,
          ...(intent.comment ? { comment: intent.comment } : {}),
        },
        { bookingProof: intent.bookingProof, idempotencyKey: operation.key },
      );

      submitIntents.settle(intentTarget);
      setHasRetainedIntent(false);
      onConsumed();
      setDone(true);
      onDone(result.replayed ? "설문이 이미 접수돼 있습니다." : "설문을 보내주셔서 감사합니다.");
    } catch (caught) {
      submitIntents.settle(intentTarget, caught);
      const retained = submitIntents.retained(intentTarget);
      if (retained !== null) {
        setRating(retained.rating);
        setComment(retained.comment ?? "");
        setHasRetainedIntent(true);
        setError("직전 설문 요청의 결과를 확인하지 못했습니다. 내용을 그대로 두고 다시 시도해 주세요.");
      } else {
        setHasRetainedIntent(false);
        setError(surveyErrorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  }, [bookingProof, rating, comment, familyBookingId, submitIntents, intentTarget, onConsumed, onDone]);

  const back = useCallback(() => {
    if (hasRetainedIntent) {
      setError("직전 설문 요청의 결과를 먼저 확인해야 합니다. 같은 요청을 다시 시도해 주세요.");
      return;
    }
    onBack();
  }, [hasRetainedIntent, onBack]);

  if (done)
    return (
      <div data-screen-label="모바일 — 설문 완료" style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
        <FlowHeader title="설문 완료" />
        <div style={{ flex: 1, padding: "40px 22px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--mint-500)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", animation: "ds-pop var(--dur-hero) var(--ease-spring) both" }}>
            <Check size={26} strokeWidth={2.6} aria-hidden="true" />
          </span>
          <h2 role="status" aria-live="polite" style={{ fontSize: 22, fontWeight: 800, marginTop: 16 }}>
            소중한 의견 감사합니다
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
            보내주신 의견은 다음 설명회를
            <br />더 잘 준비하는 데 큰 도움이 됩니다.
          </p>
          <Button onClick={back} style={{ marginTop: 26 }}>돌아가기</Button>
        </div>
      </div>
    );

  return (
    <div data-screen-label="모바일 — 만족도 설문" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
      <FlowHeader back={back} title="만족도 설문" />
      <div style={{ padding: "14px 18px 130px", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ padding: "4px 2px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35 }}>설명회는 어떠셨나요?</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>잠시면 됩니다. 예약당 한 번만 보내실 수 있습니다.</p>
        </div>

        <fieldset style={{ border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: "var(--shadow-card)", padding: "18px 0", margin: 0, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <legend style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)", padding: "0 8px" }}>전반적인 만족도</legend>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n}점 ${RATING_LABELS[n]}`}
                aria-pressed={rating === n}
                disabled={busy || hasRetainedIntent}
                onClick={() => setRating(n)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, transition: "transform var(--dur-fast) var(--ease-spring)", transform: rating === n ? "scale(1.15)" : "scale(1)" }}
              >
                <Star
                  size={34}
                  aria-hidden="true"
                  fill={n <= rating ? "var(--mint-500)" : "none"}
                  color={n <= rating ? "var(--mint-500)" : "var(--gray-3)"}
                />
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--text-faint)", minHeight: 16 }}>
            {rating ? RATING_LABELS[rating] : "별을 탭해 주세요"}
          </span>
        </fieldset>

        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>
            후기 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(선택)</span>
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 2000))}
            disabled={busy || hasRetainedIntent}
            rows={4}
            placeholder="좋았던 점, 아쉬웠던 점을 자유롭게 적어 주세요"
            style={{ width: "100%", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--text-strong)", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
        </label>

        <ErrorNote message={error} />
      </div>

      <BottomBar>
        <Button size="lg" fullWidth disabled={rating < 1 || busy} onClick={() => void submit()}>
          {busy ? "제출 중…" : hasRetainedIntent ? "직전 요청 그대로 다시 시도" : "설문 제출하기"}
        </Button>
      </BottomBar>
    </div>
  );
}
