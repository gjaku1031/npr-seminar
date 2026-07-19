"use client";

/**
 * 공개 SMS OTP (계약 tag: Public OTP).
 *
 * 시크릿 경계:
 * - `contact`·`oneTimeCode` 는 요청 본문에만 잠깐 존재한다. 저장·로깅 금지.
 * - 검증 성공(fresh)만 원문 `bookingProof` 를 준다. 리플레이는 secret-free 이며
 *   잃어버린 proof 는 **복구할 수 없다** — 새 challenge 로 다시 시작해야 한다.
 */

import { apiRequest } from "./client";
import type { DurableCallOptions } from "./scanner-admin";
import type {
  OtpChallengeAccepted,
  OtpChallengeRequest,
  OtpProofIssued,
} from "./contract";

/**
 * 계약 OtpChallengeRequest 그대로 — FAMILY_BOOKING 은 branch 필수, BOOKING_MANAGE 는 branch 금지.
 * 타입 자체가 캠퍼스 없는 FAMILY_BOOKING 요청을 막는다.
 */
export type RequestOtpInput = OtpChallengeRequest;

/**
 * 201 을 받아야만 실제로 SMS 가 큐에 들어간 것이다.
 * 화면은 이 함수가 정상 반환한 뒤에만 "문자를 보냈어요" 라고 말할 수 있다.
 */
export function requestOtpChallenge(
  input: RequestOtpInput,
  options: DurableCallOptions,
): Promise<OtpChallengeAccepted> {
  // 판별 유니언 그대로 실어 보낸다 — FAMILY_BOOKING 만 branch 를 포함한다.
  const body =
    input.purpose === "FAMILY_BOOKING"
      ? { contact: input.contact, purpose: input.purpose, branch: input.branch }
      : { contact: input.contact, purpose: input.purpose };

  return apiRequest<OtpChallengeAccepted>("/public/otp/challenges", {
    method: "POST",
    body,
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

export function verifyOtpChallenge(
  challengeId: string,
  oneTimeCode: string,
  options: DurableCallOptions,
): Promise<OtpProofIssued> {
  return apiRequest<OtpProofIssued>(
    `/public/otp/challenges/${encodeURIComponent(challengeId)}/verify`,
    {
      method: "POST",
      body: { oneTimeCode },
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    },
  );
}
