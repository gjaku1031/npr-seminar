import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { BookingProofRequiredGuard } from "../../src/modules/family-bookings/booking-proof-required.guard.js";

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

describe("BookingProofRequiredGuard", () => {
  it("does not let the fragment-link management session substitute for a mutation proof", () => {
    expect(() => new BookingProofRequiredGuard().canActivate(context()))
      .toThrow(expect.objectContaining({ status: 401, code: "BOOKING_PROOF_INVALID" }));
    expect(() => new BookingProofRequiredGuard().canActivate(context("   ")))
      .toThrow(expect.objectContaining({ status: 401, code: "BOOKING_PROOF_INVALID" }));
  });

  it("lets a nonempty proof reach transactional scope/contact validation", () => {
    expect(new BookingProofRequiredGuard().canActivate(context("a".repeat(43)))).toBe(true);
  });
});
