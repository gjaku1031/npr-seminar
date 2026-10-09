/**
 * 스캐너 그리드 레이아웃 순수 테스트 (node:test + tsx). React·DOM 을 import 하지 않음
 * "4열에서 5대째부터 다음 행으로 흐른다"는 관리자 그리드 동작을 고정함
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCANNER_GRID_COLUMNS, scannerGridRow } from "./scanner-grid";

describe("scanner-grid — 4열 흐름", () => {
  it("기본 열 수는 4다", () => {
    assert.equal(SCANNER_GRID_COLUMNS, 4);
  });

  it("앞의 네 카드(0~3)는 첫 행에 있다", () => {
    for (let i = 0; i < 4; i += 1) {
      assert.equal(scannerGridRow(i), 0, `index ${i}`);
    }
  });

  it("5번째 카드(index 4)부터 다음 행으로 흐른다", () => {
    assert.equal(scannerGridRow(4), 1);
    assert.equal(scannerGridRow(7), 1);
    assert.equal(scannerGridRow(8), 2);
  });
});
