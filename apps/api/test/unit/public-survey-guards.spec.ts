import { GUARDS_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it } from "vitest";
import { CsrfGuard } from "../../src/common/auth/csrf.guard.js";
import { SameOriginGuard } from "../../src/common/auth/same-origin.guard.js";
import { BookingProofRequiredGuard } from "../../src/modules/family-bookings/booking-proof-required.guard.js";
import { PublicSurveysController } from "../../src/modules/surveys/surveys.controller.js";

/**
 * The public survey-response POST is a durable BOOKING_MANAGE mutation. It must be
 * gated exactly like the public family-booking update/cancel: a syntactically valid
 * X-Booking-Proof first, then session-bound CSRF (which also enforces same-origin),
 * before the service runs. A plain SameOriginGuard is not enough — it neither checks
 * the booking proof shape nor the CSRF token — so it must not be the sole guard.
 */
describe("public survey submission guard invariant", () => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    PublicSurveysController.prototype.submit,
  ) as unknown[];

  it("gates the mutation behind BookingProofRequiredGuard then CsrfGuard, in order", () => {
    expect(guards).toEqual([BookingProofRequiredGuard, CsrfGuard]);
    expect(guards.indexOf(BookingProofRequiredGuard)).toBeLessThan(
      guards.indexOf(CsrfGuard),
    );
  });

  it("does not rely on SameOriginGuard alone (CsrfGuard subsumes same-origin)", () => {
    expect(guards).not.toContain(SameOriginGuard);
    expect(guards).toContain(BookingProofRequiredGuard);
    expect(guards).toContain(CsrfGuard);
  });
});
