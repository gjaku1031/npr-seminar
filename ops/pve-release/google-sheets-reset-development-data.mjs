// 개발용 Google Sheets 워크북의 데이터 행만 지우는 명령. 머리 행·서식·검증·숨김 표식 열 보호는 유지
// 실행: google-sheets-reset-development-data.sh 가 워커 계정·env 로 실행. 모드·확인 값은 환경 변수로 받음
//   NPR_SHEETS_RESET_MODE=preflight|execute, NPR_CONFIRMED_SPREADSHEET_ID, NPR_SHEETS_RESET_CONFIRMATION(execute)
// 결과는 JSON 한 줄로 출력. 실패하면 오류 코드를 stderr 에 쓰고 종료 코드 1

import { createSign } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * 허용된 개발용 스프레드시트 ID
 */
const expectedSpreadsheetId = "EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx";

/**
 * execute 확인 문구
 */
const expectedConfirmation = `CLEAR NPR DEVELOPMENT SHEETS ${expectedSpreadsheetId}`;

/**
 * Google OAuth 토큰 발급 주소
 */
const googleTokenUri = "https://oauth2.googleapis.com/token";

/**
 * 서비스 계정 권한 범위. 시트 편집과 Drive 메타데이터 읽기
 */
const serviceAccountScopes = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly";

/**
 * 초기화 대상 탭. 탭 ID·열 수·머리 행·표식 열 위치
 */
const targets = [
  {
    title: "예약명단",
    sheetId: 1777564107,
    columnCount: 30,
    headerRange: "예약명단!A1:AD1",
    dataRange: "예약명단!A2:AD",
    markerIndex: 29,
    header: [
      "예약일시", "학번", "캠퍼스", "학생명", "반명", "학교", "학년", "담임",
      "학부모HP (모)", "학부모HP (부)", "예약상태", "로그",
      ...Array.from({ length: 17 }, () => ""),
      "__NPR_FAMILY_BOOKING_STUDENT_ID",
    ],
  },
  {
    title: "예약집계",
    sheetId: 202607180,
    columnCount: 26,
    headerRange: "예약집계!A1:Z1",
    dataRange: "예약집계!A2:Z",
    markerIndex: 25,
    header: [
      "예약일시", "가족예약ID", "캠퍼스", "학생명 목록", "참석자", "예약건수", "예약인원",
      "입장건수", "입장인원", "상태", "예약경로", "체크인시각", "최신로그",
      ...Array.from({ length: 12 }, () => ""),
      "__NPR_FAMILY_BOOKING_ID",
    ],
  },
  {
    title: "로그",
    sheetId: 1415280656,
    columnCount: 26,
    headerRange: "로그!A1:Z1",
    dataRange: "로그!A2:Z",
    markerIndex: 25,
    header: [
      "이벤트일시", "이벤트", "가족예약ID", "캠퍼스", "학생수", "학생명", "참석자",
      "예약인원", "입장인원", "예약상태", "예약경로", "처리자", "로그",
      ...Array.from({ length: 12 }, () => ""),
      "__NPR_BOOKING_EVENT_ID",
    ],
  },
];

/**
 * 오류 코드로 예외를 던짐
 */
function fail(code) {
  throw new Error(code);
}

/**
 * JSON 값을 base64url 로 인코딩
 */
function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * 서비스 계정 키로 JWT 를 서명해 접근 토큰 발급
 */
async function accessToken(credentialPath) {
  const raw = await readFile(credentialPath, "utf8");
  const account = JSON.parse(raw);
  if (typeof account.client_email !== "string" || !account.client_email.endsWith(".iam.gserviceaccount.com")
    || typeof account.private_key !== "string" || account.private_key.length < 100
    || account.token_uri !== googleTokenUri) {
    fail("GOOGLE_SHEETS_CREDENTIAL_INVALID");
  }
  const now = Math.floor(Date.now() / 1_000);
  const unsigned = `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url({
    iss: account.client_email,
    scope: serviceAccountScopes,
    aud: googleTokenUri,
    iat: now,
    exp: now + 600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(account.private_key, "base64url");
  const response = await fetch(googleTokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!response.ok) fail("GOOGLE_SHEETS_TOKEN_REJECTED");
  const payload = await response.json();
  if (typeof payload.access_token !== "string" || payload.access_token.length < 20) {
    fail("GOOGLE_SHEETS_TOKEN_INVALID");
  }
  return { token: payload.access_token, email: account.client_email };
}

/**
 * 토큰을 붙인 JSON 요청. 2xx 가 아니면 HTTP 상태 오류 코드로 실패
 */
async function requestJson(token, method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) fail(`GOOGLE_SHEETS_HTTP_${response.status}`);
  return response.status === 204 ? {} : response.json();
}

/**
 * 공유 권한이 안전한지 확인. 서비스 계정 직접 편집 권한은 필수
 * anyone·domain·group 공유는 거부하고, 개발용 예외가 켜졌을 때만 anyone 편집자를 허용
 */
export function assertSafePermissionSet(permissions, email, allowPublicWriterInDevelopment = false) {
  let directWriter = false;
  for (const permission of permissions ?? []) {
    if (permission.deleted === true) continue;
    const writable = ["owner", "organizer", "fileOrganizer", "writer"].includes(permission.role ?? "");
    if (permission.type === "user" && permission.emailAddress === email && writable) directWriter = true;
    // 예약 행에 학부모 전체 연락처가 있으므로 링크 공개 읽기도 공개 편집만큼 위험함
    if (permission.type === "anyone" && permission.role === "writer" && allowPublicWriterInDevelopment) {
      continue;
    }
    if (permission.type === "anyone" || permission.type === "domain" || permission.type === "group") {
      fail("GOOGLE_SHEETS_UNSAFE_SHARING");
    }
  }
  if (!directWriter) fail("GOOGLE_SHEETS_SERVICE_ACCOUNT_EDITOR_REQUIRED");
}

/**
 * 이 모듈이 직접 실행됐는지. release/current 심볼릭 링크로 실행해도 실제 경로로 비교
 */
export function isMainModule(moduleUrl, argvPath) {
  if (typeof argvPath !== "string" || argvPath === "") return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    // 시작 뒤 확인 사이에 경로가 사라지면 일반 직접 실행 판정으로 대신함
    // release/current 심볼릭 링크 실행을 가능하게 하는 것은 위의 realpath 비교임
    return moduleUrl === pathToFileURL(argvPath).href;
  }
}

/**
 * 워크북 형식·편집 권한·공유 목록 전체·소유자 확인. 소유자 이메일 집합을 돌려줌
 */
async function assertSafeSharing(token, email) {
  const base = `https://www.googleapis.com/drive/v3/files/${expectedSpreadsheetId}`;
  const file = await requestJson(token, "GET", `${base}?supportsAllDrives=true&fields=id,mimeType,trashed,capabilities(canEdit)`);
  if (file.mimeType !== "application/vnd.google-apps.spreadsheet" || file.trashed === true) {
    fail("GOOGLE_SHEETS_WORKBOOK_INVALID");
  }
  if (file.capabilities?.canEdit !== true) fail("GOOGLE_SHEETS_SERVICE_ACCOUNT_EDITOR_REQUIRED");
  const permissions = await requestJson(
    token,
    "GET",
    `${base}/permissions?supportsAllDrives=true&pageSize=100&fields=nextPageToken,permissions(type,role,deleted,emailAddress)`,
  );
  if (typeof permissions.nextPageToken === "string" && permissions.nextPageToken !== "") {
    fail("GOOGLE_SHEETS_PERMISSION_LIST_INCOMPLETE");
  }
  assertSafePermissionSet(
    permissions.permissions,
    email,
    process.env.GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT === "true",
  );
  const ownerPayload = await requestJson(token, "GET", `${base}?supportsAllDrives=true&fields=owners(emailAddress)`);
  const owners = new Set((ownerPayload.owners ?? []).map((owner) => String(owner.emailAddress ?? "").toLowerCase()).filter(Boolean));
  if (owners.size === 0) fail("GOOGLE_SHEETS_OWNER_REQUIRED");
  return owners;
}

/**
 * 머리 행이 기대값과 정확히 같은지
 */
function sameHeader(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => String(value ?? "") === expected[index]);
}

/**
 * 값이 하나라도 있는 행 수
 */
function nonEmptyRowCount(rows) {
  return rows.filter((row) => row.some((value) => String(value ?? "") !== "")).length;
}

/**
 * 탭별 2행부터 그리드 끝까지 값만 지우는 batchUpdate 요청 생성. 행이 1개뿐이면 요청 없음
 */
export function buildClearDataRequests(gridRowCounts) {
  return targets.flatMap((target) => {
    const rowCount = gridRowCounts[target.title];
    if (!Number.isSafeInteger(rowCount) || rowCount < 1) {
      fail("GOOGLE_SHEETS_GRID_ROW_COUNT_INVALID");
    }
    if (rowCount === 1) return [];
    return [{
      updateCells: {
        range: {
          sheetId: target.sheetId,
          startRowIndex: 1,
          endRowIndex: rowCount,
          startColumnIndex: 0,
          endColumnIndex: target.columnCount,
        },
        // 행 데이터 없이 updateCells 범위를 주면 지정 필드만 지워짐
        // 보이는 업무 열과 숨김·보호 표식 열의 입력 값을 함께 지우고 서식·검증·1행은 유지함
        rows: [],
        fields: "userEnteredValue",
      },
    }];
  });
}

/**
 * 여러 범위 값을 한 번에 읽음
 */
async function valuesBatchGet(token, ranges) {
  const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join("&");
  const payload = await requestJson(
    token,
    "GET",
    `https://sheets.googleapis.com/v4/spreadsheets/${expectedSpreadsheetId}/values:batchGet?majorDimension=ROWS&${query}`,
  );
  return ranges.map((_range, index) => payload.valueRanges?.[index]?.values ?? []);
}

/**
 * 워크북 로캘·시간대·탭 구조·표식 열 숨김·보호 편집자·머리 행 확인 후 그리드 행 수와 비어 있지 않은 행 수를 돌려줌
 */
async function inspect(token, email, owners) {
  const identityMetadata = await requestJson(
    token,
    "GET",
    `https://sheets.googleapis.com/v4/spreadsheets/${expectedSpreadsheetId}?fields=properties(locale,timeZone),sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`,
  );
  if (identityMetadata.properties?.locale !== "ko_KR" || identityMetadata.properties?.timeZone !== "Asia/Seoul") {
    fail("GOOGLE_SHEETS_WORKBOOK_LOCALE_DRIFT");
  }
  const gridRowCounts = {};
  for (const target of targets) {
    const candidates = (identityMetadata.sheets ?? []).filter((sheet) => sheet.properties?.sheetId === target.sheetId
      || sheet.properties?.title === target.title);
    if (candidates.length !== 1) fail("GOOGLE_SHEETS_SCHEMA_DRIFT");
    const sheet = candidates[0];
    if (sheet.properties?.sheetId !== target.sheetId || sheet.properties?.title !== target.title
      || sheet.properties?.gridProperties?.columnCount !== target.columnCount) {
      fail("GOOGLE_SHEETS_SCHEMA_DRIFT");
    }
    const rowCount = sheet.properties?.gridProperties?.rowCount;
    if (!Number.isSafeInteger(rowCount) || rowCount < 1) fail("GOOGLE_SHEETS_GRID_ROW_COUNT_INVALID");
    gridRowCounts[target.title] = rowCount;
  }

  const rangeQuery = targets
    .map((target) => `ranges=${encodeURIComponent(`${target.title}!${target.markerIndex === 29 ? "AD:AD" : "Z:Z"}`)}`)
    .join("&");
  const metadata = await requestJson(
    token,
    "GET",
    `https://sheets.googleapis.com/v4/spreadsheets/${expectedSpreadsheetId}?includeGridData=true&${rangeQuery}&fields=sheets(properties(sheetId,title),data.columnMetadata.hiddenByUser,protectedRanges(range(sheetId,startColumnIndex,endColumnIndex),warningOnly,requestingUserCanEdit,editors(users,groups,domainUsersCanEdit)))`,
  );
  const allowedEditors = new Set([email.toLowerCase(), ...owners]);
  for (const target of targets) {
    const sheet = (metadata.sheets ?? []).find((candidate) => candidate.properties?.sheetId === target.sheetId
      && candidate.properties?.title === target.title);
    if (sheet === undefined) fail("GOOGLE_SHEETS_SCHEMA_DRIFT");
    const hidden = (sheet.data ?? []).some((data) => (data.columnMetadata ?? []).some((column) => column.hiddenByUser === true));
    const protection = (sheet.protectedRanges ?? []).find((item) => item.warningOnly !== true
      && item.range?.sheetId === target.sheetId
      && (item.range?.startColumnIndex ?? 0) <= target.markerIndex
      && (item.range?.endColumnIndex ?? Number.MAX_SAFE_INTEGER) >= target.markerIndex + 1);
    const editors = new Set((protection?.editors?.users ?? []).map((value) => String(value).toLowerCase()));
    if (!hidden || protection?.requestingUserCanEdit !== true || !editors.has(email.toLowerCase())
      || protection?.editors?.domainUsersCanEdit === true || (protection?.editors?.groups?.length ?? 0) > 0
      || [...editors].some((editor) => !allowedEditors.has(editor))) {
      fail("GOOGLE_SHEETS_TECHNICAL_COLUMN_UNSAFE");
    }
  }
  const headerRows = await valuesBatchGet(token, targets.map((target) => target.headerRange));
  headerRows.forEach((rows, index) => {
    if (!sameHeader(rows[0] ?? [], targets[index].header)) fail("GOOGLE_SHEETS_HEADER_DRIFT");
  });
  const dataRows = await valuesBatchGet(token, targets.map((target) => target.dataRange));
  return {
    gridRowCounts,
    nonEmptyRows: Object.fromEntries(
      targets.map((target, index) => [target.title, nonEmptyRowCount(dataRows[index] ?? [])]),
    ),
  };
}

/**
 * 인자 확인 → 토큰 → 공유 확인 → 점검 → (execute 면) 지우기 → 재점검·결과 출력
 */
async function main() {
  const mode = process.env.NPR_SHEETS_RESET_MODE;
  const configuredSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const confirmedSpreadsheetId = process.env.NPR_CONFIRMED_SPREADSHEET_ID;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if ((mode !== "preflight" && mode !== "execute") || configuredSpreadsheetId !== expectedSpreadsheetId
    || confirmedSpreadsheetId !== expectedSpreadsheetId || typeof credentialPath !== "string" || credentialPath === "") {
    fail("GOOGLE_SHEETS_DEVELOPMENT_RESET_ARGUMENTS_INVALID");
  }
  if (mode === "execute" && process.env.NPR_SHEETS_RESET_CONFIRMATION !== expectedConfirmation) {
    fail("GOOGLE_SHEETS_DEVELOPMENT_RESET_CONFIRMATION_INVALID");
  }
  const account = await accessToken(credentialPath);
  const owners = await assertSafeSharing(account.token, account.email);
  const before = await inspect(account.token, account.email, owners);
  if (mode === "execute") {
    const requests = buildClearDataRequests(before.gridRowCounts);
    if (requests.length > 0) {
      await requestJson(
        account.token,
        "POST",
        `https://sheets.googleapis.com/v4/spreadsheets/${expectedSpreadsheetId}:batchUpdate`,
        { requests },
      );
    }
  }
  const after = await inspect(account.token, account.email, owners);
  if (mode === "execute" && Object.values(after.nonEmptyRows).some((count) => count !== 0)) {
    fail("GOOGLE_SHEETS_DEVELOPMENT_RESET_POST_VERIFY_FAILED");
  }
  process.stdout.write(`${JSON.stringify({
    mode,
    spreadsheetId: expectedSpreadsheetId,
    tabs: targets.map((target) => ({ title: target.title, sheetId: target.sheetId })),
    rowsBefore: before.nonEmptyRows,
    rowsAfter: after.nonEmptyRows,
    headersPreserved: true,
  })}\n`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "GOOGLE_SHEETS_DEVELOPMENT_RESET_FAILED"}\n`);
    process.exitCode = 1;
  });
}
