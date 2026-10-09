import { describe, expect, it } from "vitest";
import { seatCountFor } from "../../src/modules/family-bookings/attendance.js";

// 참석 보호자별 예약 인원 계산
describe("seatCountFor", () => {
  // 어머니·아버지는 1명, 둘 다는 2명으로 학생 수와 무관하게 보호자만 셈
  it("counts parents only", () => {
    expect(seatCountFor("MOTHER")).toBe(1);
    expect(seatCountFor("FATHER")).toBe(1);
    expect(seatCountFor("BOTH")).toBe(2);
  });
});
