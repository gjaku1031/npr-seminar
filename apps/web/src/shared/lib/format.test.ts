// 시각 표기 순수 테스트. 서울 시간 고정 표기 규칙 검증
// 실행: node --import tsx --test src/shared/lib/format.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fmtSessionCardDateTime } from "./format";

describe("fmtSessionCardDateTime — QR 상세 카드 회차 일시(KST)", () => {
  it("정각은 '시'만 표기한다 — 8/21(금) 11시", () => {
    // 서울 11:00 = UTC 02:00. 2026-08-21은 금요일
    const at11 = new Date(Date.UTC(2026, 7, 21, 2, 0, 0));
    assert.equal(fmtSessionCardDateTime(at11), "8/21(금) 11시");
  });

  it("초는 버린다 — 11:00:00 도 11시", () => {
    const at11 = new Date(Date.UTC(2026, 7, 21, 2, 0, 45));
    assert.equal(fmtSessionCardDateTime(at11), "8/21(금) 11시");
  });

  it("분이 있으면 또렷이 표기한다 — 11시 30분", () => {
    const at1130 = new Date(Date.UTC(2026, 7, 21, 2, 30, 0));
    assert.equal(fmtSessionCardDateTime(at1130), "8/21(금) 11시 30분");
  });

  it("자정 넘김을 KST 로 계산한다 — UTC 15:00 = 다음 날 00시", () => {
    // UTC 2026-08-21 15:00 → 서울 2026-08-22(토) 00:00
    const kstMidnight = new Date(Date.UTC(2026, 7, 21, 15, 0, 0));
    assert.equal(fmtSessionCardDateTime(kstMidnight), "8/22(토) 0시");
  });
});
