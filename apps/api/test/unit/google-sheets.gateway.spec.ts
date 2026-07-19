import { describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import {
  BOOKING_LOG_BUSINESS_HEADERS,
  BOOKING_LOG_TECHNICAL_MARKER_HEADER,
  FAMILY_SUMMARY_BUSINESS_HEADERS,
  FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
  GoogleSheetsGateway,
  SHEET_BUSINESS_HEADERS,
  SHEET_SCHEMA_DESCRIPTOR,
  SHEET_SCHEMA_FINGERPRINT,
  SHEET_SCHEMA_VERSION,
  SHEET_TECHNICAL_MARKER_HEADER,
  type SheetDispatchPlan,
} from "../../src/modules/google-sheets/google-sheets.gateway.js";
import {
  SheetsClient,
  SheetsClientError,
  type SheetsMetadata,
  type SheetsValueRange,
} from "../../src/modules/google-sheets/google-sheets-v4.client.js";

const spreadsheetId = "1hOYWwKHpk_tchht6MVQ1dEwoW9iT7qJbzQRlLXUKpP0";
const reservationHeader = [...SHEET_BUSINESS_HEADERS, ...Array.from({ length: 17 }, () => ""), ""];
const summaryHeader = [...FAMILY_SUMMARY_BUSINESS_HEADERS, ...Array.from({ length: 12 }, () => ""), FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER];
const logHeader = [...BOOKING_LOG_BUSINESS_HEADERS, ...Array.from({ length: 12 }, () => ""), BOOKING_LOG_TECHNICAL_MARKER_HEADER];

class FakeSheetsClient extends SheetsClient {
  public readonly rows = new Map<string, string[][]>([
    ["예약명단", [[...reservationHeader]]],
    ["로그", [[]]],
  ]);
  public sheets = [
    { sheetId: 1777564107, title: "예약명단", columnCount: 30 },
    { sheetId: 1415280656, title: "로그", columnCount: 26 },
  ];
  public safe = false;
  public prepareMutations = 0;
  public nextError: SheetsClientError | null = null;
  public commitBeforeError = false;
  public corruptAfterWrite: (() => void) | null = null;
  public readonly writes: string[] = [];

  public assertSafeSharing(): Promise<void> { return Promise.resolve(); }

  public metadata(): Promise<SheetsMetadata> {
    return Promise.resolve({
      locale: "ko_KR",
      timeZone: "Asia/Seoul",
      driveOwnersPresent: true,
      sheets: this.sheets,
      technicalColumns: this.sheets.flatMap((sheet) => ["예약명단", "예약집계", "로그"].includes(sheet.title)
        ? [{
          sheetId: sheet.sheetId,
          title: sheet.title,
          hidden: this.safe,
          protected: this.safe,
          requestingUserCanEdit: this.safe,
          editorsRestrictedToServiceAccount: this.safe,
        }]
        : []),
    });
  }

  public ensureTechnicalMarkerColumn(_id: string, marker: string): Promise<void> {
    if (marker !== SHEET_TECHNICAL_MARKER_HEADER) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_TECHNICAL_HEADER_CONFLICT");
    }
    const reservation = this.rows.get("예약명단")?.[0] ?? [];
    if (reservation.slice(0, SHEET_BUSINESS_HEADERS.length).some((value, index) => value !== SHEET_BUSINESS_HEADERS[index])
      || (reservation[29] ?? "") !== "" && reservation[29] !== marker) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_HEADER_DRIFT");
    }
    if (!this.rows.has("예약집계")) {
      this.sheets.push({ sheetId: 202607180, title: "예약집계", columnCount: 26 });
      this.rows.set("예약집계", [[...summaryHeader]]);
      this.prepareMutations += 1;
    }
    if ((reservation[29] ?? "") === "") {
      reservation[29] = marker;
      this.prepareMutations += 1;
    }
    const log = this.rows.get("로그")?.[0] ?? [];
    if (log.every((value) => value === "")) {
      this.rows.set("로그", [[...logHeader]]);
      this.prepareMutations += 1;
    }
    if (!this.safe) {
      this.safe = true;
      this.prepareMutations += 6;
    }
    return Promise.resolve();
  }

  public batchGet(_id: string, ranges: readonly string[]): Promise<Readonly<Record<string, readonly (readonly string[])[]>>> {
    return Promise.resolve(Object.fromEntries(ranges.map((range) => {
      const title = range.split("!")[0]!;
      return [range, this.rows.get(title) ?? []];
    })));
  }

  public batchUpdate(_id: string, data: readonly SheetsValueRange[]): Promise<void> {
    if (this.nextError !== null && !this.commitBeforeError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    for (const entry of data) {
      this.writes.push(entry.range);
      this.write(entry);
    }
    this.corruptAfterWrite?.();
    if (this.nextError !== null) {
      const error = this.nextError;
      this.nextError = null;
      this.commitBeforeError = false;
      throw error;
    }
    return Promise.resolve();
  }

  private write(entry: SheetsValueRange): void {
    const [title, a1 = ""] = entry.range.split("!");
    const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+)?)?$/u.exec(a1);
    if (title === undefined || match === null) throw new Error(`bad range ${entry.range}`);
    const rows = this.rows.get(title);
    if (rows === undefined) throw new Error(`unknown sheet ${title}`);
    const rowIndex = Number(match[2]) - 1;
    while (rows.length <= rowIndex) rows.push([]);
    const target = rows[rowIndex]!;
    const start = this.column(match[1]!);
    for (let index = 0; index < (entry.values[0]?.length ?? 0); index += 1) {
      target[start + index] = String(entry.values[0]![index] ?? "");
    }
  }

  private column(value: string): number {
    let result = 0;
    for (const character of value) result = result * 26 + character.charCodeAt(0) - 64;
    return result - 1;
  }
}

function environment(): AppEnvironment {
  return {
    appEnv: "test", processRole: "worker", port: 4000, trustProxy: 0, tongSyncEnabled: false,
    smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
    smsSenders: { SONGPA: undefined, WIRYE: undefined, GWANGJIN: undefined }, smsAligoTestMode: true,
    googleSheetsEnabled: true, googleSheetsSpreadsheetId: spreadsheetId,
    sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
  };
}

function plan(overrides: Partial<Pick<SheetDispatchPlan, "row" | "family" | "event">> = {}): SheetDispatchPlan {
  const base: SheetDispatchPlan = {
    workbook: {
      spreadsheetId,
      schemaFingerprint: SHEET_SCHEMA_FINGERPRINT,
      schemaVersion: SHEET_SCHEMA_VERSION,
      reservationSheetTitle: "예약명단",
      reservationSheetId: 1777564107,
    },
    valueInputMode: "RAW",
    hiddenMarkerColumn: "AD",
    studentKeyColumn: "B",
    postVerify: true,
    row: {
      bookingCreatedAt: "2026-07-18 12:00:00",
      sourceStudentNo: "S-1",
      campus: "송파",
      studentName: "'=FORMULA",
      className: "중3A",
      schoolName: "풍성중",
      grade: "3",
      primaryTeacher: "담임",
      motherPhone: "010-0000-0001",
      fatherPhone: "010-0000-0002",
      reservationState: "입장 완료 (모/부) · 2명",
      latestOperationalLog: "입장 완료 2026-07-18 12:10:00",
      marker: "student-link-1",
    },
    family: {
      bookingCreatedAt: "2026-07-18 12:00:00",
      familyBookingId: "family-booking-1",
      campuses: "송파",
      studentNames: "첫째, 둘째",
      attendanceParty: "모/부",
      activeBookingCount: 1,
      activeReservationPersonCount: 2,
      checkedInBookingCount: 1,
      checkedInPersonCount: 2,
      reservationState: "입장 완료 (모/부) · 2명",
      bookingSource: "웹앱",
      checkedInAt: "2026-07-18 12:10:00",
      latestOperationalLog: "입장 완료 2026-07-18 12:10:00",
      marker: "family-booking-1",
    },
    event: {
      occurredAt: "2026-07-18 12:10:00",
      eventLabel: "입장 완료",
      familyBookingId: "family-booking-1",
      campuses: "송파",
      studentCount: 2,
      studentNames: "첫째, 둘째",
      attendanceParty: "모/부",
      activeReservationPersonCount: 2,
      checkedInPersonCount: 2,
      reservationState: "입장 완료 (모/부) · 2명",
      bookingSource: "웹앱",
      actor: "QR 스캐너",
      operationalLog: "입장 완료 2026-07-18 12:10:00",
      marker: "event-1",
    },
  };
  return {
    ...base,
    row: overrides.row ?? base.row,
    family: overrides.family ?? base.family,
    event: overrides.event ?? base.event,
  };
}

async function prepared(client: FakeSheetsClient): Promise<GoogleSheetsGateway> {
  const gateway = new GoogleSheetsGateway(environment(), client);
  await expect(gateway.prepare(plan().workbook)).resolves.toEqual({ kind: "SUCCEEDED" });
  return gateway;
}

describe("Google Sheets v4 projection gateway", () => {
  it("pins the three-tab v4 schema and independent technical markers", () => {
    expect(SHEET_SCHEMA_VERSION).toBe(4);
    expect(SHEET_SCHEMA_DESCRIPTOR).toContain("sheet:예약명단#1777564107");
    expect(SHEET_SCHEMA_DESCRIPTOR).toContain("sheet:예약집계#202607180");
    expect(SHEET_SCHEMA_DESCRIPTOR).toContain("sheet:로그#1415280656");
    expect(SHEET_SCHEMA_DESCRIPTOR).toContain("v4");
    expect(SHEET_SCHEMA_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("prepares missing 예약집계 and blank 로그 once, then replays as a no-op", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    const mutations = client.prepareMutations;
    expect(client.rows.get("예약집계")?.[0]).toEqual(summaryHeader);
    expect(client.rows.get("로그")?.[0]).toEqual(logHeader);
    expect(client.rows.get("예약명단")?.[0]?.[29]).toBe(SHEET_TECHNICAL_MARKER_HEADER);
    await expect(gateway.prepare(plan().workbook)).resolves.toEqual({ kind: "SUCCEEDED" });
    expect(client.prepareMutations).toBe(mutations);
  });

  it("writes student-current, family-current, and family-event projections in one dispatch", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    await expect(gateway.apply(plan())).resolves.toEqual({ kind: "SUCCEEDED" });
    expect(client.rows.get("예약명단")?.[1]?.slice(0, 12)).toEqual([
      "2026-07-18 12:00:00", "S-1", "송파", "'=FORMULA", "중3A", "풍성중", "3", "담임",
      "010-0000-0001", "010-0000-0002", "입장 완료 (모/부) · 2명", "입장 완료 2026-07-18 12:10:00",
    ]);
    expect(client.rows.get("예약집계")?.[1]?.slice(0, 13)).toEqual([
      "2026-07-18 12:00:00", "family-booking-1", "송파", "첫째, 둘째", "모/부",
      "1", "2", "1", "2", "입장 완료 (모/부) · 2명", "웹앱", "2026-07-18 12:10:00",
      "입장 완료 2026-07-18 12:10:00",
    ]);
    expect(client.rows.get("로그")?.[1]?.slice(0, 13)).toEqual([
      "2026-07-18 12:10:00", "입장 완료", "family-booking-1", "송파", "2", "첫째, 둘째", "모/부",
      "2", "2", "입장 완료 (모/부) · 2명", "웹앱", "QR 스캐너", "입장 완료 2026-07-18 12:10:00",
    ]);
  });

  it("reuses the first visibly empty row when a reset left only hidden markers", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    const preparedReservationHeader = [...(client.rows.get("예약명단")?.[0] ?? [])];
    const markerOnlyRows = (markerColumn: number, prefix: string) => Array.from(
      { length: 5 },
      (_, index) => {
        const row = Array.from({ length: markerColumn + 1 }, () => "");
        row[markerColumn] = `${prefix}-${index + 1}`;
        return row;
      },
    );
    client.rows.set("예약명단", [preparedReservationHeader, ...markerOnlyRows(29, "stale-student")]);
    client.rows.set("예약집계", [[...summaryHeader], ...markerOnlyRows(25, "stale-family")]);
    client.rows.set("로그", [[...logHeader], ...markerOnlyRows(25, "stale-event")]);

    await expect(gateway.apply(plan())).resolves.toEqual({ kind: "SUCCEEDED" });

    expect(client.rows.get("예약명단")?.[1]?.slice(0, 2)).toEqual(["2026-07-18 12:00:00", "S-1"]);
    expect(client.rows.get("예약명단")?.[1]?.[29]).toBe("student-link-1");
    expect(client.rows.get("예약집계")?.[1]?.slice(0, 2)).toEqual(["2026-07-18 12:00:00", "family-booking-1"]);
    expect(client.rows.get("예약집계")?.[1]?.[25]).toBe("family-booking-1");
    expect(client.rows.get("로그")?.[1]?.slice(0, 2)).toEqual(["2026-07-18 12:10:00", "입장 완료"]);
    expect(client.rows.get("로그")?.[1]?.[25]).toBe("event-1");
    expect(client.writes).toContain("예약명단!A2:L2");
    expect(client.writes).toContain("예약집계!A2:M2");
    expect(client.writes).toContain("로그!A2:M2");
    expect(client.writes).not.toContain("예약명단!A7:L7");
  });

  it("repairs a matching orphan event marker into the first empty row", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    const firstOrphan = Array.from({ length: 26 }, () => "");
    firstOrphan[25] = "older-event";
    const matchingOrphan = Array.from({ length: 26 }, () => "");
    matchingOrphan[25] = "event-1";
    client.rows.set("로그", [[...logHeader], firstOrphan, [], [], [], matchingOrphan]);

    await expect(gateway.apply(plan())).resolves.toEqual({ kind: "SUCCEEDED" });

    expect(client.rows.get("로그")?.[1]?.slice(0, 2)).toEqual(["2026-07-18 12:10:00", "입장 완료"]);
    expect(client.rows.get("로그")?.[1]?.[25]).toBe("event-1");
    expect(client.rows.get("로그")?.[5]?.[25]).toBe("");
    expect(client.writes).toContain("로그!Z6");
    expect(client.writes).toContain("로그!A2:M2");
  });

  it("keeps BOTH family counts at 2 when two sibling deliveries share familyBookingId/eventId", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    await gateway.apply(plan());
    const sibling = plan({ row: { ...plan().row, sourceStudentNo: "S-2", studentName: "둘째", marker: "student-link-2" } });
    await expect(gateway.apply(sibling)).resolves.toEqual({ kind: "SUCCEEDED" });
    expect(client.rows.get("예약명단")?.filter((row) => row[29]?.startsWith("student-link"))).toHaveLength(2);
    expect(client.rows.get("예약집계")?.filter((row) => row[25] === "family-booking-1")).toHaveLength(1);
    expect(client.rows.get("예약집계")?.[1]?.slice(5, 9)).toEqual(["1", "2", "1", "2"]);
    expect(client.rows.get("로그")?.filter((row) => row[25] === "event-1")).toHaveLength(1);
  });

  it("updates the same family row and appends a new event marker", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    await gateway.apply(plan());
    const cancelled = plan({
      family: {
        ...plan().family,
        activeBookingCount: 0,
        activeReservationPersonCount: 0,
        checkedInBookingCount: 0,
        checkedInPersonCount: 0,
        reservationState: "예약취소 (모/부) · 2명",
        checkedInAt: "",
        latestOperationalLog: "웹앱 예약 취소 2026-07-18 13:00:00",
      },
      event: {
        ...plan().event,
        occurredAt: "2026-07-18 13:00:00",
        eventLabel: "웹앱 예약 취소",
        activeReservationPersonCount: 0,
        checkedInPersonCount: 0,
        reservationState: "예약취소 (모/부) · 2명",
        actor: "웹앱",
        operationalLog: "웹앱 예약 취소 2026-07-18 13:00:00",
        marker: "event-2",
      },
    });
    await expect(gateway.apply(cancelled)).resolves.toEqual({ kind: "SUCCEEDED" });
    expect(client.rows.get("예약집계")?.filter((row) => row[25] === "family-booking-1")).toHaveLength(1);
    expect(client.rows.get("예약집계")?.[1]?.slice(5, 9)).toEqual(["0", "0", "0", "0"]);
    expect(client.rows.get("로그")?.filter((row) => ["event-1", "event-2"].includes(row[25] ?? ""))).toHaveLength(2);
  });

  it("reconciles a provider-unknown committed write without duplicate family/event rows", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    client.nextError = new SheetsClientError(0, "WRITE_UNKNOWN", true);
    client.commitBeforeError = true;
    await expect(gateway.apply(plan())).resolves.toMatchObject({ kind: "RETRY" });
    await expect(gateway.apply(plan())).resolves.toEqual({ kind: "SUCCEEDED" });
    expect(client.rows.get("예약집계")?.filter((row) => row[25] === "family-booking-1")).toHaveLength(1);
    expect(client.rows.get("로그")?.filter((row) => row[25] === "event-1")).toHaveLength(1);
  });

  it("blocks a duplicate append-only event marker instead of adding another row", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    await gateway.apply(plan());
    client.rows.get("로그")?.push([...Array.from({ length: 25 }, () => ""), "event-1"]);
    await expect(gateway.apply(plan())).resolves.toEqual({
      kind: "BLOCKED",
      errorCode: "GOOGLE_SHEETS_EVENT_MARKER_DUPLICATE",
      openCircuit: true,
    });
  });

  it("fails post-verification if the family projection drifts after write", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    client.corruptAfterWrite = () => { client.rows.get("예약집계")![1]![7] = "999"; };
    await expect(gateway.apply(plan())).resolves.toEqual({
      kind: "RETRY",
      errorCode: "GOOGLE_SHEETS_POST_VERIFY_FAILED",
    });
  });
});
