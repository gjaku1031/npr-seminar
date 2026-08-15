/**
 * 공개 예약 캠퍼스 라벨 순수 테스트 (node:test + tsx).
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRANCH_LABELS, type Branch } from "../../../shared/api/contract";
import { publicBranchLabel } from "./publicBranchLabel";

describe("publicBranchLabel", () => {
  it("각 캠퍼스를 풀 라벨(…캠퍼스)로 반환한다", () => {
    assert.equal(publicBranchLabel("CAMPUS_A"), "A캠퍼스");
    assert.equal(publicBranchLabel("CAMPUS_B"), "B캠퍼스");
    assert.equal(publicBranchLabel("CAMPUS_C"), "C캠퍼스");
  });

  it("전역 짧은 라벨에 접미사 '캠퍼스'만 덧붙인다", () => {
    const branches: Branch[] = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"];
    for (const branch of branches) {
      assert.equal(publicBranchLabel(branch), `${BRANCH_LABELS[branch]}캠퍼스`);
    }
  });
});
