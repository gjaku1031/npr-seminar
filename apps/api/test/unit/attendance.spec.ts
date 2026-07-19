import { describe, expect, it } from "vitest";
import { seatCountFor } from "../../src/modules/family-bookings/attendance.js";

describe("seatCountFor", () => {
  it("counts parents only", () => {
    expect(seatCountFor("MOTHER")).toBe(1);
    expect(seatCountFor("FATHER")).toBe(1);
    expect(seatCountFor("BOTH")).toBe(2);
  });
});
