/**
 * 하드 삭제 되묻기의 **순수한 판정**만 직접 본다 (node:test + tsx).
 * fetch 를 타는 deleteScannerDevice/reconcileScannerDelete 는 훅·통합에서 다루고,
 * 여기서는 "GET 404 만 삭제됨" 규칙만 값으로 확인한다.
 *
 * 실행: npm --prefix apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteReconciliationFromError } from "./scanner-admin";
import { ApiError } from "./problem";

describe("deleteReconciliationFromError — 하드 삭제 되묻기는 404 만 '삭제됨'", () => {
  const err = (status: number, kind: "problem" | "unexpected" | "network" = "problem") =>
    new ApiError({ kind, status, code: `HTTP_${status}`, message: "x" });

  it("GET 404 는 기기 정체성 소멸 = 삭제 성공", () => {
    assert.equal(deleteReconciliationFromError(err(404)), "deleted");
  });

  it("401·403·409·500·503 은 미상 — 삭제됐다고 단정하지 않는다", () => {
    for (const status of [400, 401, 403, 409, 500, 503]) {
      assert.equal(deleteReconciliationFromError(err(status)), "unknown", `status ${status}`);
    }
  });

  it("네트워크 실패(status 0)도 미상 — 같은 키로 재시도해야 한다", () => {
    assert.equal(deleteReconciliationFromError(err(0, "network")), "unknown");
  });

  it("ApiError 가 아니면 미상", () => {
    assert.equal(deleteReconciliationFromError(new Error("boom")), "unknown");
    assert.equal(deleteReconciliationFromError(null), "unknown");
    assert.equal(deleteReconciliationFromError(undefined), "unknown");
  });
});
