/**
 * 체크인 결과음 분류 순수 테스트 (node:test + tsx). Web Audio·React·클라이언트 훅을 import 하지 않음
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CheckInOutcome, CheckInResult } from "../../../shared/api/contract";
import type { CheckInPanel } from "../model/useQrCheckIn";
import { outcomeSoundKind, panelSoundKind } from "./check-in-sound";

/**
 * 결과만 있으면 분류가 결정됨 — 나머지 필드는 소리와 무관하므로 최소 스텁만 둠
 */
function outcomePanel(result: CheckInResult): CheckInPanel {
  return { kind: "outcome", outcome: { result } as CheckInOutcome };
}

describe("outcomeSoundKind — 결과별 소리 갈래", () => {
  it("입장 완료는 성공음", () => {
    assert.equal(outcomeSoundKind("CHECKED_IN"), "success");
  });

  it("이미 입장·다른 회차는 경고음", () => {
    assert.equal(outcomeSoundKind("ALREADY_CHECKED_IN"), "warning");
    assert.equal(outcomeSoundKind("SESSION_MISMATCH"), "warning");
  });

  it("취소·폐기·만료·무효·미발견·권한없음은 오류음", () => {
    const errors: CheckInResult[] = [
      "CANCELLED",
      "REVOKED_QR",
      "EXPIRED_QR",
      "INVALID_QR",
      "RESERVATION_NOT_FOUND",
      "NOT_AUTHORIZED",
    ];
    for (const result of errors) {
      assert.equal(outcomeSoundKind(result), "error", result);
    }
  });
});

describe("outcomeSoundKind — 전체 결과 표(회귀 고정)", () => {
  // 계약 CheckInResult 전체를 소리 갈래에 고정함 — 결과가 늘면 여기서 분류를 강제함
  const table: Array<[CheckInResult, "success" | "warning" | "error"]> = [
    ["CHECKED_IN", "success"],
    ["ALREADY_CHECKED_IN", "warning"],
    ["SESSION_MISMATCH", "warning"],
    ["CANCELLED", "error"],
    ["REVOKED_QR", "error"],
    ["EXPIRED_QR", "error"],
    ["INVALID_QR", "error"],
    ["RESERVATION_NOT_FOUND", "error"],
    ["NOT_AUTHORIZED", "error"],
  ];

  for (const [result, expected] of table) {
    it(`${result} → ${expected}`, () => {
      assert.equal(outcomeSoundKind(result), expected);
    });
  }
});

describe("panelSoundKind — 패널 상태별 소리(중복 억제는 훅의 몫)", () => {
  it("idle·processing 은 무음(null)", () => {
    assert.equal(panelSoundKind({ kind: "idle" }), null);
    assert.equal(panelSoundKind({ kind: "processing" }), null);
  });

  it("네트워크·처리 실패(error)는 오류음", () => {
    assert.equal(panelSoundKind({ kind: "error", message: "네트워크 실패" }), "error");
  });

  it("결과 미상 처리 누적(backlog)은 경고음", () => {
    assert.equal(panelSoundKind({ kind: "backlog" }), "warning");
  });

  it("성공 결과는 성공음, 거부 결과는 오류음", () => {
    assert.equal(panelSoundKind(outcomePanel("CHECKED_IN")), "success");
    assert.equal(panelSoundKind(outcomePanel("ALREADY_CHECKED_IN")), "warning");
    assert.equal(panelSoundKind(outcomePanel("CANCELLED")), "error");
  });
});
