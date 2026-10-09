import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import {
  BOOKING_LOG_BUSINESS_HEADERS,
  BOOKING_LOG_TECHNICAL_MARKER_HEADER,
  FAMILY_SUMMARY_BUSINESS_HEADERS,
  FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
  SHEET_BUSINESS_HEADERS,
  SHEET_TECHNICAL_MARKER_HEADER,
} from "../../src/modules/google-sheets/google-sheets.gateway.js";
import { GoogleSheetsV4Client } from "../../src/modules/google-sheets/google-sheets-v4.client.js";

/**
 * 테스트가 만든 임시 디렉터리. 테스트 후 삭제
 */
const directories: string[] = [];

/**
 * 테스트 서비스 계정 이메일
 */
const serviceAccountEmail = "npr-sheets@example-project.iam.gserviceaccount.com";

/**
 * 테스트 스프레드시트 ID
 */
const spreadsheetId = "test-spreadsheet-identifier-0001";

/**
 * 임시 디렉터리에 0600 권한 서비스 계정 자격 증명 파일 생성
 *
 * @returns 자격 증명 파일 경로
 */
async function credentials(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "npr-sheets-client-"));
  directories.push(directory);
  const path = join(directory, "service-account.json");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await writeFile(path, JSON.stringify({
    client_email: serviceAccountEmail,
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  }), { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

/**
 * 시트 반영이 켜진 워커 실행 환경
 *
 * @param allowPublicWriterInDevelopment 개발 환경 공개 편집 허용 여부
 */
function environment(path: string, allowPublicWriterInDevelopment = false): AppEnvironment {
  return {
    appEnv: "test", processRole: "worker", port: 4000, trustProxy: 0, tongSyncEnabled: false,
    smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
    smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined }, smsAligoTestMode: true,
    googleSheetsEnabled: true, googleSheetsSpreadsheetId: spreadsheetId,
    googleSheetsAllowPublicWriterInDevelopment: allowPublicWriterInDevelopment,
    googleApplicationCredentials: path,
    sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
  };
}

/**
 * 가짜 스프레드시트의 시트 정의
 */
interface SheetDefinition {
  /**
   * 시트 ID
   */
  readonly sheetId: number;

  /**
   * 시트 제목
   */
  readonly title: string;

  /**
   * 열 수
   */
  readonly columnCount: number;
}

/**
 * 가짜 Google API 상태
 */
interface ProjectionFetchState {
  /**
   * 시트 목록
   */
  sheets: SheetDefinition[];

  /**
   * 범위별 머리글 행
   */
  rows: Map<string, string[]>;

  /**
   * 기술 표식 열 보호 안전 여부
   */
  technicalSafe: boolean;

  /**
   * 보호 범위 편집자 사용자
   */
  technicalUsers: string[];

  /**
   * 보호 범위 편집자 그룹
   */
  technicalGroups: string[];

  /**
   * 도메인 사용자 편집 허용 여부
   */
  domainUsersCanEdit: boolean;

  /**
   * 구조 변경 요청 기록
   */
  structuralWrites: unknown[][];
}

/**
 * 예약명단 시트 정의
 */
const reservationSheet: SheetDefinition = { sheetId: 1777564107, title: "예약명단", columnCount: 30 };

/**
 * 예약집계 시트 정의
 */
const summarySheet: SheetDefinition = { sheetId: 202607180, title: "예약집계", columnCount: 26 };

/**
 * 로그 시트 정의
 */
const logSheet: SheetDefinition = { sheetId: 1415280656, title: "로그", columnCount: 26 };

/**
 * 표식 머리글이 빈 예약명단 머리글
 */
const reservationHeader = [...SHEET_BUSINESS_HEADERS, ...Array.from({ length: 16 }, () => ""), ""];

/**
 * 예약집계 머리글
 */
const summaryHeader = [...FAMILY_SUMMARY_BUSINESS_HEADERS, ...Array.from({ length: 12 }, () => ""), FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER];

/**
 * 로그 머리글
 */
const logHeader = [...BOOKING_LOG_BUSINESS_HEADERS, ...Array.from({ length: 12 }, () => ""), BOOKING_LOG_TECHNICAL_MARKER_HEADER];

/**
 * Drive·Sheets API를 흉내 내는 fetch 대역
 *
 * @param overrides 기본 상태에 덮어쓸 값
 * @returns 상태와 fetch 대역
 */
function createProjectionFetch(overrides: Partial<ProjectionFetchState> = {}) {
  const state: ProjectionFetchState = {
    sheets: [reservationSheet, logSheet],
    rows: new Map([
      ["예약명단", [...reservationHeader]],
      ["로그", []],
    ]),
    technicalSafe: false,
    technicalUsers: [serviceAccountEmail, "owner@example.test"],
    technicalGroups: [],
    domainUsersCanEdit: false,
    structuralWrites: [],
    ...overrides,
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "unit-token", expires_in: 3600 }), { status: 200 });
    }
    if (url.includes("includeGridData=true")) {
      return new Response(JSON.stringify({ sheets: state.sheets
        .filter((sheet) => ["예약명단", "예약집계", "로그"].includes(sheet.title))
        .map((sheet) => {
          const markerIndex = sheet.title === "예약명단" ? 29 : 25;
          return {
            properties: { sheetId: sheet.sheetId, title: sheet.title },
            data: [{ columnMetadata: [{ hiddenByUser: state.technicalSafe }] }],
            protectedRanges: state.technicalSafe ? [{
              warningOnly: false,
              requestingUserCanEdit: true,
              range: { sheetId: sheet.sheetId, startColumnIndex: markerIndex, endColumnIndex: markerIndex + 1 },
              editors: {
                users: state.technicalUsers,
                groups: state.technicalGroups,
                domainUsersCanEdit: state.domainUsersCanEdit,
              },
            }] : [],
          };
        }) }), { status: 200 });
    }
    if (url.includes("/values:batchGet?")) {
      const ranges = new URL(url).searchParams.getAll("ranges");
      return new Response(JSON.stringify({ valueRanges: ranges.map((range) => {
        const title = range.split("!")[0]!;
        const row = state.rows.get(title) ?? [];
        return { range, values: row.length === 0 ? [] : [row] };
      }) }), { status: 200 });
    }
    if (url.endsWith(":batchUpdate")) {
      const body = JSON.parse(String(init?.body)) as { requests?: Array<Record<string, any>> };
      const requests = body.requests ?? [];
      state.structuralWrites.push(requests);
      for (const request of requests) {
        const add = request.addSheet?.properties;
        if (add !== undefined) {
          state.sheets.push({
            sheetId: Number(add.sheetId),
            title: String(add.title),
            columnCount: Number(add.gridProperties?.columnCount),
          });
          state.rows.set(String(add.title), []);
        }
        const update = request.updateCells;
        if (update !== undefined) {
          const sheet = state.sheets.find((item) => item.sheetId === update.range?.sheetId);
          if (sheet !== undefined) {
            const row = state.rows.get(sheet.title) ?? [];
            const start = Number(update.range?.startColumnIndex ?? 0);
            const values = update.rows?.[0]?.values ?? [];
            values.forEach((cell: { userEnteredValue?: { stringValue?: string } }, index: number) => {
              row[start + index] = cell.userEnteredValue?.stringValue ?? "";
            });
            state.rows.set(sheet.title, row);
          }
        }
      }
      if (requests.some((request) => request.addProtectedRange !== undefined)) state.technicalSafe = true;
      return new Response("{}", { status: 200 });
    }
    if (url.includes("sheets.googleapis.com/v4/spreadsheets/")) {
      return new Response(JSON.stringify({
        properties: { locale: "ko_KR", timeZone: "Asia/Seoul" },
        sheets: state.sheets.map((sheet) => ({ properties: {
          sheetId: sheet.sheetId,
          title: sheet.title,
          gridProperties: { columnCount: sheet.columnCount },
        } })),
      }), { status: 200 });
    }
    if (url.includes("/permissions?")) {
      return new Response(JSON.stringify({ permissions: [
        { type: "user", role: "writer", emailAddress: serviceAccountEmail },
      ] }), { status: 200 });
    }
    if (url.includes("www.googleapis.com/drive/v3/files/")) {
      if (url.includes("fields=owners")) {
        return new Response(JSON.stringify({ owners: [{ emailAddress: "owner@example.test" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        mimeType: "application/vnd.google-apps.spreadsheet",
        trashed: false,
        capabilities: { canEdit: true },
      }), { status: 200 });
    }
    throw new Error(`unexpected request: ${url}`);
  });
  return { state, fetchMock };
}

// 전역 fetch 복원과 임시 디렉터리 삭제
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

// Drive 공유 설정 안전성 검사
describe("GoogleSheetsV4Client Drive sharing gate", () => {
  // 링크 공개 편집·도메인·그룹 권한은 안전하지 않은 공유로 거부
  it.each([
    ["anyone", "writer", "WORKBOOK_LINK_WRITER_ACCESS"],
    ["domain", "reader", "WORKBOOK_DOMAIN_ACCESS"],
    ["group", "writer", "WORKBOOK_GROUP_WRITER_ACCESS"],
  ] as const)("fails closed for %s %s permission", async (type, role, code) => {
    const path = await credentials();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "unit-token", expires_in: 3600 }), { status: 200 });
      }
      if (url.includes("/permissions?")) return new Response(JSON.stringify({ permissions: [
        { type: "user", role: "writer", emailAddress: serviceAccountEmail },
        { type, role },
      ] }), { status: 200 });
      return new Response(JSON.stringify({
        mimeType: "application/vnd.google-apps.spreadsheet",
        trashed: false,
        capabilities: { canEdit: true },
      }), { status: 200 });
    }));
    await expect(new GoogleSheetsV4Client(environment(path)).assertSafeSharing(spreadsheetId))
      .rejects.toMatchObject({ code });
  });

  // 링크 공개 읽기·댓글 권한도 거부
  it.each(["reader", "commenter"] as const)("fails closed for public %s access", async (role) => {
    const path = await credentials();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "unit-token", expires_in: 3600 }), { status: 200 });
      }
      if (url.includes("/permissions?")) return new Response(JSON.stringify({ permissions: [
        { type: "user", role: "writer", emailAddress: serviceAccountEmail },
        { type: "anyone", role },
      ] }), { status: 200 });
      return new Response(JSON.stringify({
        mimeType: "application/vnd.google-apps.spreadsheet",
        trashed: false,
        capabilities: { canEdit: true },
      }), { status: 200 });
    }));
    await expect(new GoogleSheetsV4Client(environment(path)).assertSafeSharing(spreadsheetId))
      .rejects.toMatchObject({ code: "WORKBOOK_PUBLIC_ACCESS" });
  });

  // 개발 예외 설정이 있을 때만 링크 공개 편집 허용(활성화·반영 모두)
  it.each(["ACTIVATION", "DISPATCH"] as const)(
    "allows an anyone writer only with the explicit development override during %s",
    async (access) => {
      const path = await credentials();
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "unit-token", expires_in: 3600 }), { status: 200 });
        }
        if (url.includes("/permissions?")) return new Response(JSON.stringify({ permissions: [
          { type: "anyone", role: "writer" },
          { type: "user", role: "writer", emailAddress: serviceAccountEmail },
        ] }), { status: 200 });
        return new Response(JSON.stringify({
          mimeType: "application/vnd.google-apps.spreadsheet",
          trashed: false,
          capabilities: { canEdit: true },
        }), { status: 200 });
      }));

      await expect(new GoogleSheetsV4Client(environment(path, true)).assertSafeSharing(spreadsheetId, access))
        .resolves.toBeUndefined();
    },
  );

  // 개발 예외 설정이 있어도 공개 읽기·소유자·도메인·그룹 권한은 계속 거부
  it.each([
    ["anyone", "reader", "WORKBOOK_PUBLIC_ACCESS"],
    ["anyone", "owner", "WORKBOOK_LINK_WRITER_ACCESS"],
    ["domain", "writer", "WORKBOOK_DOMAIN_WRITER_ACCESS"],
    ["group", "writer", "WORKBOOK_GROUP_WRITER_ACCESS"],
  ] as const)("does not waive %s %s access when the development override is on", async (type, role, code) => {
    const path = await credentials();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "unit-token", expires_in: 3600 }), { status: 200 });
      }
      if (url.includes("/permissions?")) return new Response(JSON.stringify({ permissions: [
        { type: "user", role: "writer", emailAddress: serviceAccountEmail },
        { type, role },
      ] }), { status: 200 });
      return new Response(JSON.stringify({
        mimeType: "application/vnd.google-apps.spreadsheet",
        trashed: false,
        capabilities: { canEdit: true },
      }), { status: 200 });
    }));

    await expect(new GoogleSheetsV4Client(environment(path, true)).assertSafeSharing(spreadsheetId))
      .rejects.toMatchObject({ code });
  });
});

// v4 스프레드시트 준비
describe("GoogleSheetsV4Client v4 workbook preparation", () => {
  // 예약집계 생성, 빈 로그 머리글 초기화, 세 표식 열 보호를 멱등하게 수행
  it("creates 예약집계, initializes blank 로그, and protects all three marker columns idempotently", async () => {
    const path = await credentials();
    const { state, fetchMock } = createProjectionFetch();
    vi.stubGlobal("fetch", fetchMock);
    const client = new GoogleSheetsV4Client(environment(path));

    await expect(client.ensureTechnicalMarkerColumn(spreadsheetId, SHEET_TECHNICAL_MARKER_HEADER))
      .resolves.toBeUndefined();
    expect(state.sheets).toContainEqual(summarySheet);
    expect(state.rows.get("예약명단")?.[29]).toBe(SHEET_TECHNICAL_MARKER_HEADER);
    expect(state.rows.get("예약집계")).toEqual(summaryHeader);
    expect(state.rows.get("로그")).toEqual(logHeader);
    expect(state.technicalSafe).toBe(true);
    const writeCount = state.structuralWrites.length;

    await expect(client.ensureTechnicalMarkerColumn(spreadsheetId, SHEET_TECHNICAL_MARKER_HEADER))
      .resolves.toBeUndefined();
    expect(state.structuralWrites).toHaveLength(writeCount);
    const metadata = await client.metadata(spreadsheetId, "ACTIVATION");
    expect(metadata.technicalColumns).toHaveLength(3);
    expect(metadata.technicalColumns.every((column) => column.hidden && column.protected
      && column.requestingUserCanEdit && column.editorsRestrictedToServiceAccount)).toBe(true);
  });

  // 시트 누락·열 수 불일치·ID 불일치·제목 충돌은 준비 쓰기 전에 차단
  it.each([
    ["missing reservation", [logSheet]],
    ["wrong reservation width", [{ ...reservationSheet, columnCount: 31 }, logSheet]],
    ["missing log", [reservationSheet]],
    ["wrong log id", [reservationSheet, { ...logSheet, sheetId: 2 }]],
    ["summary title conflict", [reservationSheet, logSheet, { ...summarySheet, sheetId: 3 }]],
  ] as const)("blocks %s before workbook preparation writes", async (_label, sheets) => {
    const path = await credentials();
    const { state, fetchMock } = createProjectionFetch({ sheets: [...sheets] });
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GoogleSheetsV4Client(environment(path)).ensureTechnicalMarkerColumn(
      spreadsheetId,
      SHEET_TECHNICAL_MARKER_HEADER,
    )).rejects.toMatchObject({ code: "GOOGLE_SHEETS_SCHEMA_DRIFT" });
    expect(state.structuralWrites).toHaveLength(0);
  });

  // 비어 있지 않은 다른 로그 머리글은 덮어쓰지 않고 거부
  it("rejects nonblank conflicting log headers without overwriting them", async () => {
    const path = await credentials();
    const { state, fetchMock } = createProjectionFetch();
    state.rows.set("로그", ["수동 열"]);
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GoogleSheetsV4Client(environment(path)).ensureTechnicalMarkerColumn(
      spreadsheetId,
      SHEET_TECHNICAL_MARKER_HEADER,
    )).rejects.toMatchObject({ code: "GOOGLE_SHEETS_HEADER_DRIFT" });
    expect(state.rows.get("로그")).toEqual(["수동 열"]);
    expect(state.structuralWrites).toHaveLength(0);
  });

  // 관계없는 편집자에게 권한을 준 기존 표식 보호 범위는 거부
  it("rejects an existing protected marker that grants an unrelated editor access", async () => {
    const path = await credentials();
    const { fetchMock } = createProjectionFetch({
      technicalSafe: true,
      technicalUsers: [serviceAccountEmail, "owner@example.test", "other@example.test"],
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(new GoogleSheetsV4Client(environment(path)).ensureTechnicalMarkerColumn(
      spreadsheetId,
      SHEET_TECHNICAL_MARKER_HEADER,
    )).rejects.toMatchObject({ code: "GOOGLE_SHEETS_TECHNICAL_COLUMN_UNSAFE" });
  });
});
