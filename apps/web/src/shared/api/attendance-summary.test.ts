import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attendancePartySummary, ATTENDANCE_PARTY_LABELS } from "./contract";

/**
 * 참석 학부모 요약 문구 통일 계약 — 선택 버튼·티켓·예약 요약·스캐너 후보가 모두
 * 이 helper 하나만 씀(중복 금지). 서버 좌석 파생(MOTHER 1 / FATHER 1 / BOTH 2)과
 * 인원이 일치하고, 표기는 "모 · 1명 / 부 · 1명 / 모/부 · 2명" 으로 고정됨
 */
describe("attendancePartySummary — 노출 문구 통일", () => {
  it("계약 enum 세 값이 정해진 통일 문구를 낸다", () => {
    assert.equal(attendancePartySummary("MOTHER"), "모 · 1명");
    assert.equal(attendancePartySummary("FATHER"), "부 · 1명");
    assert.equal(attendancePartySummary("BOTH"), "모/부 · 2명");
  });

  it("라벨 접두는 ATTENDANCE_PARTY_LABELS 를 그대로 쓰고, 좌석은 명 단위로 붙인다", () => {
    for (const party of ["MOTHER", "FATHER", "BOTH"] as const) {
      const summary = attendancePartySummary(party);
      assert.ok(summary.startsWith(`${ATTENDANCE_PARTY_LABELS[party]} · `));
      // 옛 '석' 표기가 아니라 '명' 으로 통일함
      assert.ok(summary.endsWith("명"));
      assert.ok(!summary.includes("석"));
    }
  });
});
