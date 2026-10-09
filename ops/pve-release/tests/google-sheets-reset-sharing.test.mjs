// 개발용 Google Sheets 초기화 스크립트의 공유 안전 검사·지우기 요청 생성 테스트
// 실행: node --test ops/pve-release/tests/google-sheets-reset-sharing.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertSafePermissionSet,
  buildClearDataRequests,
  isMainModule,
} from "../google-sheets-reset-development-data.mjs";

// 테스트 서비스 계정 이메일
const serviceAccount = "npr-sheets-writer@example-project.iam.gserviceaccount.com";
// 서비스 계정에 직접 준 편집 권한
const directWriter = { type: "user", role: "writer", emailAddress: serviceAccount };

// 서비스 계정이 직접 편집자이고 나머지가 개별 사용자 공유뿐이면 통과
test("allows only directly shared users when the service account is a writer", () => {
  assert.doesNotThrow(() => assertSafePermissionSet([
    directWriter,
    { type: "user", role: "owner", emailAddress: "owner@example.com" },
    { type: "user", role: "reader", emailAddress: "operator@example.com" },
  ], serviceAccount));
});

// 링크가 있는 누구나(anyone) 공유는 역할과 무관하게 쓰기 전에 거부
for (const role of ["reader", "commenter", "writer"]) {
  test(`rejects anyone ${role} access before a Sheets write`, () => {
    assert.throws(
      () => assertSafePermissionSet([directWriter, { type: "anyone", role }], serviceAccount),
      /GOOGLE_SHEETS_UNSAFE_SHARING/,
    );
  });
}

// 개발용 예외를 켜면 anyone 편집자 공유만 허용
test("allows exactly anyone writer with the explicit development override", () => {
  assert.doesNotThrow(() => assertSafePermissionSet([
    directWriter,
    { type: "anyone", role: "writer" },
  ], serviceAccount, true));
});

// 개발용 예외도 anyone 의 읽기·댓글·소유 권한은 허용하지 않음
for (const role of ["reader", "commenter", "owner"]) {
  test(`does not waive anyone ${role} access with the development override`, () => {
    assert.throws(
      () => assertSafePermissionSet([directWriter, { type: "anyone", role }], serviceAccount, true),
      /GOOGLE_SHEETS_UNSAFE_SHARING/,
    );
  });
}

// 도메인·그룹 공유는 쓰기 전에 거부
for (const type of ["domain", "group"]) {
  test(`rejects ${type} sharing before a Sheets write`, () => {
    assert.throws(
      () => assertSafePermissionSet([directWriter, { type, role: "reader" }], serviceAccount),
      /GOOGLE_SHEETS_UNSAFE_SHARING/,
    );
  });
}

// 서비스 계정에 직접 편집 권한이 없으면 거부
test("requires a direct service-account writer grant", () => {
  assert.throws(
    () => assertSafePermissionSet([
      { type: "user", role: "reader", emailAddress: serviceAccount },
    ], serviceAccount),
    /GOOGLE_SHEETS_SERVICE_ACCOUNT_EDITOR_REQUIRED/,
  );
});

// 릴리스 current 심볼릭 링크로 실행해도 직접 실행으로 인식하고, 다른 모듈은 인식하지 않음
test("recognizes direct execution through the release current symlink", () => {
  const resetScriptPath = fileURLToPath(new URL("../google-sheets-reset-development-data.mjs", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "npr-sheets-main-"));
  const symlinkPath = join(directory, "current-reset.mjs");
  try {
    symlinkSync(resetScriptPath, symlinkPath);
    assert.equal(isMainModule(pathToFileURL(resetScriptPath).href, symlinkPath), true);
    assert.equal(isMainModule(import.meta.url, symlinkPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// 시트별로 행 범위가 제한된 값만 지우기 요청(서식·숨김 표식 열 포함)을 만듦
test("builds bounded value-only clears for visible and hidden marker cells", () => {
  const requests = buildClearDataRequests({
    예약명단: 1000,
    예약집계: 200,
    로그: 500,
  });
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0], {
    updateCells: {
      range: {
        sheetId: 1777564107,
        startRowIndex: 1,
        endRowIndex: 1000,
        startColumnIndex: 0,
        endColumnIndex: 30,
      },
      rows: [],
      fields: "userEnteredValue",
    },
  });
  assert.equal(requests[1].updateCells.range.endColumnIndex, 26);
  assert.equal(requests[2].updateCells.range.endRowIndex, 500);
});

// 행 수가 유효하지 않으면 초기화 전에 거부
test("rejects an invalid grid row count before reset", () => {
  assert.throws(
    () => buildClearDataRequests({ 예약명단: 0, 예약집계: 200, 로그: 500 }),
    /GOOGLE_SHEETS_GRID_ROW_COUNT_INVALID/,
  );
});
