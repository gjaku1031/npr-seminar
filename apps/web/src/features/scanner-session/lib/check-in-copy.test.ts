/**
 * 체크인 결과 문구 순수 테스트 (node:test + tsx). 클라이언트 컴포넌트를 import 하지 않는다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AttendanceParty, CheckInOutcome, CheckInResult } from "../../../shared/api/contract";
import { checkInTone, formatCheckInOutcome } from "./check-in-copy";

function outcome(overrides: Partial<CheckInOutcome> = {}): CheckInOutcome {
  return {
    eventId: "evt-1",
    result: "CHECKED_IN",
    replayed: false,
    familyBookingId: "fb-1",
    familySeatCount: 1,
    attendanceParty: "MOTHER",
    representativeStudentName: "김수민",
    representativeStudent: {
      participantType: "ENROLLED",
      sourceStudentNo: "S-1",
      studentName: "김수민",
      branch: "CAMPUS_A",
      className: "중3-A",
      schoolName: "잠실중",
      grade: "중3",
      unitName: "중등3",
    },
    seminarSessionId: "sess-1",
    deviceId: "dev-1",
    branch: "CAMPUS_A",
    gateCode: "GATE-1",
    occurredAt: "2026-07-18T01:00:00.000Z",
    ...overrides,
  };
}

describe("formatCheckInOutcome — CHECKED_IN 정확 문구", () => {
  const cases: Array<[AttendanceParty, 1 | 2, string]> = [
    ["MOTHER", 1, "김수민 학생 학부모(모) 1명 입장 완료"],
    ["FATHER", 1, "김수민 학생 학부모(부) 1명 입장 완료"],
    ["BOTH", 2, "김수민 학생 학부모(모/부) 2명 입장 완료"],
  ];

  for (const [party, seat, expected] of cases) {
    it(`${party} ${seat}명`, () => {
      const copy = formatCheckInOutcome(outcome({ attendanceParty: party, familySeatCount: seat }));
      assert.equal(copy.title, "입장 완료");
      assert.equal(copy.detail, expected);
    });
  }
});

describe("formatCheckInOutcome — ALREADY_CHECKED_IN", () => {
  it("대표학생명을 유지하고 `이미 입장 완료` 로 끝난다 (새 입장처럼 N명 줄을 다시 그리지 않는다)", () => {
    const copy = formatCheckInOutcome(
      outcome({ result: "ALREADY_CHECKED_IN", attendanceParty: "BOTH", familySeatCount: 2 }),
    );
    assert.equal(copy.detail, "김수민 학생 학부모(모/부) 이미 입장 완료");
    assert.equal(copy.detail.includes("2명"), false);
  });
});

describe("formatCheckInOutcome — null 방어", () => {
  it("대표학생명이 null 이면 undefined 를 노출하지 않고 일반 문구로 폴백한다", () => {
    const copy = formatCheckInOutcome(
      outcome({ result: "CHECKED_IN", representativeStudentName: null, representativeStudent: null }),
    );
    assert.equal(copy.detail.includes("undefined"), false);
    assert.equal(copy.detail, "입장 처리됐어요.");
  });

  it("참석 학부모가 null 이면 ALREADY 도 일반 문구로 폴백한다", () => {
    const copy = formatCheckInOutcome(
      outcome({ result: "ALREADY_CHECKED_IN", attendanceParty: null }),
    );
    assert.equal(copy.detail.includes("undefined"), false);
    assert.equal(copy.detail, "이 예약은 이미 입장 처리됐어요.");
  });

  it("무효 QR 은 문맥 없이도 안전한 고정 문구를 준다", () => {
    const copy = formatCheckInOutcome(
      outcome({
        result: "INVALID_QR",
        familyBookingId: null,
        familySeatCount: null,
        attendanceParty: null,
        representativeStudentName: null,
        representativeStudent: null,
      }),
    );
    assert.equal(copy.title, "유효하지 않은 QR");
    assert.equal(copy.detail.includes("undefined"), false);
  });
});

describe("checkInTone", () => {
  const expected: Array<[CheckInResult, string]> = [
    ["CHECKED_IN", "success"],
    ["ALREADY_CHECKED_IN", "warning"],
    ["SESSION_MISMATCH", "warning"],
    ["CANCELLED", "danger"],
    ["INVALID_QR", "danger"],
  ];
  for (const [result, tone] of expected) {
    it(`${result} → ${tone}`, () => assert.equal(checkInTone(result), tone));
  }
});
