"use client";

/**
 * SMS OTP 인증 — 계약 POST /public/otp/challenges + .../verify.
 *
 * 정직성 규칙:
 * - challenge 생성이 실제로 201 을 돌려줬을 때만 "문자를 보냈어요" 라고 말한다.
 * - 검증 리플레이(`replayed: true`)에는 원문 proof 가 없다. 시크릿을 지어내지 않고
 *   **처음부터 다시 인증**하게 한다 (계약이 의도한 동작).
 *
 * 멱등성: challenge/verify 각각 조작 단위 키를 갖는다. 결과 미상(network·5xx)에는 키를
 * 유지해 같은 요청을 리플레이시키고, 확정 성공·확정 4xx 에서만 버린다.
 */

import { useCallback, useRef, useState } from "react";
import {
  defaultErrorMessage,
  isApiError,
  isDefinitiveFailure,
  isFreshProof,
  requestOtpChallenge,
  useOperationKey,
  verifyOtpChallenge,
  type Branch,
  type OtpPurpose,
  type RequestOtpInput,
} from "@/shared/api";
import type { BookingProof } from "./useBookingProof";

const OTP_CODE_LENGTH = 6;
const OTP_CODE_PATTERN = /^[0-9]{6}$/;

export type OtpStage =
  /** 연락처 입력 대기. */
  | "contact"
  /** challenge 생성 요청 중. */
  | "sending"
  /** 서버가 201 을 줬다 — 실제로 문자가 큐에 들어갔다. 코드 입력 대기. */
  | "code"
  /** 코드 검증 중. */
  | "verifying";

export interface OtpFlowState {
  stage: OtpStage;
  contact: string;
  setContact: (value: string) => void;
  code: string;
  setCode: (value: string) => void;
  error: string | null;
  /** 재전송 가능 시각까지 남은 초 (계약 retryAfterSeconds=60). */
  challengeExpiresAt: string | null;
  canSend: boolean;
  canVerify: boolean;
  sendChallenge: () => Promise<void>;
  verify: () => Promise<void>;
  /** 연락처부터 다시 — 리플레이로 proof 를 잃었을 때 포함. */
  restart: () => void;
}

export interface UseOtpFlowOptions {
  purpose: OtpPurpose;
  /** FAMILY_BOOKING 비재원 폴백 지점. BOOKING_MANAGE 에서는 서버가 무시한다. */
  branch?: Branch;
  onVerified: (proof: BookingProof) => void;
}

/** 계약 contact: 8~40자, 서버가 8~15자리로 정규화. 화면에서는 숫자만 남겨 보낸다. */
function normalizeContact(raw: string): string {
  return raw.replace(/\D/g, "");
}

function challengeErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  switch (error.status) {
    case 400:
      return "연락처 형식을 다시 확인해 주세요.";
    case 409:
      return "이미 진행 중인 인증이 있어요. 잠시 후 다시 시도해 주세요.";
    case 429:
      return "인증 문자 요청이 너무 잦아요. 1분 뒤에 다시 시도해 주세요.";
    case 503:
      return "문자 발송이 일시적으로 불가해요. 잠시 후 다시 시도해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}

function verifyErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  switch (error.status) {
    case 400:
      return "인증번호가 올바르지 않아요. 6자리를 다시 확인해 주세요.";
    case 409:
      return "만료되었거나 이미 사용된 인증이에요. 인증번호를 다시 받아 주세요.";
    case 429:
      return "인증 시도가 너무 잦아요. 잠시 후 다시 시도해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}

export function useOtpFlow({ purpose, branch, onVerified }: UseOtpFlowOptions): OtpFlowState {
  const [stage, setStage] = useState<OtpStage>("contact");
  const [contact, setContactState] = useState("");
  const [code, setCodeState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<string | null>(null);

  const challengeIdRef = useRef<string | null>(null);
  const challengeKey = useOperationKey();
  const verifyKey = useOperationKey();

  const setContact = useCallback(
    (value: string) => {
      setContactState(value);
      setError(null);
      // 연락처를 바꾸는 건 새 조작 — 이전 시도의 키를 물려주지 않는다.
      challengeKey.reset();
    },
    [challengeKey],
  );

  const setCode = useCallback((value: string) => {
    setCodeState(value.replace(/\D/g, "").slice(0, OTP_CODE_LENGTH));
    setError(null);
  }, []);

  const restart = useCallback(() => {
    challengeIdRef.current = null;
    setChallengeExpiresAt(null);
    setCodeState("");
    setStage("contact");
    challengeKey.reset();
    verifyKey.reset();
  }, [challengeKey, verifyKey]);

  const digits = normalizeContact(contact);
  const canSend = digits.length >= 8 && digits.length <= 15 && stage !== "sending";
  const canVerify = OTP_CODE_PATTERN.test(code) && stage !== "verifying";

  const sendChallenge = useCallback(async () => {
    if (!canSend) return;

    // 계약: FAMILY_BOOKING OTP 는 캠퍼스(branch) 없이 보낼 수 없다. 타입뿐 아니라 런타임으로도 막는다.
    if (purpose === "FAMILY_BOOKING" && !branch) {
      setError("캠퍼스를 먼저 선택해 주세요.");
      return;
    }

    setStage("sending");
    setError(null);

    try {
      const request: RequestOtpInput =
        purpose === "FAMILY_BOOKING"
          ? { contact: digits, purpose, branch: branch as Branch }
          : { contact: digits, purpose: "BOOKING_MANAGE" };
      const accepted = await requestOtpChallenge(request, {
        idempotencyKey: challengeKey.current(),
      });

      challengeKey.settle();
      challengeIdRef.current = accepted.challengeId;
      setChallengeExpiresAt(accepted.expiresAt);
      setCodeState("");
      verifyKey.reset();
      // 201 을 받은 뒤에만 코드 입력 단계로 넘어간다 — 발송을 앞질러 말하지 않는다.
      setStage("code");
    } catch (caught) {
      challengeKey.settle(caught);
      setStage("contact");
      setError(challengeErrorMessage(caught));
    }
  }, [canSend, digits, purpose, branch, challengeKey, verifyKey]);

  const verify = useCallback(async () => {
    const challengeId = challengeIdRef.current;
    if (!canVerify || !challengeId) return;

    setStage("verifying");
    setError(null);

    try {
      const result = await verifyOtpChallenge(challengeId, code, {
        idempotencyKey: verifyKey.current(),
      });

      verifyKey.settle();

      if (!isFreshProof(result)) {
        // 리플레이 — 원문 proof 가 없다. 없는 시크릿을 만들어내지 않고 사실대로 재인증시킨다.
        restart();
        setError("인증 응답을 받지 못해 다시 확인해야 해요. 인증번호를 다시 받아 주세요.");
        return;
      }

      onVerified({ value: result.bookingProof, expiresAt: result.expiresAt, scopes: result.scopes });
    } catch (caught) {
      verifyKey.settle(caught);
      setStage("code");
      setError(verifyErrorMessage(caught));

      // 확정적으로 만료·소진된 인증이면 연락처부터 다시 시작해야 한다.
      if (isDefinitiveFailure(caught) && isApiError(caught) && caught.status === 409) restart();
    }
  }, [canVerify, code, verifyKey, onVerified, restart]);

  return {
    stage,
    contact,
    setContact,
    code,
    setCode,
    error,
    challengeExpiresAt,
    canSend,
    canVerify,
    sendChallenge,
    verify,
    restart,
  };
}
