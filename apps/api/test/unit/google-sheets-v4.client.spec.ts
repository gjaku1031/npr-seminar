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

const directories: string[] = [];
const serviceAccountEmail = "npr-sheets@example-project.iam.gserviceaccount.com";
const spreadsheetId = "test-spreadsheet-identifier-0001";

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

interface SheetDefinition {
  readonly sheetId: number;
  readonly title: string;
  readonly columnCount: number;
}

interface ProjectionFetchState {
  sheets: SheetDefinition[];
  rows: Map<string, string[]>;
  technicalSafe: boolean;
  technicalUsers: string[];
  technicalGroups: string[];
  domainUsersCanEdit: boolean;
  structuralWrites: unknown[][];
}

const reservationSheet: SheetDefinition = { sheetId: 1777564107, title: "예약명단", columnCount: 30 };
const summarySheet: SheetDefinition = { sheetId: 202607180, title: "예약집계", columnCount: 26 };
const logSheet: SheetDefinition = { sheetId: 1415280656, title: "로그", columnCount: 26 };
const reservationHeader = [...SHEET_BUSINESS_HEADERS, ...Array.from({ length: 17 }, () => ""), ""];
const summaryHeader = [...FAMILY_SUMMARY_BUSINESS_HEADERS, ...Array.from({ length: 12 }, () => ""), FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER];
const logHeader = [...BOOKING_LOG_BUSINESS_HEADERS, ...Array.from({ length: 12 }, () => ""), BOOKING_LOG_TECHNICAL_MARKER_HEADER];

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

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GoogleSheetsV4Client Drive sharing gate", () => {
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

describe("GoogleSheetsV4Client v4 workbook preparation", () => {
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
