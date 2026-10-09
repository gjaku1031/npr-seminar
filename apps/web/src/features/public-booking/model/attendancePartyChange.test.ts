/**
 * 참석 학부모 변경 순수 규칙 테스트 (node:test + tsx)
 *
 * 지키려는 것:
 * - 선택지는 계약 enum 순서(모·부·모/부) 그대로이고 현재 값을 정확히 표시함
 * - PATCH 본문은 attendanceParty + expectedVersion 만 싣고, studentIds 등 학생 변경 필드를
 *   절대 포함하지 않음(좌석 수는 서버가 attendanceParty 로만 파생)
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATTENDANCE_PARTY_ORDER,
  attendancePartyOptions,
  attendancePartyUpdateRequest,
} from "./attendancePartyChange";

describe("attendancePartyOptions — 순서와 현재 표시", () => {
  it("모·부·모/부 순서를 지키고 현재 값 하나만 current 다", () => {
    const options = attendancePartyOptions("FATHER");
    assert.deepEqual(
      options.map((o) => o.party),
      ["MOTHER", "FATHER", "BOTH"],
    );
    assert.deepEqual(
      options.map((o) => o.current),
      [false, true, false],
    );
  });

  it("선택지는 항상 세 개(모/부/모/부)뿐이다 — 학생 선택지가 섞이지 않는다", () => {
    assert.equal(attendancePartyOptions("MOTHER").length, 3);
    assert.deepEqual([...ATTENDANCE_PARTY_ORDER], ["MOTHER", "FATHER", "BOTH"]);
  });
});

describe("attendancePartyUpdateRequest — 본문 형태", () => {
  it("attendanceParty + expectedVersion 만 싣고 studentIds 를 보내지 않는다", () => {
    const body = attendancePartyUpdateRequest("BOTH", 7) as unknown as Record<string, unknown>;
    assert.equal(body.attendanceParty, "BOTH");
    assert.equal(body.expectedVersion, 7);
    // 학생 변경 필드가 새어 나가지 않음 — 좌석 수는 서버가 attendanceParty 로만 파생함
    assert.equal("studentIds" in body, false);
    assert.equal("seminarSessionId" in body, false);
    assert.equal("seatCount" in body, false);
    // 정확히 두 키만 존재함
    assert.deepEqual(Object.keys(body).sort(), ["attendanceParty", "expectedVersion"]);
  });
});
