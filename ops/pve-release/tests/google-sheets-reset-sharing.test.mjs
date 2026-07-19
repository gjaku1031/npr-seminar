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

const serviceAccount = "npr-sheets-writer@ken-common-project.iam.gserviceaccount.com";
const directWriter = { type: "user", role: "writer", emailAddress: serviceAccount };

test("allows only directly shared users when the service account is a writer", () => {
  assert.doesNotThrow(() => assertSafePermissionSet([
    directWriter,
    { type: "user", role: "owner", emailAddress: "owner@example.com" },
    { type: "user", role: "reader", emailAddress: "operator@example.com" },
  ], serviceAccount));
});

for (const role of ["reader", "commenter", "writer"]) {
  test(`rejects anyone ${role} access before a Sheets write`, () => {
    assert.throws(
      () => assertSafePermissionSet([directWriter, { type: "anyone", role }], serviceAccount),
      /GOOGLE_SHEETS_UNSAFE_SHARING/,
    );
  });
}

test("allows exactly anyone writer with the explicit development override", () => {
  assert.doesNotThrow(() => assertSafePermissionSet([
    directWriter,
    { type: "anyone", role: "writer" },
  ], serviceAccount, true));
});

for (const role of ["reader", "commenter", "owner"]) {
  test(`does not waive anyone ${role} access with the development override`, () => {
    assert.throws(
      () => assertSafePermissionSet([directWriter, { type: "anyone", role }], serviceAccount, true),
      /GOOGLE_SHEETS_UNSAFE_SHARING/,
    );
  });
}

for (const type of ["domain", "group"]) {
  test(`rejects ${type} sharing before a Sheets write`, () => {
    assert.throws(
      () => assertSafePermissionSet([directWriter, { type, role: "reader" }], serviceAccount),
      /GOOGLE_SHEETS_UNSAFE_SHARING/,
    );
  });
}

test("requires a direct service-account writer grant", () => {
  assert.throws(
    () => assertSafePermissionSet([
      { type: "user", role: "reader", emailAddress: serviceAccount },
    ], serviceAccount),
    /GOOGLE_SHEETS_SERVICE_ACCOUNT_EDITOR_REQUIRED/,
  );
});

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

test("rejects an invalid grid row count before reset", () => {
  assert.throws(
    () => buildClearDataRequests({ 예약명단: 0, 예약집계: 200, 로그: 500 }),
    /GOOGLE_SHEETS_GRID_ROW_COUNT_INVALID/,
  );
});
