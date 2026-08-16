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
    attendedCount: 1,
    attendanceParty: "MOTHER",
    representativeStudentName: "김수민",
    representativeStudent: {
      participantType: "ENROLLED",
      sourceStudentNo: "S-1",
      studentName: "김수민",
      branch: "SONGPA",
      className: "중3-A",
      schoolName: "잠실중",
      grade: "중3",
      unitName: "중등3",
    },
    seminarSessionId: "sess-1",
    deviceId: "dev-1",
    branch: "SONGPA",
    gateCode: "GATE-1",
    occurredAt: "2026-07-18T01:00:00.000Z",
    ...overrides,
  };
}

describe("formatCheckInOutcome — CHECKED_IN 은 예약 인원이 아니라 실제 입장 인원을 말한다", () => {
  const cases: Array<[AttendanceParty, 1 | 2, 1 | 2, string]> = [
    ["MOTHER", 1, 1, "김수민 학생 학부모(모) 1명 입장 완료"],
    ["FATHER", 1, 1, "김수민 학생 학부모(부) 1명 입장 완료"],
    ["BOTH", 2, 2, "김수민 학생 학부모(모/부) 2명 입장 완료"],
    // ★ 이 기능의 핵심 — 2명 예약했는데 한 분만 왔다. 예약 인원을 그대로 읽으면
    //   화면이 오지 않은 사람까지 입장했다고 말한다.
    ["BOTH", 2, 1, "김수민 학생 학부모(모/부) 1명 입장 완료"],
  ];

  for (const [party, booked, entered, expected] of cases) {
    it(`${party} ${booked}명 예약 · ${entered}명 입장`, () => {
      const copy = formatCheckInOutcome(
        outcome({ attendanceParty: party, familySeatCount: booked, attendedCount: entered }),
      );
      assert.equal(copy.title, "입장 완료");
      assert.equal(copy.detail, expected);
    });
  }

  it("실제 입장 인원을 모르면 예약 인원으로 폴백한다 (undefined 를 노출하지 않는다)", () => {
    const copy = formatCheckInOutcome(
      outcome({ attendanceParty: "BOTH", familySeatCount: 2, attendedCount: null }),
    );
    assert.equal(copy.detail, "김수민 학생 학부모(모/부) 2명 입장 완료");
  });
});

describe("formatCheckInOutcome — ALREADY_CHECKED_IN", () => {
  /**
   * 예전에는 인원을 아예 지웠다("새 입장처럼 N명 줄을 다시 그리지 않는다"). 그 규칙의 목적은
   * 중복 스캔이 새 입장처럼 읽히지 않게 하는 것이었고, 그 역할은 제목("이미 입장한 QR")과
   * 본문의 "이미" 가 이미 하고 있다.
   *
   * 이제 인원을 함께 보여 준다. 2명 예약에 한 분만 입장한 상태에서 나머지 한 분이 뒤늦게 와
   * 다시 찍었을 때, 스태프가 알아야 할 사실이 정확히 "지금까지 1명"이기 때문이다.
   */
  it("이미 입장한 건은 지금까지 기록된 인원을 함께 말한다", () => {
    const copy = formatCheckInOutcome(
      outcome({ result: "ALREADY_CHECKED_IN", attendanceParty: "BOTH", familySeatCount: 2, attendedCount: 1 }),
    );
    assert.equal(copy.title, "이미 입장한 QR");
    assert.equal(copy.detail, "김수민 학생 학부모(모/부) 이미 1명 입장 완료");
  });

  it("인원 기록이 없으면 인원을 지어내지 않는다", () => {
    const copy = formatCheckInOutcome(
      outcome({ result: "ALREADY_CHECKED_IN", attendanceParty: "BOTH", familySeatCount: 2, attendedCount: null }),
    );
    assert.equal(copy.detail, "김수민 학생 학부모(모/부) 이미 입장 완료");
  });
});

describe("formatCheckInOutcome — PARTY_SELECTION_REQUIRED", () => {
  it("아직 입장이 아니라는 것과 무엇을 해야 하는지를 말한다", () => {
    const copy = formatCheckInOutcome(
      outcome({ result: "PARTY_SELECTION_REQUIRED", attendanceParty: "BOTH", familySeatCount: 2, attendedCount: null }),
    );
    assert.equal(copy.title, "인원 선택 필요");
    assert.equal(copy.detail.includes("입장 완료"), false);
    assert.equal(copy.detail.includes("선택"), true);
  });

  it("입장으로 읽히는 성공색을 쓰지 않는다", () => {
    assert.equal(checkInTone("PARTY_SELECTION_REQUIRED"), "warning");
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
