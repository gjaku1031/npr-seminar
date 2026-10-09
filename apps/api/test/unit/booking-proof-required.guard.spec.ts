import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { BookingProofRequiredGuard } from "../../src/modules/family-bookings/booking-proof-required.guard.js";

/**
 * 예약 증명 헤더와 예약 관리 세션을 가진 요청 컨텍스트
 *
 * @param proof x-booking-proof 값. 생략하면 헤더 없음
 */
function context(proof?: string): ExecutionContext {
  const request = {
    get: (name: string) => name.toLowerCase() === "x-booking-proof" ? proof : undefined,
    session: {
      bookingManagementSessionId: "fragment-link-session",
      bookingManagementExpiresAt: Date.now() + 60_000,
    },
  } as unknown as Request;
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

// 예약 변경 경로의 예약 증명 필수 가드
describe("BookingProofRequiredGuard", () => {
  // 관리 링크 세션만 있고 증명이 없거나 공백이면 401 BOOKING_PROOF_INVALID
  it("does not let the fragment-link management session substitute for a mutation proof", () => {
    expect(() => new BookingProofRequiredGuard().canActivate(context()))
      .toThrow(expect.objectContaining({ status: 401, code: "BOOKING_PROOF_INVALID" }));
    expect(() => new BookingProofRequiredGuard().canActivate(context("   ")))
      .toThrow(expect.objectContaining({ status: 401, code: "BOOKING_PROOF_INVALID" }));
  });

  // 형식이 맞는 증명은 가드를 통과해 서비스의 트랜잭션 검증으로 넘어감
  it("lets a nonempty proof reach transactional scope/contact validation", () => {
    expect(new BookingProofRequiredGuard().canActivate(context("a".repeat(43)))).toBe(true);
  });
});
