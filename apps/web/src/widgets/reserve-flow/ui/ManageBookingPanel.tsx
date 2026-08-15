"use client";

/**
 * 예약 조회 · 변경 · 취소 · QR 표시 · 만족도 설문 — 세 진입 모드가 한 패널을 공유한다.
 *
 * - `lookup`  (루트 `/reserve?mode=manage`): 전체 연락처 **조회**로 마스킹 목록을 받는다(OTP·proof·
 *   쿠키 없음). 목록에서 예약 하나를 고르면 그 예약에 한해 이미 메모리에 있는 전체 연락처로
 *   **읽기 세션**(`read-session`, 쿠키)을 세워 마스킹 상세와 현재 QR 을 복구한다. 그 세션은 읽기
 *   전용이라 변경·취소·설문에는 절대 쓰이지 않는다 — 언제나 새 BOOKING_MANAGE proof 가 필요하다.
 * - `direct`  (문자 링크 `/booking/{id}`): 최초 BOOKING_MANAGE OTP 로 읽기 proof 를 얻어 이 예약
 *   하나만 상세 조회하고 현재 QR 을 복구한다. 그 읽기 proof 는 **첫 변경**에 쓸 수 있고, 한 번
 *   성공하면 소비돼 다음 작업엔 새 OTP 가 필요하다.
 * - `access` (SMS 개인 링크 교환 세션): 쿠키 세션으로 마스킹 상세 GET·QR 복구만 한다.
 *   변경·취소·설문은 **절대 세션으로 인증하지 않는다** — 언제나 새 BOOKING_MANAGE proof 가 필요하다.
 *
 * 변경 경계 인증(공통): 회차 변경·참석 변경·취소·설문은 **선택을 마친 순간** 사용 가능한 proof 가
 * 없으면 BOOKING_MANAGE OTP 오버레이를 연다. 오버레이는 이미 메모리에 있는 전체 연락처를 채워 주고,
 * 새 검증 뒤에만 그 변경을 X-Booking-Proof 로 수행한다. 변경 성공은 같은 트랜잭션에서 proof 를 소비하고,
 * 실패는 서버가 소비를 롤백하므로 같은 proof 로 재시도할 수 있다.
 *
 * 시크릿·마스킹 경계:
 * - 표시하는 이름·연락처는 서버가 **이미 마스킹한** DTO 값(`maskedName`·`maskedContact`)이다 —
 *   그대로 그린다. 복원·역마스킹·이중 마스킹·저장·로깅·URL 노출을 하지 않는다.
 * - 원문 QR 은 **읽기 인증(proof/세션)** 이 있을 때만 복구 GET 으로 메모리에 온다: direct·access,
 *   그리고 lookup 에서 예약을 골라 읽기 세션을 세운 뒤. 목록만 보는 동안은 QR 을 요청하지 않는다.
 * - 전체 연락처는 화면 메모리에만 머문다(조회·읽기 세션 본문·OTP 발송에만 쓰고 저장·로깅·URL 금지).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Calendar, Users } from "lucide-react";
import { ReservationQr } from "@/entities/reservation";
import { Badge, BRAND_NAME_ROMAN, BRAND_QR_DOWNLOAD_BASENAME, Button, KV } from "@/shared/ui";
import { fmtDateTime, fmtSessionCardDateTime } from "@/shared/lib/format";
import { SEMINAR_LOCATION } from "@/shared/lib/seminar";
import {
  attendancePartySummary,
  cancelPublicFamilyBooking,
  defaultErrorMessage,
  establishFamilyBookingContactReadSession,
  FAMILY_BOOKING_STATUS_LABELS,
  getPublicFamilyBooking,
  isAborted,
  isApiError,
  lookupPublicFamilyBookings,
  recoverOwnedFamilyBookingQr,
  updatePublicFamilyBooking,
  useKeyedOperationIntents,
  type AttendanceParty,
  type OwnedBookingReadAuth,
  type PublicMaskedFamilyBooking,
  type PublicSeminarSession,
} from "@/shared/api";
import type { BookingProof } from "@/features/public-booking";
import {
  attendancePartyOptions,
  attendancePartyUpdateRequest,
  isCompleteContact,
  manageErrorMessageForCode,
  moveTargetSessions,
  normalizeContactDigits,
  useBookingProof,
  useOtpFlow,
} from "@/features/public-booking";
import { BottomBar, ErrorNote, FlowHeader, FlowOverlay, FlowToast } from "./MobileChrome";
import { ContactEntryForm } from "./ContactEntry";
import { OtpFields } from "./ReserveFlow";
import { SurveyPanel } from "./SurveyPanel";

type Stage = "lookup" | "list" | "auth" | "loading" | "detail" | "survey" | "expired";

/**
 * 변경 경계에서 인증이 필요한 작업. move/party/cancel 은 검증 직후 **바로 수행**하고,
 * survey 는 검증 직후 설문 화면으로 넘어가 그 화면이 같은 proof 로 제출한다.
 */
type PendingAction =
  | { kind: "move"; targetSessionId: string }
  | { kind: "party"; party: AttendanceParty }
  | { kind: "cancel" }
  | { kind: "survey" };

type ManageMutationIntent =
  | {
      kind: "move";
      familyBookingId: string;
      targetSessionId: string;
      expectedVersion: number;
      proof: BookingProof;
    }
  | {
      kind: "party";
      familyBookingId: string;
      party: AttendanceParty;
      expectedVersion: number;
      proof: BookingProof;
    }
  | {
      kind: "cancel";
      familyBookingId: string;
      expectedVersion: number;
      proof: BookingProof;
    };

/**
 * lookup 모드에서 고른 예약 하나에 읽기 세션을 세우려는 **불변 의도**.
 * 대상 키는 하나뿐(`READ_SESSION_TARGET`)이라, 결과 미상인 채로 *다른 예약*을 고르면 divergence 로
 * 막힌다 — 같은 예약을 그대로 다시 고르는 재시도만 같은 키·같은 `{contact}` 본문으로 나간다.
 */
type ReadSessionIntent = { familyBookingId: string; contact: string };

/** 읽기 세션은 한 번에 하나만 진행한다 — 단일 대상 키로 divergent 선택을 막는다. */
const READ_SESSION_TARGET = "read-session";

export interface ManageBookingPanelProps {
  /** 공개 회차 목록 — 예약의 회차 메타를 붙일 때만 쓴다(없으면 지어내지 않는다). */
  sessions: PublicSeminarSession[];
  /**
   * 문자 링크(`/booking/{id}`)로 들어온 경우의 대상 예약 id — **direct 모드**.
   * 최초 OTP 로 읽기 proof 를 얻어 이 id 하나만 범위 조회한다. id 는 조회 키일 뿐 권한이 아니다.
   */
  initialBookingId?: string;
  /**
   * SMS 개인 링크 교환 성공으로 세운 **access(관리 세션) 모드**의 대상 예약 id.
   * OTP 없이 쿠키 세션으로 조회·QR 복구만 하고, 변경은 새 proof 로만 한다.
   */
  accessSession?: { familyBookingId: string };
  /**
   * 이미 메모리에 있는 전체 연락처(access 모드의 교환 입력값). 변경 경계 OTP 를 채워 주는 데만 쓴다.
   * ★ 저장·로깅·URL 노출 금지 — 오직 OTP 발송 대상 입력을 미리 채우는 용도다.
   */
  prefillContact?: string;
  onExit: () => void;
  onToast: (message: string) => void;
}

/** 세션 만료 안내(access 모드). */
const SESSION_EXPIRED_NOTE = "예약 관리 세션이 만료됐습니다. 문자로 받은 예약 링크를 다시 열어 주세요.";

/** 현재 QR 상태 — 로딩/표시/불가(폐기·만료)/취소/조회전용/오류를 서로 다른 상태로 구분한다. */
type QrState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; token: string }
  /** QR 이 폐기·만료됨(409/410) 또는 활성 QR 이 없음 — 재발급이 아니라 상태만 알린다. */
  | { kind: "unavailable" }
  /** 예약이 취소돼 QR 이 없음. */
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

/** 변경 경계 OTP 오버레이의 제목에 쓸 작업 이름 — 어떤 작업을 인증하는지 분명히 밝힌다. */
const ACTION_LABELS: Record<PendingAction["kind"], string> = {
  move: "회차 변경",
  party: "참석 학부모 변경",
  cancel: "예약 취소",
  survey: "만족도 설문",
};

export function ManageBookingPanel({
  sessions,
  initialBookingId,
  accessSession,
  prefillContact,
  onExit,
  onToast,
}: ManageBookingPanelProps) {
  const mode: "lookup" | "direct" | "access" = accessSession
    ? "access"
    : initialBookingId !== undefined
      ? "direct"
      : "lookup";
  const accessBookingId = accessSession?.familyBookingId ?? null;

  const [stage, setStage] = useState<Stage>(
    mode === "access" ? "loading" : mode === "direct" ? "auth" : "lookup",
  );
  const [items, setItems] = useState<PublicMaskedFamilyBooking[]>([]);
  const [selected, setSelected] = useState<PublicMaskedFamilyBooking | null>(null);
  const [lookupContact, setLookupContact] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // lookup 목록에서 고른 예약에 읽기 세션을 세우는 중 — 그 항목만 진행 표시하고 목록 전체는 잠근다.
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [qr, setQr] = useState<QrState>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);
  // 오버레이 제목이 어떤 작업을 인증하는지 밝히려면 render 에서 읽어야 하므로 state 로 둔다
  // (전체 action 은 ref 로 두어 onVerified 클로저의 최신값을 보장한다).
  const [pendingKind, setPendingKind] = useState<PendingAction["kind"] | null>(null);
  const [hasRetainedMutation, setHasRetainedMutation] = useState(false);

  const proof = useBookingProof();
  const clearProof = proof.clear;
  const mutationIntents = useKeyedOperationIntents<ManageMutationIntent>();
  // 변경 intent 와 **별개** 키다 — 읽기 세션(POST)의 결과 미상 재시도가 변경과 섞이지 않게 한다.
  const readSessionIntents = useKeyedOperationIntents<ReadSessionIntent>();
  const pendingActionRef = useRef<PendingAction | null>(null);
  const readOtpRestartRef = useRef<() => void>(() => {});

  const sessionOf = useCallback(
    (booking: PublicMaskedFamilyBooking) =>
      sessions.find((s) => s.seminarSessionId === booking.seminarSessionId) ?? null,
    [sessions],
  );

  /** 현재 활성 QR 복구(direct·access 읽기 인증 전용) — 취소/폐기/만료를 구분한다. 조회로 버전이 안 바뀐다. */
  const loadQr = useCallback(
    async (booking: PublicMaskedFamilyBooking, auth: OwnedBookingReadAuth) => {
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
        } else if (mode === "access" && isApiError(caught) && (caught.status === 401 || caught.status === 403)) {
          setStage("expired");
        } else {
          setQr({ kind: "error", message: defaultErrorMessage(caught) });
        }
      }
    },
    [mode],
  );

  /**
   * lookup 모드: 마스킹 목록에서 고른 예약에 **읽기 세션**을 세우고 상세·현재 QR 을 연다.
   *
   * 1) 이미 메모리에 있는 전체 연락처로 `POST …/read-session`(본문 정확히 `{contact}`, CSRF·
   *    credentials·안정적 Idempotency-Key). 어댑터가 응답 csrfToken 을 즉시 채택한다.
   * 2) 같은 예약을 관리 세션 쿠키로 마스킹 상세 GET → 현재 QR 복구 GET(원문 QR 은 메모리에만).
   * 3) 같은 페이지에서 기존 상세·ReservationQr 를 그린다.
   *
   * 결과 미상(network·5xx)이면 키·본문을 그대로 붙잡아 두고 목록에 남긴다 — 같은 예약 재시도만
   * 같은 키로 나가고, 다른 예약 선택은 divergence 로 막는다. 변경·취소·설문은 여기서 인증하지
   * 않는다(언제나 새 BOOKING_MANAGE proof) — 읽기 세션은 읽기 전용이다.
   */
  const selectLookupBooking = useCallback(
    async (booking: PublicMaskedFamilyBooking) => {
      if (selectingId !== null) return;
      const contact = normalizeContactDigits(lookupContact);
      const operation = readSessionIntents.begin(READ_SESSION_TARGET, {
        familyBookingId: booking.familyBookingId,
        contact,
      });
      if (!operation.ok) {
        setListError(
          operation.reason === "diverged"
            ? "직전에 선택한 예약의 결과를 아직 확인하지 못했습니다. 같은 예약을 그대로 다시 선택해 주세요."
            : "확인하지 못한 조회 요청이 남아 있습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const intent = operation.intent;
      setSelectingId(booking.familyBookingId);
      setListError(null);
      try {
        // 읽기 세션 수립(durable POST) — 응답 csrfToken 채택은 어댑터가 한다.
        await establishFamilyBookingContactReadSession(intent.familyBookingId, intent.contact, {
          idempotencyKey: operation.key,
        });
        // POST 가 확정 성공했으니 키·본문을 놓아준다(이후 GET 은 읽기라 멱등키와 무관하다).
        readSessionIntents.settle(READ_SESSION_TARGET);
        // 관리 세션 쿠키로 마스킹 상세 GET → 현재 QR 복구. proof 는 붙지 않는다.
        const detail = await getPublicFamilyBooking(intent.familyBookingId, { session: "management" });
        setSelected(detail);
        setActionError(null);
        setHasRetainedMutation(
          mutationIntents.retained(`booking:${detail.familyBookingId}`) !== null,
        );
        setStage("detail");
        await loadQr(detail, { session: "management" });
      } catch (caught) {
        if (isAborted(caught)) return;
        // POST 가 이미 성공했으면 settle 로 키가 빠져 이 호출은 무해하다(GET 실패는 읽기 실패다).
        // POST 자체가 미상(network·5xx)이면 키·본문을 붙잡아 같은 예약 재시도가 같은 키로 나가게 한다.
        readSessionIntents.settle(READ_SESSION_TARGET, caught);
        setListError(readSessionErrorMessage(caught));
      } finally {
        setSelectingId(null);
      }
    },
    [selectingId, lookupContact, readSessionIntents, mutationIntents, loadQr],
  );

  /* ── access 모드: 마운트 시 대상 예약 하나 GET + 현재 QR 복구 ── */
  useEffect(() => {
    if (mode !== "access" || accessBookingId === null) return;
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
  }, [mode, accessBookingId, loadQr]);

  /** direct 모드: 대상 예약 하나만 범위 조회 + QR 복구(읽기 proof). */
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
        // 검증 요청 자체는 이미 성공해 challenge 가 소진됐다. 상세 GET 이 실패한 뒤
        // `verifying` 단계에 그대로 두면 재시도할 수 없으므로 proof 를 버리고 OTP를 다시 연다.
        clearProof();
        readOtpRestartRef.current();
        setListError(
          isApiError(caught) && (caught.status === 403 || caught.status === 404)
            ? "이 예약을 찾을 수 없거나 조회 권한이 없습니다. 예약하신 연락처가 맞는지 확인해 주세요."
            : defaultErrorMessage(caught),
        );
        setStage("auth");
      }
    },
    [loadQr, clearProof],
  );

  /* ── direct 모드 최초 본인 확인 OTP → 읽기 proof ── */
  const readOtp = useOtpFlow({
    purpose: "BOOKING_MANAGE",
    onVerified: (issued) => {
      proof.adopt(issued);
      if (initialBookingId) void loadOne(issued, initialBookingId);
    },
  });

  useEffect(() => {
    readOtpRestartRef.current = readOtp.restart;
    return () => {
      readOtpRestartRef.current = () => {};
    };
  }, [readOtp.restart]);

  /** 변경 성공 공통 처리 — proof 소비 + 선택·목록 항목을 반환 마스킹 DTO 로 갱신 + 성공 안내. */
  const applyMutation = useCallback(
    (updated: PublicMaskedFamilyBooking, message: string) => {
      proof.consume();
      setSelected(updated);
      setItems((current) =>
        current.map((b) => (b.familyBookingId === updated.familyBookingId ? updated : b)),
      );
      setToast(message);
      onToast(message);
    },
    [proof, onToast],
  );

  /** 불변 intent 로 선택된 변경을 보낸다. 결과 미상에서는 같은 key+같은 body만 재시도한다. */
  const runMutationIntent = useCallback(
    async (requested: ManageMutationIntent) => {
      const target = `booking:${requested.familyBookingId}`;
      const operation = mutationIntents.begin(target, requested);
      if (!operation.ok) {
        setHasRetainedMutation(mutationIntents.retained(target) !== null);
        setActionError(
          operation.reason === "diverged"
            ? "직전 변경 요청의 결과를 확인하지 못했습니다. 내용이 다른 변경은 보낼 수 없습니다. 직전 요청을 그대로 다시 시도해 주세요."
            : "결과를 확인하지 못한 변경 요청이 남아 있습니다. 직전 요청을 그대로 다시 시도해 주세요.",
        );
        return;
      }

      const intent = operation.intent;
      const options = { bookingProof: intent.proof.value, idempotencyKey: operation.key };
      setBusy(true);
      setActionError(null);
      try {
        let updated: PublicMaskedFamilyBooking;
        let message: string;
        if (intent.kind === "move") {
          updated = await updatePublicFamilyBooking(
            intent.familyBookingId,
            { seminarSessionId: intent.targetSessionId, expectedVersion: intent.expectedVersion },
            options,
          );
          message = "예약 회차를 변경했습니다. QR은 그대로 유지됩니다.";
        } else if (intent.kind === "party") {
          updated = await updatePublicFamilyBooking(
            intent.familyBookingId,
            attendancePartyUpdateRequest(intent.party, intent.expectedVersion),
            options,
          );
          message = "참석 학부모를 변경했습니다. QR은 그대로 유지됩니다.";
        } else {
          updated = await cancelPublicFamilyBooking(
            intent.familyBookingId,
            intent.expectedVersion,
            options,
          );
          setQr({ kind: "cancelled" });
          message = "예약을 취소했습니다.";
        }

        mutationIntents.settle(target);
        setHasRetainedMutation(false);
        applyMutation(updated, message);
      } catch (caught) {
        mutationIntents.settle(target, caught);
        const retained = mutationIntents.retained(target) !== null;
        setHasRetainedMutation(retained);
        // 서버가 실패 트랜잭션에서 proof 소비를 롤백하므로 재시도용으로 유지한다.
        // 단, proof 자체가 죽은 계열(BOOKING_PROOF_*)은 되살릴 수 없으니 버리고 재인증을 요구한다.
        if (isProofDead(caught)) proof.clear();
        else proof.adopt(intent.proof);
        setActionError(
          retained
            ? "직전 변경 요청의 결과를 확인하지 못했습니다. 같은 요청을 그대로 다시 시도해 주세요."
            : manageErrorMessage(caught),
        );
      } finally {
        setBusy(false);
      }
    },
    [mutationIntents, applyMutation, proof],
  );

  /** 화면 선택값을 첫 전송 전에 불변 intent로 굳힌다. */
  const runAction = useCallback(
    (action: Exclude<PendingAction, { kind: "survey" }>, issued: BookingProof) => {
      if (!selected) return;
      const common = {
        familyBookingId: selected.familyBookingId,
        expectedVersion: selected.version,
        proof: issued,
      };
      if (action.kind === "move") {
        void runMutationIntent({ ...common, kind: "move", targetSessionId: action.targetSessionId });
      } else if (action.kind === "party") {
        void runMutationIntent({ ...common, kind: "party", party: action.party });
      } else {
        void runMutationIntent({ ...common, kind: "cancel" });
      }
    },
    [selected, runMutationIntent],
  );

  const retryRetainedMutation = useCallback(() => {
    if (!selected) return;
    const retained = mutationIntents.retained(`booking:${selected.familyBookingId}`);
    if (retained === null) {
      setHasRetainedMutation(false);
      return;
    }
    void runMutationIntent(retained);
  }, [selected, mutationIntents, runMutationIntent]);

  /* ── 변경 경계 OTP — 사용 가능한 proof 가 없을 때만 열린다 ── */
  const actionOtp = useOtpFlow({
    purpose: "BOOKING_MANAGE",
    onVerified: (issued) => {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      setPendingKind(null);
      setOtpOpen(false);
      if (action === null) return;
      if (action.kind === "survey") {
        // 설문은 화면으로 넘어가 같은 proof 로 제출한다(제출 성공이 proof 를 소비).
        proof.adopt(issued);
        setStage("survey");
      } else {
        void runAction(action, issued);
      }
    },
  });

  /** 이미 메모리에 있는 전체 연락처 — 변경 경계 OTP 발송 입력을 미리 채운다. */
  const manageContact =
    mode === "lookup" ? lookupContact : mode === "access" ? (prefillContact ?? "") : readOtp.contact;

  /**
   * 변경 작업 시작 — 선택을 마친 직후 호출한다.
   * 사용 가능한 proof 가 있으면 바로 수행/진입하고, 없으면 연락처를 채운 BOOKING_MANAGE OTP 를 연다.
   */
  const beginAction = useCallback(
    (action: PendingAction) => {
      setActionError(null);
      if (proof.proof !== null && proof.isUsable) {
        if (action.kind === "survey") setStage("survey");
        else void runAction(action, proof.proof);
        return;
      }
      pendingActionRef.current = action;
      setPendingKind(action.kind);
      actionOtp.restart();
      if (manageContact) actionOtp.setContact(manageContact);
      setOtpOpen(true);
    },
    [proof.proof, proof.isUsable, runAction, actionOtp, manageContact],
  );

  /** 변경 경계 OTP 를 닫는다 — 미완 인증이면 대기 작업을 버린다(새로 발급된 미사용 proof 는 없다). */
  const dismissActionOtp = useCallback(() => {
    setOtpOpen(false);
    pendingActionRef.current = null;
    setPendingKind(null);
    actionOtp.restart();
  }, [actionOtp]);

  /* ── lookup 모드 연락처 조회 ── */
  const submitLookup = useCallback(async () => {
    const digits = normalizeContactDigits(lookupContact);
    if (!isCompleteContact(digits) || lookupBusy) return;
    setLookupBusy(true);
    setLookupError(null);
    try {
      const result = await lookupPublicFamilyBookings(digits);
      setItems(result.items);
      setStage("list");
    } catch (caught) {
      setLookupError(lookupErrorMessage(caught));
    } finally {
      setLookupBusy(false);
    }
  }, [lookupContact, lookupBusy]);

  const lookupDigits = normalizeContactDigits(lookupContact);

  /* ── 세션 만료(access 모드) ── */
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

  /* ── access 모드 로딩 ── */
  if (stage === "loading")
    return (
      <div data-screen-label="모바일 — 예약 불러오는 중" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader title="예약 관리" />
        <p role="status" aria-live="polite" style={{ padding: "40px 22px", textAlign: "center", fontSize: 13.5, color: "var(--text-faint)" }}>
          예약을 불러오는 중입니다.
        </p>
        <FlowToast message={toast} />
      </div>
    );

  /* ── 연락처 조회 (lookup 모드) ── */
  if (stage === "lookup")
    return (
      <div data-screen-label="모바일 — 예약 조회" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={onExit} title="예약 조회" />
        <div style={{ padding: "14px 18px 30px" }}>
          <div style={{ padding: "8px 4px 16px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>예약을 조회합니다</h2>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>
              예약하신 <b>학부모 연락처</b>를 입력하시면 예약 내역을 보여드립니다.
            </p>
          </div>
          <ContactEntryForm
            value={lookupContact}
            onChange={(v) => { setLookupContact(v); setLookupError(null); }}
            onSubmit={() => void submitLookup()}
            submitting={lookupBusy}
            canSubmit={isCompleteContact(lookupDigits) && !lookupBusy}
            submitLabel="조회"
            submittingLabel="조회하는 중입니다…"
            hint="예약하실 때 사용한 학부모 연락처를 입력해 주세요."
            error={lookupError}
          />
        </div>
        <FlowToast message={toast} />
      </div>
    );

  /* ── direct 모드 최초 본인 확인 (OTP) ── */
  if (stage === "auth")
    return (
      <div data-screen-label="모바일 — 예약 조회" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={onExit} title="본인 확인" />
        <div style={{ padding: "14px 18px 30px" }}>
          <div style={{ padding: "8px 4px 16px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>본인 확인이 필요합니다</h2>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>
              링크만으로는 예약 내용을 보여드릴 수 없습니다. 예약하신 <b>학부모 연락처</b>로 본인 확인을 해 주세요.
            </p>
          </div>
          <OtpFields otp={readOtp} hint="예약하실 때 사용한 학부모 연락처를 입력해 주세요." />
          <ErrorNote message={listError} />
        </div>
        <FlowToast message={toast} />
      </div>
    );

  /* ── 조회 결과 목록 (lookup 모드) ── */
  if (stage === "list")
    return (
      <div data-screen-label="모바일 — 예약 목록" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        <FlowHeader back={() => { setStage("lookup"); }} title="내 예약" />
        <div style={{ padding: "14px 18px 30px" }}>
          {items.length === 0 && (
            <p style={{ padding: "28px 4px", fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, textAlign: "center" }}>
              이 연락처로 등록된 예약이 없습니다.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((b, i) => {
              const s = sessionOf(b);
              const isSelecting = selectingId === b.familyBookingId;
              const listBusy = selectingId !== null;
              return (
                <button
                  key={b.familyBookingId}
                  type="button"
                  disabled={listBusy}
                  aria-busy={isSelecting}
                  onClick={() => void selectLookupBooking(b)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", cursor: listBusy ? "default" : "pointer", opacity: listBusy && !isSelecting ? 0.55 : 1, textAlign: "left", width: "100%", fontFamily: "var(--font-body)", animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 60}ms both` }}
                >
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontWeight: 800, fontSize: 14.5, color: "var(--text-strong)" }}>
                      {/* 서버가 이미 마스킹한 이름 — 그대로 표시한다(이중 마스킹 금지). */}
                      {b.participants.map((p) => p.maskedName).join(", ")}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s ? `${s.seminarTitle} · ${fmtDateTime(new Date(s.startsAt))}` : "설명회 정보는 예약 상세에서 확인해 주세요"}
                    </span>
                  </span>
                  <Badge tone={b.status === "RESERVED" ? "accent" : "neutral"} size="sm">
                    {FAMILY_BOOKING_STATUS_LABELS[b.status]}
                  </Badge>
                  {isSelecting ? (
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)", flexShrink: 0 }}>여는 중…</span>
                  ) : (
                    <ArrowRight size={15} aria-hidden="true" style={{ color: "var(--violet-800)", flexShrink: 0 }} />
                  )}
                </button>
              );
            })}
          </div>
          <ErrorNote message={listError} />
        </div>
        <FlowToast message={toast} />
      </div>
    );

  if (!selected) return null;

  /* ── 만족도 설문 — 사용 가능한 proof 로만 진입한다(access 세션은 인증 불가) ── */
  if (stage === "survey" && proof.proof !== null)
    return (
      <>
        <SurveyPanel
          familyBookingId={selected.familyBookingId}
          bookingProof={proof.proof.value}
          onBack={() => { proof.clear(); setStage("detail"); }}
          onConsumed={proof.consume}
          onDone={(message) => { setStage("detail"); setToast(message); onToast(message); }}
        />
      </>
    );

  /* ── 예약 상세 · 관리 ── */
  const detailSession = sessionOf(selected);
  // 회차 이동 후보는 정책 모듈이 마스킹 참가자(유형·캠퍼스)만으로 판정한다 — 타입을 약화시키지 않는다.
  const movable = moveTargetSessions(sessions, {
    seminarSessionId: selected.seminarSessionId,
    participants: selected.participants,
  });
  const manageable = selected.status === "RESERVED";
  const surveyEligible = selected.status === "CHECKED_IN";
  const controlsDisabled = busy;
  const maskedNames = selected.participants.map((p) => p.maskedName).join(", ");

  return (
    <div data-screen-label="모바일 — 예약 관리" style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
      <FlowHeader
        back={mode === "lookup" ? () => { setStage("list"); } : undefined}
        title="내 예약"
      />
      <div style={{ flex: 1, padding: "14px 18px 130px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 340, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: "var(--shadow-raised)", overflow: "hidden" }}>
          <div style={{ background: "var(--surface-brand)", color: "var(--text-on-brand)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, letterSpacing: "var(--tracking-caps)", color: "var(--mint-400)", fontWeight: 700 }}>{BRAND_NAME_ROMAN} ADMISSION QR</div>
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
              {/* 서버가 이미 마스킹한 값(maskedName·maskedContact) — 그대로 표시한다(이중 마스킹 금지). */}
              <KV k="참석자명" v={maskedNames} />
              <KV k="참석 학부모" v={attendancePartySummary(selected.attendanceParty)} />
              {detailSession && <KV k="일시" v={`${fmtSessionCardDateTime(new Date(detailSession.startsAt))} · ${SEMINAR_LOCATION}`} />}
              <KV k="연락처" v={selected.maskedContact} />
            </div>
          </div>
        </div>

        <ErrorNote message={actionError} />
        {hasRetainedMutation && (
          <div style={{ width: "100%", maxWidth: 340, marginTop: 10 }}>
            <Button variant="secondary" fullWidth disabled={busy} onClick={retryRetainedMutation}>
              {busy ? "다시 확인하는 중입니다…" : "직전 요청 그대로 다시 시도"}
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
            <Button variant="ghost" fullWidth disabled={controlsDisabled} onClick={() => beginAction({ kind: "survey" })}>
              만족도 설문 참여
            </Button>
          )}
        </div>
      </div>

      {changeOpen && (
        <FlowOverlay onDismiss={() => setChangeOpen(false)} align="bottom" ariaLabel="다른 설명회로 변경">
          <div style={{ width: "100%", background: "var(--surface-page)", borderRadius: "22px 22px 0 0", padding: "10px 18px calc(26px + env(safe-area-inset-bottom))", animation: "ds-sheet-up var(--dur-base) var(--ease-spring) both" }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--gray-3)", margin: "6px auto 14px" }} />
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>다른 설명회로 변경</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 12 }}>QR은 그대로 유지됩니다.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {movable.length === 0 && (
                <p style={{ padding: "20px 10px", textAlign: "center", fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
                  변경 가능한 다른 설명회가 없습니다.
                  <br />
                  이번 설명회는 단일 회차로 진행됩니다.
                </p>
              )}
              {movable.map((s) => (
                <button
                  key={s.seminarSessionId}
                  type="button"
                  disabled={busy}
                  onClick={() => { setChangeOpen(false); beginAction({ kind: "move", targetSessionId: s.seminarSessionId }); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", cursor: "pointer", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", textAlign: "left", width: "100%", fontFamily: "var(--font-body)" }}
                >
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "var(--text-strong)" }}>{s.seminarTitle}</span>
                    {/* 회차 선택에는 일시만 보여 주고 서버의 예약 가능 기간 판정을 따른다. */}
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
        <FlowOverlay onDismiss={() => setPartyOpen(false)} align="bottom" ariaLabel="참석 학부모 변경">
          <div style={{ width: "100%", background: "var(--surface-page)", borderRadius: "22px 22px 0 0", padding: "10px 18px calc(26px + env(safe-area-inset-bottom))", animation: "ds-sheet-up var(--dur-base) var(--ease-spring) both" }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--gray-3)", margin: "6px auto 14px" }} />
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>참석 학부모 변경</h3>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 12 }}>
              예약과 QR은 그대로 유지되며, 참석 인원(좌석 수)만 바뀝니다.
            </p>
            <div role="radiogroup" aria-label="참석 학부모" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {attendancePartyOptions(selected.attendanceParty).map(({ party, current }) => {
                return (
                  <button
                    key={party}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    disabled={busy || current}
                    onClick={() => { setPartyOpen(false); beginAction({ kind: "party", party }); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", cursor: current || busy ? "default" : "pointer", background: "var(--surface-card)", border: current ? "1px solid var(--border-strong)" : "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", textAlign: "left", width: "100%", fontFamily: "var(--font-body)" }}
                  >
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "var(--text-strong)" }}>
                        {attendancePartySummary(party)}
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
        <FlowOverlay onDismiss={() => setCancelOpen(false)} dialogRole="alertdialog" ariaLabel="예약 취소 확인">
          <div style={{ width: "100%", maxWidth: 320, background: "var(--surface-card)", borderRadius: "var(--radius-lg)", padding: "22px 22px 18px", boxShadow: "var(--shadow-raised)" }}>
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>예약을 취소하시겠습니까?</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.55 }}>
              {maskedNames} 예약을 취소합니다. 취소하시면 QR도 함께 무효가 됩니다.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <Button variant="ghost" fullWidth onClick={() => setCancelOpen(false)}>돌아가기</Button>
              <Button variant="danger" fullWidth onClick={() => { setCancelOpen(false); beginAction({ kind: "cancel" }); }} disabled={busy}>
                취소하기
              </Button>
            </div>
          </div>
        </FlowOverlay>
      )}

      {otpOpen && (
        <FlowOverlay
          onDismiss={dismissActionOtp}
          align="bottom"
          ariaLabel={`${ACTION_LABELS[pendingKind ?? "move"]} 본인 인증`}
        >
          <div style={{ width: "100%", background: "var(--surface-page)", borderRadius: "22px 22px 0 0", padding: "10px 18px calc(26px + env(safe-area-inset-bottom))", animation: "ds-sheet-up var(--dur-base) var(--ease-spring) both" }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--gray-3)", margin: "6px auto 14px" }} />
            <h3 style={{ fontSize: 17, fontWeight: 800 }}>
              {ACTION_LABELS[pendingKind ?? "move"]} 본인 인증
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 14, lineHeight: 1.5 }}>
              {ACTION_LABELS[pendingKind ?? "move"]} 전에 예약하신 학부모 연락처로 본인 인증을 해 주세요.
            </p>
            <OtpFields otp={actionOtp} hint="예약하실 때 사용한 학부모 연락처입니다." />
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

/** QR 영역 — 복구 상태(로딩/표시/불가/취소/조회전용/오류)를 서로 다르게 보여 준다. */
function QrArea({ qr, bookingId, status }: { qr: QrState; bookingId: string; status: string }) {
  if (qr.kind === "ready") {
    return <ReservationQr qrToken={qr.token} downloadName={BRAND_QR_DOWNLOAD_BASENAME} familyBookingId={bookingId} />;
  }

  const note = (message: string, tone: "muted" | "warning" = "muted") => (
    <p style={{ margin: 0, padding: "18px 14px", borderRadius: "var(--radius-md)", background: tone === "warning" ? "var(--status-warning-soft)" : "var(--surface-sunken)", color: tone === "warning" ? "var(--status-warning)" : "var(--text-muted)", fontSize: 12.5, lineHeight: 1.6, textAlign: "center", width: "100%", boxSizing: "border-box" }}>
      {message}
    </p>
  );

  switch (qr.kind) {
    case "loading":
      return note("QR을 불러오는 중입니다.");
    case "cancelled":
      return note(`취소된 예약입니다 (${status}). 입장 QR은 더 이상 사용할 수 없습니다.`, "warning");
    case "unavailable":
      return note("현재 사용할 수 있는 입장 QR이 없습니다. QR이 만료되었을 수 있습니다.", "warning");
    case "error":
      return note(qr.message, "warning");
    default:
      return note("QR을 불러오는 중입니다.");
  }
}

/** proof 자체가 무효·소진된 계열인가 — 되살릴 수 없으므로 재인증을 요구한다. */
function isProofDead(error: unknown): boolean {
  return isApiError(error) && error.code.startsWith("BOOKING_PROOF");
}

function manageErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  // 정확한 도메인 code 를 HTTP status 폴백보다 먼저 본다.
  const byCode = manageErrorMessageForCode(error.code);
  if (byCode !== null) return byCode;
  switch (error.status) {
    case 401:
    case 403:
      return "인증이 만료되었거나 이미 사용됐습니다. 인증번호를 다시 받아 주세요.";
    case 404:
      return "예약을 찾을 수 없습니다.";
    case 409:
      return "이미 입장했거나 다른 곳에서 먼저 변경된 예약입니다. 예약을 다시 조회해 주세요.";
    case 422:
      return "선택하신 회차가 참가자 캠퍼스와 맞지 않습니다.";
    default:
      return defaultErrorMessage(error);
  }
}

/**
 * 읽기 세션 수립(또는 이어지는 상세·QR GET) 실패 문구 — 목록에 남아 정중하게 안내한다.
 * 401(BOOKING_READ_SESSION_INVALID)·429(BOOKING_READ_SESSION_RATE_LIMITED)·서비스(5xx)·네트워크를
 * 서로 다른 정식 한국어로 구분한다. 401 은 예약 없음·연락처 불일치·취소·자격 없음을 하나로 뭉친다.
 */
function readSessionErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  if (error.kind === "network") {
    return "네트워크에 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
  }
  switch (error.status) {
    case 401:
      return "예약을 확인할 수 없습니다. 예약하신 학부모 연락처가 맞는지 확인해 주세요.";
    case 429:
      return "조회 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    default:
      if (error.status >= 500) return "예약 조회가 일시적으로 어렵습니다. 잠시 후 다시 시도해 주세요.";
      return defaultErrorMessage(error);
  }
}

function lookupErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  switch (error.status) {
    case 400:
      return "연락처 형식을 다시 확인해 주세요.";
    case 403:
      return "예약 조회를 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    case 429:
      // 계약 code: BOOKING_LOOKUP_RATE_LIMITED.
      return "조회 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    case 503:
      return "예약 조회가 일시적으로 어렵습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}
