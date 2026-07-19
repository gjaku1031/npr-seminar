import assert from "node:assert/strict";
import test from "node:test";
import { shouldRefreshStudentsAfterSync, type ObservedSyncRun } from "./sync-status-freshness";

const run = (identity: string, status: ObservedSyncRun["status"]): ObservedSyncRun => ({ identity, status });

test("첫 상태 로드와 실행 중 발견은 명부 재조회를 만들지 않는다", () => {
  assert.equal(shouldRefreshStudentsAfterSync(null, run("run-a", "SUCCEEDED")), false);
  assert.equal(shouldRefreshStudentsAfterSync(run("run-a", "FAILED"), run("run-b", "RUNNING")), false);
});

test("같은 실행이 끝나면 명부를 다시 읽는다", () => {
  assert.equal(shouldRefreshStudentsAfterSync(run("run-a", "RUNNING"), run("run-a", "SUCCEEDED")), true);
});

test("탭 밖에서 완료된 새 실행을 발견하면 명부를 다시 읽는다", () => {
  assert.equal(shouldRefreshStudentsAfterSync(run("run-a", "FAILED"), run("run-b", "SUCCEEDED")), true);
});

test("같은 완료 실행의 반복 조회는 명부를 중복 요청하지 않는다", () => {
  assert.equal(shouldRefreshStudentsAfterSync(run("run-a", "SUCCEEDED"), run("run-a", "SUCCEEDED")), false);
});
