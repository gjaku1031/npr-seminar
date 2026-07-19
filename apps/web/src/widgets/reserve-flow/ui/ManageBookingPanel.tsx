"use client";

/**
 * 예약 조회 · 변경 · 취소 · QR 표시 · 만족도 설문.
 *
 * 두 인증 모드를 명시적으로 분리한다:
 * - `legacyProof`: 루트 예약 조회 + `/booking/{id}` OTP 호환. BOOKING_MANAGE proof 로 소유 예약을
 *   읽고, 첫 관리 변경이 proof 를 **소비**한다(이후 재인증 필요).
 * - `accessSession`: SMS 개인 링크(`/booking/access`) 교환으로 얻은 30분 관리 세션(HttpOnly 쿠키).
 *   OTP 화면 없이 대상 예약 하나만 GET 하고, 변경·취소해도 세션이 유지된다(재인증 안내 없음).
 *
 * QR 은 **현재 활성 QR 복구 GET**(`recoverOwnedFamilyBookingQr`)으로 즉시 표시한다 — 조회로
 * 버전이 바뀌지 않는다. 공개 QR 재발급/회전 API 는 계약에서 빠졌다 — 조회(복구 GET)만 쓴다.
 * 원문 QR 은 컴포넌트 메모리에만 둔다.
 * 취소 예약은 QR 대신 취소 상태를 보여 준다.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Calendar, Users } from "lucide-react";
import { ReservationQr } from "@/entities/reservation";
import { Badge, Button, KV } from "@/shared/ui";
import { fmtDateTime } from "@/shared/lib/format";
import { fmtPhone } from "@/shared/lib/phone";
import {
  ATTENDANCE_PARTY_LABELS,
  cancelPublicFamilyBooking,
  defaultErrorMessage,
  FAMILY_BOOKING_STATUS_LABELS,
  getPublicFamilyBooking,
  isAborted,
  isApiError,
  listOwnedFamilyBookings,
  recoverOwnedFamilyBookingQr,
  seatCountFor,
  updatePublicFamilyBooking,
  useOperationKey,
  type AttendanceParty,
  type FamilyBooking,
  type OwnedBookingMutationAuth,
  type OwnedBookingReadAuth,
  type PublicSeminarSession,
} from "@/shared/api";
import {
  attendancePartyOptions,
  attendancePartyUpdateRequest,
  manageErrorMessageForCode,
  moveTargetSessions,
  useBookingProof,
  useOtpFlow,
  type BookingProof,
} from "@/features/public-booking";
import { BottomBar, ErrorNote, FlowHeader, FlowOverlay, FlowToast } from "./MobileChrome";
import { OtpFields } from "./ReserveFlow";
import { SurveyPanel } from "./SurveyPanel";

type Stage = "auth" | "list" | "loading" | "detail" | "survey" | "expired";

export interface ManageBookingPanelProps {
  /** 공개 회차 목록 — 예약의 회차 메타를 붙일 때만 쓴다(없으면 지어내지 않는다). */
  sessions: PublicSeminarSession[];
  /**
   * 문자 링크(`/booking/{id}`)로 들어온 경우의 대상 예약 id — **legacy proof(OTP) 모드**.
   * 인증 뒤 이 id 하나만 범위 조회한다. id 는 조회 키일 뿐 권한이 아니다.
   */
  initialBookingId?: string;
  /**
   * SMS 개인 링크 교환 성공으로 세운 **관리 세션 모드**의 대상 예약 id.
   * 이 모드는 OTP 없이 쿠키 세션으로 바로 조회·변경한다.
   */
  accessSession?: { familyBookingId: string };
  onExit: () => void;
  onToast: (message: string) => void;
}

/** 관리 변경이 성공하면 legacy proof 가 소비된다 — 재인증 안내 문구. */
const REAUTH_NOTE = "보안을 위해 인증이 한 번만 사용돼요. 다른 작업을 하려면 다시 본인 인증을 해주세요.";

/** 세션 만료 안내(관리 세션 모드). */
const SESSION_EXPIRED_NOTE = "예약 관리 세션이 만료됐어요. 문자의 예약 링크를 다시 열어주세요.";

/** QR PNG 저장 파일명 — 예약 id·토큰·연락처·이름을 넣지 않는 고정 문구. */
const QR_DOWNLOAD_BASENAME = "npr-admission-qr";

/** 현재 QR 복구 상태 — 로딩/표시/불가(폐기·만료)/취소/오류를 서로 다른 상태로 구분한다. */
type QrState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; token: string }
  /** QR 이 폐기·만료됨(409/410) 또는 활성 QR 이 없음 — 재발급이 아니라 상태만 알린다. */
  | { kind: "unavailable" }
  /** 예약이 취소돼 QR 이 없음. */
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export function ManageBookingPanel({
  sessions,
  initialBookingId,
  accessSession,
  onExit,
  onToast,
}: ManageBookingPanelProps) {
  const accessMode = accessSession !== undefined;
  const directMode = initialBookingId !== undefined;
  const accessBookingId = accessSession?.familyBookingId ?? null;

  const [stage, setStage] = useState<Stage>(accessMode ? "loading" : "auth");
  const [bookings, setBookings] = useState<FamilyBooking[]>([]);
  const [selected, setSelected] = useState<FamilyBooking | null>(null);
  const [authTarget, setAuthTarget] = useState<string | null>(initialBookingId ?? null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [qr, setQr] = useState<QrState>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);

  const proof = useBookingProof();
  const moveKey = useOperationKey();
  const partyKey = useOperationKey();
  const cancelKey = useOperationKey();

  const sessionOf = useCallback(
    (booking: FamilyBooking) =>
      sessions.find((s) => s.seminarSessionId === booking.seminarSessionId) ?? null,
    [sessions],
  );

  /** 관리 세션 모드는 쿠키가 자격이라 proof 헤더를 붙이지 않는다. legacy 는 proof 를 헤더로 싣는다. */
  const mutationAuth = useCallback(
    (idempotencyKey: string): OwnedBookingMutationAuth =>
      accessMode
        ? { session: "management", idempotencyKey }
        : { bookingProof: proof.proof?.value ?? "", idempotencyKey },
    [accessMode, proof.proof],
  );

  /** 현재 활성 QR 복구 — 취소/폐기/만료를 서로 다른 상태로 구분한다. 조회로 버전이 바뀌지 않는다. */
  const loadQr = useCallback(
    async (booking: FamilyBooking, auth: OwnedBookingReadAuth) => {
      if (booking.status === "CANCELLED") {
        setQr({ kind: "cancelled" });
        return;
      }
      if (booking.qrStatus !== "ACTIVE") {
        setQr({ kind: "unavailable" });
        return;
      }
      setQr({ kind: "loading" });
      try {
        const recovered = await recoverOwnedFamilyBookingQr(booking.familyBookingId, auth);
        setQr({ kind: "ready", token: recovered.qrToken });
      } catch (caught) {
        if (isAborted(caught)) return;
        if (isApiError(caught) && (caught.status === 409 || caught.status === 410)) {
          setQr({ kind: "unavailable" });
        } else if (accessMode && isApiError(caught) && (caught.status === 401 || caught.status === 403)) {
          setStage("expired");
        } else {
          setQr({ kind: "error", message: defaultErrorMessage(caught) });
        }
      }
    },
    [accessMode],
  );

  /* ── 관리 세션 모드: 마운트 시 대상 예약 하나 GET + 현재 QR 복구 ── */
  useEffect(() => {
    if (!accessMode || accessBookingId === null) return;
    const controller = new AbortController();

    void (async () => {
      setBusy(true);
      setListError(null);
      try {
        const booking = await getPublicFamilyBooking(accessBookingId, {
          session: "management",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setSelected(booking);
        setStage("detail");
        await loadQr(booking, { session: "management" });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        if (isApiError(caught) && (caught.status === 401 || caught.status === 403)) {
          setStage("expired");
        } else {
          setListError(defaultErrorMessage(caught));
          setStage("expired");
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();

    return () => controller.abort();
  }, [accessMode, accessBookingId, loadQr]);

  /* ── legacy proof: 소유 예약 전체 조회 ── */
  const loadOwned = useCallback(async (issued: BookingProof) => {
    setListError(null);
    try {
      const list = await listOwnedFamilyBookings({ bookingProof: issued.value });
      setBookings(list.items);
      setStage("list");
    } catch (caught) {
      setListError(defaultErrorMessage(caught));
      setStage("list");
    }
  }, []);

  /** legacy proof: 대상 예약 하나만 범위 조회 + QR 복구. */
  const loadOne = useCallback(
    async (issued: BookingProof, bookingId: string) => {
      setListError(null);
      setActionError(null);
      try {
        const found = await getPublicFamilyBooking(bookingId, { bookingProof: issued.value });
        setSelected(found);
        setStage("detail");
        await loadQr(found, { bookingProof: issued.value });
      } catch (caught) {
        setListError(
          isApiError(caught) && (caught.status === 403 || caught.status === 404)
            ? "이 예약을 찾을 수 없거나 조회 권한이 없어요. 예약하신 연락처가 맞는지 확인해 주세요."
            : defaultErrorMessage(caught),
        );
        setStage("auth");
      }
    },
    [loadQr],
  );

  const otp = useOtpFlow({
    purpose: "BOOKING_MANAGE",
    onVerified: (issued) => {
      proof.adopt(issued);
      if (authTarget) void loadOne(issued, authTarget);
      else void loadOwned(issued);
    },
  });

  /** legacy: 소비된 proof 를 되살릴 수 없다 — 같은 대상을 유지한 채 인증만 다시 받는다. */
  const restartAuth = useCallback(() => {
    proof.clear();
    otp.restart();
    setActionError(null);
    setStage("auth");
  }, [proof, otp]);

  /** 관리 변경 성공 후 공통 처리. legacy 만 proof 를 소비한다(재인증 요구). access 는 세션 유지. */
  const afterMutation = useCallback(
    (updated: FamilyBooking, message: string) => {
      if (!accessMode) proof.consume();
      setSelected(updated);
      setBookings((current) =>
        current.map((b) => (b.familyBookingId === updated.familyBookingId ? updated : b)),
      );
      setToast(message);
      onToast(message);
    },
    [accessMode, proof, onToast],
  );

  /** 변경·취소 실패 — 관리 세션 만료는 재열기 안내로 분기한다. */
  const handleActionError = useCallback(
    (caught: unknown) => {
      if (accessMode && isApiError(caught) && (caught.status === 401 || caught.status === 403)) {
        setStage("expired");
        return;
      }
      setActionError(manageErrorMessage(caught));
    },
    [accessMode],
  );

  const move = useCallback(
    async (targetSessionId: string) => {
      if (!selected) return;
      if (!accessMode && proof.proof === null) return;
      setBusy(true);
      setActionError(null);
      try {
        const updated = await updatePublicFamilyBooking(
          selected.familyBookingId,
          { seminarSessionId: targetSessionId, expectedVersion: selected.version },
          mutationAuth(moveKey.current()),
        );
        moveKey.settle();
        setChangeOpen(false);
        afterMutation(updated, "예약 회차를 변경했어요 — QR은 그대로예요");
      } catch (caught) {
        moveKey.settle(caught);
        handleActionError(caught);
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, accessMode, proof.proof, moveKey, afterMutation, mutationAuth],
  );

  /**
   * 참석 학부모(모·부·모/부) 변경 — 회차 이동과 **별개 동선**이다.
   * move 와 동일한 안전 규칙을 쓴다: 멱등키·CSRF(client)·expectedVersion·access cookie/legacy proof.
   * 성공 시 예약과 QR 은 유지되고 상세의 참석자·seatCount 만 갱신된다.
   */
  const changeParty = useCallback(
    async (targetParty: AttendanceParty) => {
      if (!selected) return;
      if (!accessMode && proof.proof === null) return;
      // 같은 값이면 durable 변경을 만들지 않는다(불필요한 proof 소비·버전 충돌 방지).
      if (targetParty === selected.attendanceParty) {
        setPartyOpen(false);
        return;
      }
      setBusy(true);
      setActionError(null);
      try {
        const updated = await updatePublicFamilyBooking(
          selected.familyBookingId,
          attendancePartyUpdateRequest(targetParty, selected.version),
          mutationAuth(partyKey.current()),
        );
        partyKey.settle();
        setPartyOpen(false);
        afterMutation(updated, "참석 학부모를 변경했어요 — QR은 그대로예요");
      } catch (caught) {
        partyKey.settle(caught);
        handleActionError(caught);
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, accessMode, proof.proof, partyKey, afterMutation, mutationAuth],
  );

  const cancel = useCallback(
    async () => {
      if (!selected) return;
      if (!accessMode && proof.proof === null) return;
      setBusy(true);
      setActionError(null);
      try {
        const updated = await cancelPublicFamilyBooking(
          selected.familyBookingId,
          selected.version,
          mutationAuth(cancelKey.current()),
        );
        cancelKey.settle();
        setCancelOpen(false);
        setQr({ kind: "cancelled" });
        afterMutation(updated, "예약을 취소했어요");
      } catch (caught) {
        cancelKey.settle(caught);
        handleActionError(caught);
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, accessMode, proof.proof, cancelKey, afterMutation, mutationAuth],
  );

  /* ── 세션 만료(관리 세션 모드) ── */
  if (stage === "expired")
    return (
      <div data-screen-label="모바일 — 예약 링크 만료" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader title="예약 관리" />
        <div style={{ padding: "40px 22px", textAlign: "center" }}>
          <p role="alert" style={{ fontSize: 14, color: "var(--text-body)", lineHeight: 1.7 }}>
            {listError ?? SESSION_EXPIRED_NOTE}
          </p>
          <Button variant="secondary" onClick={onExit} style={{ marginTop: 18 }}>
            처음으로
          </Button>
        </div>
        <FlowToast message={toast} />
      </div>
    );

  /* ── 관리 세션 로딩 ── */
  if (stage === "loading")
    return (
      <div data-screen-label="모바일 — 예약 불러오는 중" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader title="예약 관리" />
        <p style={{ padding: "40px 22px", textAlign: "center", fontSize: 13.5, color: "var(--text-faint)" }}>
          예약을 불러오는 중이에요.
        </p>
        <FlowToast message={toast} />
      </div>
    );

  /* ── 본인 확인 (legacy OTP) ── */
  if (stage === "auth")
    return (
      <div data-screen-label="모바일 — 예약 조회" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={onExit} title="예약 조회" />
        <div style={{ padding: "14px 18px 30px" }}>
          <div style={{ padding: "8px 4px 16px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>
              {directMode ? "본인 확인이 필요해요" : "예약을 조회해요"}
            </h2>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>
              {directMode ? (
                <>링크만으로는 예약 내용을 보여드릴 수 없어요. 예약하신 <b>학부모 연락처</b>로 본인 확인을 해주세요.</>
              ) : (
                <>예약하신 <b>학부모 연락처</b>로 본인 확인을 하면 예약 내역이 나와요.</>
              )}
            </p>
          </div>
          <OtpFields otp={otp} hint="예약할 때 사용한 학부모 연락처를 입력해 주세요." />
          <ErrorNote message={listError} />
        </div>
        <FlowToast message={toast} />
      </div>
    );

  /* ── 소유 예약 목록 (legacy) ── */
  if (stage === "list")
    return (
      <div data-screen-label="모바일 — 예약 목록" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={onExit} title="내 예약" />
        <div style={{ padding: "14px 18px 30px" }}>
          <ErrorNote message={listError} />

          {!listError && bookings.length === 0 && (
            <p style={{ padding: "28px 4px", fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, textAlign: "center" }}>
              이 연락처로 등록된 예약이 없어요.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bookings.map((b, i) => {
              const s = sessionOf(b);
              return (
                <button
                  key={b.familyBookingId}
                  type="button"
                  onClick={() => {
                    setSelected(b);
                    setAuthTarget(b.familyBookingId);
                    setActionError(null);
                    setStage("detail");
                    if (proof.proof) void loadQr(b, { bookingProof: proof.proof.value });
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "var(--font-body)", animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 60}ms both` }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 800, fontSize: 14.5, color: "var(--text-strong)" }}>
                      {b.students.map((x) => x.name).join(", ")}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s ? `${s.seminarTitle} · ${fmtDateTime(new Date(s.startsAt))}` : "설명회 정보는 예약 상세에서 확인해 주세요"}
                    </span>
                  </span>
                  <Badge tone={b.status === "RESERVED" ? "accent" : "neutral"} size="sm">
                    {FAMILY_BOOKING_STATUS_LABELS[b.status]}
                  </Badge>
                  <ArrowRight size={15} aria-hidden="true" style={{ color: "var(--violet-800)", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
        <FlowToast message={toast} />
      </div>
    );

  if (!selected) return null;

  /* ── 만족도 설문 (legacy proof 전용) ── */
  if (stage === "survey" && !accessMode)
    return (
      <SurveyPanel
        booking={selected}
        proof={proof.proof}
        onBack={() => setStage("detail")}
        onConsumed={proof.consume}
        onDone={(message) => { setStage("detail"); setToast(message); onToast(message); }}
      />
    );

  /* ── 예약 상세 · 관리 ── */
  const detailSession = sessionOf(selected);
  // 회차 이동 후보는 정책 모듈에서 판정한다 — GUEST 예약은 guestBookingEnabled 회차만 대상이 된다
  // (백엔드 GUEST_BOOKING_DISABLED 거절을 UI 경계에서 막는다). ENROLLED 예약은 플래그 영향 없음.
  const movable = moveTargetSessions(sessions, selected);
  const manageable = selected.status === "RESERVED";
  // legacy 만 proof 소비 후 재인증이 필요하다. access 세션은 유지된다.
  const reauthNeeded = !accessMode && !proof.isUsable;
  const surveyEligible = !accessMode && selected.status === "CHECKED_IN";
  const controlsDisabled = reauthNeeded || busy;

  return (
    <div data-screen-label="모바일 — 예약 관리" style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
      <FlowHeader
        back={accessMode || directMode ? undefined : () => { setAuthTarget(null); setStage("list"); }}
        title="내 예약"
      />
      <div style={{ flex: 1, padding: "14px 18px 130px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 340, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: "var(--shadow-raised)", overflow: "hidden" }}>
          <div style={{ background: "var(--surface-brand)", color: "var(--text-on-brand)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: "var(--tracking-caps)", color: "var(--mint-400)", fontWeight: 700 }}>NPR ADMISSION QR</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, marginTop: 4, lineHeight: 1.35 }}>
                {detailSession?.seminarTitle ?? "예약 상세"}
              </div>
            </div>
            <Badge tone={manageable ? "accent" : "neutral"} size="sm">
              {FAMILY_BOOKING_STATUS_LABELS[selected.status]}
            </Badge>
          </div>

          <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
            <QrArea qr={qr} bookingId={selected.familyBookingId} status={FAMILY_BOOKING_STATUS_LABELS[selected.status]} />

            <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%" }}>
              <KV k="참가자" v={selected.students.map((s) => s.name).join(", ")} />
              <KV k="참석 학부모" v={`${ATTENDANCE_PARTY_LABELS[selected.attendanceParty]} · ${selected.seatCount}석`} />
              {detailSession && <KV k="일시" v={`${fmtDateTime(new Date(detailSession.startsAt))} · ${detailSession.location}`} />}
              <KV k="연락처" v={fmtPhone(selected.contact)} />
            </div>
          </div>
        </div>

        <ErrorNote message={actionError} />

        {/* legacy: proof 소비 후 같은 예약으로 재인증하는 길을 명시적으로 준다. */}
        {reauthNeeded && (
          <div style={{ marginTop: 16, width: "100%", maxWidth: 340, padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-accent-soft)" }}>
            <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 12.5, color: "var(--mint-700)", lineHeight: 1.6, textAlign: "center" }}>
              {REAUTH_NOTE}
            </p>
            <Button fullWidth onClick={restartAuth} style={{ marginTop: 12 }}>
              다시 본인 인증
            </Button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18, width: "100%", maxWidth: 340 }}>
          {manageable && (
            <>
              <Button variant="secondary" fullWidth disabled={controlsDisabled} icon={<Calendar size={15} aria-hidden="true" />} onClick={() => setChangeOpen(true)}>
                회차 변경
              </Button>
              <Button variant="secondary" fullWidth disabled={controlsDisabled} icon={<Users size={15} aria-hidden="true" />} onClick={() => setPartyOpen(true)}>
                참석 학부모 변경
              </Button>
              <Button variant="danger" fullWidth disabled={controlsDisabled} onClick={() => setCancelOpen(true)}>
                예약 취소
              </Button>
            </>
          )}
          {surveyEligible && (
            <Button variant="ghost" fullWidth disabled={controlsDisabled} onClick={() => setStage("survey")}>
              만족도 설문 참여
            </Button>
          )}
        </div>
      </div>

      {changeOpen && (
        <FlowOverlay onDismiss={() => setChangeOpen(false)} align="bottom">
          <div style={{ width: "100%", background: "var(--surface-page)", borderRadius: "22px 22px 0 0", padding: "10px 18px calc(26px + env(safe-area-inset-bottom))", animation: "ds-sheet-up var(--dur-base) var(--ease-spring) both" }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--gray-3)", margin: "6px auto 14px" }} />
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>다른 설명회로 변경</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 12 }}>QR은 그대로 유지돼요.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {movable.length === 0 && (
                <p style={{ padding: "20px 10px", textAlign: "center", fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
                  변경 가능한 다른 설명회가 없어요.
                  <br />
                  이번 설명회는 단일 회차로 진행돼요.
                </p>
              )}
              {movable.map((s) => (
                <button
                  key={s.seminarSessionId}
                  type="button"
                  disabled={busy}
                  onClick={() => void move(s.seminarSessionId)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", cursor: "pointer", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", textAlign: "left", width: "100%", fontFamily: "var(--font-body)" }}
                >
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "var(--text-strong)" }}>{s.seminarTitle}</span>
                    {/* 잔여석 숫자는 숨긴다 — 일시만 보여 준다(가능 여부 필터는 유지). */}
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
                      {fmtDateTime(new Date(s.startsAt))}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </FlowOverlay>
      )}

      {partyOpen && (
        <FlowOverlay onDismiss={() => setPartyOpen(false)} align="bottom">
          <div style={{ width: "100%", background: "var(--surface-page)", borderRadius: "22px 22px 0 0", padding: "10px 18px calc(26px + env(safe-area-inset-bottom))", animation: "ds-sheet-up var(--dur-base) var(--ease-spring) both" }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--gray-3)", margin: "6px auto 14px" }} />
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>참석 학부모 변경</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 12 }}>
              예약과 QR은 그대로 유지되고, 참석 인원(좌석 수)만 바뀌어요.
            </p>
            <div role="radiogroup" aria-label="참석 학부모" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {attendancePartyOptions(selected.attendanceParty).map(({ party, current }) => {
                const seats = seatCountFor(party);
                return (
                  <button
                    key={party}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    disabled={busy || current}
                    onClick={() => void changeParty(party)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", cursor: current || busy ? "default" : "pointer", background: "var(--surface-card)", border: current ? "1px solid var(--border-strong)" : "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", textAlign: "left", width: "100%", fontFamily: "var(--font-body)" }}
                  >
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "var(--text-strong)" }}>
                        {ATTENDANCE_PARTY_LABELS[party]} 참석
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
                        {seats}석
                      </span>
                    </span>
                    {current && <Badge tone="neutral" size="sm">현재</Badge>}
                  </button>
                );
              })}
            </div>
          </div>
        </FlowOverlay>
      )}

      {cancelOpen && (
        <FlowOverlay onDismiss={() => setCancelOpen(false)}>
          <div role="alertdialog" aria-modal="true" aria-label="예약 취소 확인" style={{ width: "100%", maxWidth: 320, background: "var(--surface-card)", borderRadius: "var(--radius-lg)", padding: "22px 22px 18px", boxShadow: "var(--shadow-raised)" }}>
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>예약을 취소할까요?</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.55 }}>
              {selected.students.map((s) => s.name).join(", ")} 예약을 취소해요. 취소하면 QR도 함께 무효가 돼요.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <Button variant="ghost" fullWidth onClick={() => setCancelOpen(false)}>돌아가기</Button>
              <Button variant="danger" fullWidth onClick={() => void cancel()} disabled={busy}>
                {busy ? "취소 중…" : "취소하기"}
              </Button>
            </div>
          </div>
        </FlowOverlay>
      )}

      <BottomBar>
        <Button variant="secondary" size="lg" fullWidth onClick={onExit}>
          처음으로
        </Button>
      </BottomBar>
      <FlowToast message={toast} />
    </div>
  );
}

/** QR 영역 — 복구 상태(로딩/표시/불가/취소/오류)를 서로 다르게 보여 준다. */
function QrArea({ qr, bookingId, status }: { qr: QrState; bookingId: string; status: string }) {
  if (qr.kind === "ready") {
    return <ReservationQr qrToken={qr.token} downloadName={QR_DOWNLOAD_BASENAME} familyBookingId={bookingId} />;
  }

  const note = (message: string, tone: "muted" | "warning" = "muted") => (
    <p style={{ margin: 0, padding: "18px 14px", borderRadius: "var(--radius-md)", background: tone === "warning" ? "var(--status-warning-soft)" : "var(--surface-sunken)", color: tone === "warning" ? "var(--status-warning)" : "var(--text-muted)", fontSize: 12.5, lineHeight: 1.6, textAlign: "center", width: "100%", boxSizing: "border-box" }}>
      {message}
    </p>
  );

  switch (qr.kind) {
    case "loading":
      return note("QR을 불러오는 중이에요.");
    case "cancelled":
      return note(`취소된 예약이에요 (${status}). 입장 QR은 더 이상 사용할 수 없어요.`, "warning");
    case "unavailable":
      return note("이 예약의 활성 QR이 없어요. 예약이 취소되었거나 QR이 만료됐어요.", "warning");
    case "error":
      return note(qr.message, "warning");
    default:
      return note("QR을 불러오는 중이에요.");
  }
}

function manageErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  // 정확한 도메인 code 를 HTTP status 폴백보다 먼저 본다.
  const byCode = manageErrorMessageForCode(error.code);
  if (byCode !== null) return byCode;
  switch (error.status) {
    case 401:
    case 403:
      return "인증이 만료되었거나 이미 사용됐어요. 인증번호를 다시 받아 주세요.";
    case 404:
      return "예약을 찾을 수 없어요.";
    case 409:
      return "이미 입장했거나 다른 곳에서 먼저 변경된 예약이에요. 다시 조회해 주세요.";
    case 422:
      return "선택한 회차가 참가자 캠퍼스와 맞지 않아요.";
    default:
      return defaultErrorMessage(error);
  }
}
