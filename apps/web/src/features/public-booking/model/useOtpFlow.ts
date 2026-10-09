"use client";

/**
 * SMS OTP 인증 — 계약 POST /public/otp/challenges + .../verify
 *
 * 정직성 규칙:
 * - challenge 생성이 실제로 201 을 돌려줬을 때만 "문자를 보냈어요" 라고 말함
 * - 검증 리플레이(`replayed: true`)에는 원문 proof 가 없음. 시크릿을 지어내지 않고
 *   처음부터 다시 인증하게 함 (계약이 의도한 동작)
 *
 * 멱등성: challenge/verify 각각 조작 단위 키를 가짐. 결과 미상(network·5xx)에는 키를
 * 유지해 같은 요청을 리플레이시키고, 확정 성공·확정 4xx 에서만 버림
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
import { formatContactInput, isCompleteContact, normalizeContactDigits } from "./contact";
import type { BookingProof } from "./useBookingProof";

/**
 * 인증번호 자리 수
 */
const OTP_CODE_LENGTH = 6;

/**
 * 인증번호 형식
 */
const OTP_CODE_PATTERN = /^[0-9]{6}$/;

/**
 * 인증 진행 단계
 */
export type OtpStage =
  /**
   * 연락처 입력 대기
   */
  | "contact"
  /**
   * challenge 생성 요청 중
   */
  | "sending"
  /**
   * 서버가 201 을 줬음 — 실제로 문자가 큐에 들어갔음. 코드 입력 대기
   */
  | "code"
  /**
   * 코드 검증 중
   */
  | "verifying";

/**
 * 연락처 인증 흐름 상태
 */
export interface OtpFlowState {
  /**
   * 진행 단계
   */
  stage: OtpStage;

  /**
   * 보호자 연락처
   */
  contact: string;

  /**
   * 연락처 입력값 변경
   */
  setContact: (value: string) => void;

  /**
   * 인증번호 입력값
   */
  code: string;

  /**
   * 인증번호 입력값 변경
   */
  setCode: (value: string) => void;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;
  /**
   * 재전송 가능 시각까지 남은 초 (계약 retryAfterSeconds=60)
   */
  challengeExpiresAt: string | null;

  /**
   * 인증번호 요청 가능 여부
   */
  canSend: boolean;

  /**
   * 인증번호 확인 가능 여부
   */
  canVerify: boolean;

  /**
   * 인증번호 요청
   */
  sendChallenge: () => Promise<void>;

  /**
   * 인증번호 확인
   */
  verify: () => Promise<void>;
  /**
   * 연락처부터 다시 — 리플레이로 proof 를 잃었을 때 포함
   */
  restart: () => void;
}

/**
 * 연락처 인증 흐름 옵션
 */
export interface UseOtpFlowOptions {
  /**
   * 인증 용도
   */
  purpose: OtpPurpose;
  /**
   * FAMILY_BOOKING 비재원 폴백 지점. BOOKING_MANAGE 에서는 서버가 무시함
   */
  branch?: Branch;

  /**
   * 인증 성공 시 받은 증명 전달
   */
  onVerified: (proof: BookingProof) => void;
}

/**
 * 인증번호 요청 오류를 안내 문구로 변환
 */
function challengeErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  switch (error.status) {
    case 400:
      return "연락처 형식을 다시 확인해 주세요.";
    case 409:
      return "이미 진행 중인 인증이 있습니다. 잠시 후 다시 시도해 주세요.";
    case 429:
      return "인증 문자 요청이 너무 잦습니다. 1분 뒤에 다시 시도해 주세요.";
    case 503:
      return "문자 발송이 일시적으로 어렵습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}

/**
 * 인증번호 확인 오류를 안내 문구로 변환
 */
function verifyErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);
  switch (error.status) {
    case 400:
      return "인증번호가 올바르지 않습니다. 6자리를 다시 확인해 주세요.";
    case 409:
      return "만료되었거나 이미 사용된 인증입니다. 인증번호를 다시 받아 주세요.";
    case 429:
      return "인증 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}

/**
 * 연락처 입력 → 인증번호 요청 → 확인 흐름 훅
 */
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
      // 숫자만 받아 하이픈 표기로 보관·표시함. 발송 시 normalizeContactDigits 로 다시 숫자만 남김
      setContactState(formatContactInput(value));
      setError(null);
      // 연락처를 바꾸는 건 새 조작 — 이전 시도의 키를 물려주지 않음
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

  const digits = normalizeContactDigits(contact);
  const canSend = isCompleteContact(digits) && stage !== "sending";
  const canVerify = OTP_CODE_PATTERN.test(code) && stage !== "verifying";

  const sendChallenge = useCallback(async () => {
    if (!canSend) return;

    // 계약: FAMILY_BOOKING OTP 는 캠퍼스(branch) 없이 보낼 수 없음. 타입뿐 아니라 런타임으로도 막음
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
      // 201 을 받은 뒤에만 코드 입력 단계로 넘어감 — 발송을 앞질러 말하지 않음
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
        // 리플레이 — 원문 proof 가 없음. 없는 시크릿을 만들어내지 않고 사실대로 재인증시킴
        restart();
        setError("인증 응답을 받지 못해 다시 확인해야 합니다. 인증번호를 다시 받아 주세요.");
        return;
      }

      onVerified({ value: result.bookingProof, expiresAt: result.expiresAt, scopes: result.scopes });
    } catch (caught) {
      verifyKey.settle(caught);
      setStage("code");
      setError(verifyErrorMessage(caught));

      // 확정적으로 만료·소진된 인증이면 연락처부터 다시 시작해야 함
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
