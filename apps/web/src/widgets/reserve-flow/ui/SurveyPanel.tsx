"use client";

/**
 * 만족도 설문 (명세 §10.9) — 계약 POST /public/family-bookings/{id}/survey-response.
 *
 * 정직성 규칙:
 * - 사진 **바이트는 이 계약이 업로드하지 않는다**. photoAttached + basename 만 기록한다.
 *   파일을 고르면 그 사실을 화면에 그대로 말한다 — 업로드된 척하지 않는다.
 * - 201 을 받아야만 완료 화면을 보여준다.
 * - 자격(미입장·미종료)·중복은 서버 판정을 그대로 한국어로 옮긴다.
 */

import { useCallback, useRef, useState } from "react";
import { Check, Image as ImageIcon, Star } from "lucide-react";
import { Button } from "@/shared/ui";
import {
  defaultErrorMessage,
  isApiError,
  submitFamilyBookingSurveyResponse,
  useOperationKey,
  type FamilyBooking,
} from "@/shared/api";
import type { BookingProof } from "@/features/public-booking";
import { BottomBar, ErrorNote, FlowHeader } from "./MobileChrome";

const RATING_LABELS = ["", "아쉬워요", "보통이에요", "괜찮아요", "좋았어요", "매우 좋았어요"];

export interface SurveyPanelProps {
  booking: FamilyBooking;
  proof: BookingProof | null;
  onBack: () => void;
  /** 설문 제출이 성공하면 계약상 proof 가 소비된다. */
  onConsumed: () => void;
  onDone: (message: string) => void;
}

export function SurveyPanel({ booking, proof, onBack, onConsumed, onDone }: SurveyPanelProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const submitKey = useOperationKey();

  const submit = useCallback(async () => {
    if (!proof || rating < 1) return;
    setBusy(true);
    setError(null);

    try {
      const result = await submitFamilyBookingSurveyResponse(
        booking.familyBookingId,
        {
          rating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          // 계약 allOf: attached=true 면 basename 필수, false 면 photoName 은 null.
          photoAttached: photoName !== null,
          photoName: photoName,
        },
        { bookingProof: proof.value, idempotencyKey: submitKey.current() },
      );

      submitKey.settle();
      onConsumed();
      setDone(true);
      onDone(result.replayed ? "설문이 이미 접수돼 있어요" : "설문을 보내주셔서 감사해요");
    } catch (caught) {
      submitKey.settle(caught);
      setError(surveyErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [proof, rating, comment, photoName, booking.familyBookingId, submitKey, onConsumed, onDone]);

  if (done)
    return (
      <div data-screen-label="모바일 — 설문 완료" style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
        <FlowHeader title="설문 완료" />
        <div style={{ flex: 1, padding: "40px 22px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--mint-500)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", animation: "ds-pop var(--dur-hero) var(--ease-spring) both" }}>
            <Check size={26} strokeWidth={2.6} aria-hidden="true" />
          </span>
          <h2 role="status" aria-live="polite" style={{ fontSize: 22, fontWeight: 800, marginTop: 16 }}>
            소중한 의견 감사해요
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
            보내주신 의견은 다음 설명회를
            <br />더 잘 준비하는 데 큰 도움이 돼요.
          </p>
          <Button onClick={onBack} style={{ marginTop: 26 }}>돌아가기</Button>
        </div>
      </div>
    );

  return (
    <div data-screen-label="모바일 — 만족도 설문" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
      <FlowHeader back={onBack} title="만족도 설문" />
      <div style={{ padding: "14px 18px 130px", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ padding: "4px 2px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35 }}>설명회는 어떠셨나요?</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>잠시면 돼요. 예약당 한 번만 보낼 수 있어요.</p>
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
            rows={4}
            placeholder="좋았던 점, 아쉬웠던 점을 자유롭게 적어 주세요"
            style={{ width: "100%", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--text-strong)", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>
            현장 사진 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(선택)</span>
          </span>
          {/* 파일 바이트는 전송하지 않는다 — 계약은 basename 메타데이터만 받는다. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              // 경로 구분자 없는 basename 만 (계약 pattern).
              setPhotoName(file ? file.name.split(/[\\/]/).pop() ?? null : null);
            }}
          />
          <button
            type="button"
            onClick={() => (photoName ? setPhotoName(null) : fileRef.current?.click())}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", border: photoName ? "1.5px solid var(--mint-500)" : "1px dashed var(--border-soft)", background: photoName ? "var(--surface-accent-soft)" : "var(--surface-card)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)", width: "100%" }}
          >
            <span style={{ width: 38, height: 38, borderRadius: "var(--radius-sm)", background: photoName ? "var(--mint-500)" : "var(--surface-sunken)", color: photoName ? "#fff" : "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ImageIcon size={18} aria-hidden="true" />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: photoName ? "var(--mint-700)" : "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {photoName ?? "사진 선택하기"}
              </span>
              <span style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginTop: 2, lineHeight: 1.5 }}>
                {photoName
                  ? "파일 이름만 함께 보내요 — 사진 파일 자체는 아직 업로드되지 않아요. 탭하면 취소돼요."
                  : "지금은 파일 이름만 기록돼요"}
              </span>
            </span>
          </button>
        </div>

        <ErrorNote message={error} />
      </div>

      <BottomBar>
        <Button size="lg" fullWidth disabled={rating < 1 || busy || !proof} onClick={() => void submit()}>
          {busy ? "제출 중…" : "설문 제출하기"}
        </Button>
      </BottomBar>
    </div>
  );
}

function surveyErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  switch (error.status) {
    case 401:
    case 403:
      return "인증이 만료되었거나 이미 사용됐어요. 인증번호를 다시 받아 주세요.";
    case 409:
      return "이 예약은 이미 설문을 보내셨어요.";
    case 422:
      return "아직 설문에 참여할 수 없어요. 설명회 입장 후 또는 종료 후에 가능해요.";
    case 429:
      return "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}
