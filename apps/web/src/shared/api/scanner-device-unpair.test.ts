/**
 * 해제 오류 분류의 순수한 판정만 직접 봄 (node:test + tsx)
 * fetch 를 타는 unpairCurrentScanner/reconcileScannerUnpair 는 훅·통합에서 다루고,
 * 여기서는 "DELETE 의 401/403 은 이미 해제됨, 그 외 4xx 는 실패, 5xx·네트워크는 미상"
 * 규칙만 값으로 확인함. reconcileScannerUnpair 도 이 분류를 그대로 공유함
 *
 * 실행: npm --prefix apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyUnpairError } from "./scanner-device-unpair";
import { ApiError } from "./problem";

describe("classifyUnpairError — DELETE /scanner/device/pairing 의 오류 분류", () => {
  const err = (status: number, kind: "problem" | "unexpected" | "network" | "aborted" = "problem") =>
    new ApiError({ kind, status, code: `HTTP_${status}`, message: "x" });

  it("401·403 은 세션이 이미 없다 = 이미 해제됨 (성공으로 마무리)", () => {
    assert.equal(classifyUnpairError(err(401)), "already-unpaired");
    assert.equal(classifyUnpairError(err(403)), "already-unpaired");
  });

  it("그 외 확정 4xx 는 진짜 실패로 남는다", () => {
    for (const status of [400, 404, 409, 410, 429]) {
      assert.equal(classifyUnpairError(err(status)), "definitive-failure", `status ${status}`);
    }
  });

  it("5xx 는 미상 — 되물어 화해하고 같은 키를 유지한다", () => {
    for (const status of [500, 502, 503]) {
      assert.equal(classifyUnpairError(err(status)), "indeterminate", `status ${status}`);
    }
  });

  it("네트워크 실패·취소(status 0)도 미상 — 같은 키를 유지해야 한다", () => {
    assert.equal(classifyUnpairError(err(0, "network")), "indeterminate");
    assert.equal(classifyUnpairError(err(0, "aborted")), "indeterminate");
  });

  it("ApiError 가 아니면 미상", () => {
    assert.equal(classifyUnpairError(new Error("boom")), "indeterminate");
    assert.equal(classifyUnpairError(null), "indeterminate");
    assert.equal(classifyUnpairError(undefined), "indeterminate");
  });
});
