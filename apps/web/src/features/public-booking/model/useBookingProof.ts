"use client";

/**
 * X-Booking-Proof 보관 — **메모리 전용**.
 *
 * 보안 불변식:
 * - 원문 proof 는 이 훅의 state 에만 존재한다. localStorage/sessionStorage/쿠키/URL/로그
 *   어디에도 쓰지 않는다. 탭을 닫으면 사라지는 게 정상이다(계약상 10분 단명 자격증명).
 * - 계약상 proof 는 신선한 검증에서 **한 번만** 내려온다. 잃어버리면 복구 불가 —
 *   새 OTP challenge 로 다시 인증해야 한다.
 *
 * 소비 규칙(계약):
 * - FAMILY_BOOKING: 학생 조회 반복 가능 → 예약 생성 1회로 소비.
 * - BOOKING_MANAGE: 소유 예약 읽기 반복 가능 → 첫 관리 변경으로 소비.
 *   그래서 변경 성공 뒤에는 `consume()` 으로 버리고 재인증을 요구한다.
 */

import { useCallback, useState } from "react";
import type { BookingProofScope } from "@/shared/api";

export interface BookingProof {
  /** 원문 시크릿 — 표시·저장·로깅 금지. */
  value: string;
  expiresAt: string;
  scopes: BookingProofScope[];
}

export interface BookingProofState {
  proof: BookingProof | null;
  /**
   * 아직 쓸 수 있는 proof 를 들고 있는가.
   *
   * 만료 시각 비교를 렌더 중에 하지 않는다(`Date.now()` 는 불순 함수라 렌더가 불안정해진다).
   * 만료는 어차피 서버가 401/403 으로 확정하고, 화면은 그 응답을 보고 재인증을 안내한다 —
   * 여기서는 "소비되지 않은 proof 를 갖고 있는가"만 본다.
   */
  isUsable: boolean;
  adopt: (proof: BookingProof) => void;
  /** 서버가 proof 를 소비한 뒤(관리 변경 성공) 로컬에서도 즉시 버린다. */
  consume: () => void;
  clear: () => void;
}

export function useBookingProof(): BookingProofState {
  const [proof, setProof] = useState<BookingProof | null>(null);

  const adopt = useCallback((next: BookingProof) => setProof(next), []);
  const consume = useCallback(() => setProof(null), []);
  const clear = useCallback(() => setProof(null), []);

  return { proof, isUsable: proof !== null, adopt, consume, clear };
}
