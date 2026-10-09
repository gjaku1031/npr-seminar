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

/**
 * 허용 목록에 올린 테스트 스프레드시트 ID
 */
const spreadsheetId = "EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx";

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
 * 메모리 스프레드시트로 동작하는 가짜 클라이언트
 *
 * 쓰기 전후 오류 주입과 쓰기 후 값 변조로 반영·재검증 경로 재현
 */
class FakeSheetsClient extends SheetsClient {
  /**
   * 시트 제목별 행
   */
  public readonly rows = new Map<string, string[][]>([
    ["예약명단", [[...reservationHeader]]],
    ["로그", [[]]],
  ]);

  /**
   * 시트 목록. 예약집계는 준비 단계에서 추가됨
   */
  public sheets = [
    { sheetId: 1777564107, title: "예약명단", columnCount: 30 },
    { sheetId: 1415280656, title: "로그", columnCount: 26 },
  ];

  /**
   * 표식 열 보호 완료 여부
   */
  public safe = false;

  /**
   * 준비 단계 구조 변경 횟수
   */
  public prepareMutations = 0;

  /**
   * 다음 batchUpdate에서 던질 오류
   */
  public nextError: SheetsClientError | null = null;

  /**
   * true면 기록을 반영한 뒤 오류를 던짐(커밋 후 결과 불명 재현)
   */
  public commitBeforeError = false;

  /**
   * 기록 직후 실행할 변조 함수
   */
  public corruptAfterWrite: (() => void) | null = null;

  /**
   * 기록한 범위 순서
   */
  public readonly writes: string[] = [];

  /**
   * 공유 검사는 항상 통과
   */
  public assertSafeSharing(): Promise<void> { return Promise.resolve(); }

  /**
   * 현재 시트·표식 열 상태
   */
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

  /**
   * 예약집계 생성과 머리글·표식 준비. 두 번째 호출은 변경 없음
   */
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

  /**
   * 범위의 시트 전체 행 반환
   */
  public batchGet(_id: string, ranges: readonly string[]): Promise<Readonly<Record<string, readonly (readonly string[])[]>>> {
    return Promise.resolve(Object.fromEntries(ranges.map((range) => {
      const title = range.split("!")[0]!;
      return [range, this.rows.get(title) ?? []];
    })));
  }

  /**
   * 오류 주입 설정에 따라 기록 전후 실패
   */
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

  /**
   * A1 범위 한 행 기록
   */
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

  /**
   * 열 문자를 0부터 시작하는 위치로 변환
   */
  private column(value: string): number {
    let result = 0;
    for (const character of value) result = result * 26 + character.charCodeAt(0) - 64;
    return result - 1;
  }
}

/**
 * 허용 스프레드시트와 시트 반영이 설정된 실행 환경
 */
function environment(): AppEnvironment {
  return {
    appEnv: "test", processRole: "worker", port: 4000, trustProxy: 0, tongSyncEnabled: false,
    smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
    smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined }, smsAligoTestMode: true,
    googleSheetsEnabled: true, googleSheetsSpreadsheetId: spreadsheetId,
    sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
  };
}

/**
 * 학생·가족·이벤트 반영 계획
 *
 * @param overrides 덮어쓸 row·family·event
 */
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
    sourceStudentNoDisplayColumn: "B",
    rowIdentity: "FAMILY_BOOKING_STUDENT_ID_ONLY",
    postVerify: true,
    row: {
      bookingCreatedAt: "2026-07-18 12:00:00",
      sourceStudentNo: "S-1",
      campus: "A",
      studentName: "'=FORMULA",
      mathClassNames: "중3A",
      scienceClassNames: "과고3생2[화2], 과2내신[토10]",
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
      campuses: "A",
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
      campuses: "A",
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

/**
 * 준비를 마친 게이트웨이
 */
async function prepared(client: FakeSheetsClient): Promise<GoogleSheetsGateway> {
  const gateway = new GoogleSheetsGateway(environment(), client);
  await expect(gateway.prepare(plan().workbook)).resolves.toEqual({ kind: "SUCCEEDED" });
  return gateway;
}

// v4 시트 반영 게이트웨이
describe("Google Sheets v4 projection gateway", () => {
  // 세 시트 v4 구조 지문과 독립된 기술 표식 고정
  it("pins the three-tab v4 schema and independent technical markers", () => {
    expect(SHEET_SCHEMA_VERSION).toBe(4);
    expect(SHEET_SCHEMA_DESCRIPTOR).toContain("sheet:예약명단#1777564107");
    expect(SHEET_SCHEMA_DESCRIPTOR).toContain("sheet:예약집계#202607180");
    expect(SHEET_SCHEMA_DESCRIPTOR).toContain("sheet:로그#1415280656");
    expect(SHEET_SCHEMA_DESCRIPTOR).toContain("v4");
    expect(SHEET_SCHEMA_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/u);
  });

  // 예약집계·빈 로그를 한 번만 준비하고 재실행은 변경 없음
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

  // 학생 현재·가족 현재·가족 이벤트를 한 번의 반영으로 기록
  it("writes student-current, family-current, and family-event projections in one dispatch", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    await expect(gateway.apply(plan())).resolves.toEqual({ kind: "SUCCEEDED" });
    expect(client.rows.get("예약명단")?.[1]?.slice(0, 13)).toEqual([
      "2026-07-18 12:00:00", "S-1", "A", "'=FORMULA", "중3A", "과고3생2[화2], 과2내신[토10]", "풍성중", "3", "담임",
      "010-0000-0001", "010-0000-0002", "입장 완료 (모/부) · 2명", "입장 완료 2026-07-18 12:10:00",
    ]);
    expect(client.rows.get("예약집계")?.[1]?.slice(0, 13)).toEqual([
      "2026-07-18 12:00:00", "family-booking-1", "A", "첫째, 둘째", "모/부",
      "1", "2", "1", "2", "입장 완료 (모/부) · 2명", "웹앱", "2026-07-18 12:10:00",
      "입장 완료 2026-07-18 12:10:00",
    ]);
    expect(client.rows.get("로그")?.[1]?.slice(0, 13)).toEqual([
      "2026-07-18 12:10:00", "입장 완료", "family-booking-1", "A", "2", "첫째, 둘째", "모/부",
      "2", "2", "입장 완료 (모/부) · 2명", "웹앱", "QR 스캐너", "입장 완료 2026-07-18 12:10:00",
    ]);
  });

  // 초기화로 숨김 표식만 남은 행은 첫 빈 행으로 재사용
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
    expect(client.writes).toContain("예약명단!A2:M2");
    expect(client.writes).toContain("예약집계!A2:M2");
    expect(client.writes).toContain("로그!A2:M2");
    expect(client.writes).not.toContain("예약명단!A7:M7");
  });

  // 같은 이벤트의 고아 표식은 첫 빈 행으로 옮겨 복구
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

  // 형제 두 명의 반영이 같은 가족·이벤트를 공유해도 둘 다 참석 인원 2 유지
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

  // 같은 학번의 다른 예약 행은 덮어쓰지 않음
  it("never overwrites another booking row that has the same source student number", async () => {
    const client = new FakeSheetsClient();
    const gateway = await prepared(client);
    await expect(gateway.apply(plan())).resolves.toEqual({ kind: "SUCCEEDED" });
    const anotherSessionBooking = plan({
      row: {
        ...plan().row,
        bookingCreatedAt: "2026-07-19 09:00:00",
        studentName: "같은 학생의 다른 회차",
        marker: "student-link-other-session",
      },
      family: { ...plan().family, familyBookingId: "family-booking-other-session", marker: "family-booking-other-session" },
      event: { ...plan().event, familyBookingId: "family-booking-other-session", marker: "event-other-session" },
    });

    await expect(gateway.apply(anotherSessionBooking)).resolves.toEqual({ kind: "SUCCEEDED" });

    const reservationRows = client.rows.get("예약명단")?.filter((row) => row[1] === "S-1") ?? [];
    expect(reservationRows).toHaveLength(2);
    expect(reservationRows.map((row) => row[29])).toEqual([
      "student-link-1",
      "student-link-other-session",
    ]);
    expect(reservationRows.map((row) => row[3])).toEqual(["'=FORMULA", "같은 학생의 다른 회차"]);
  });

  // 같은 가족 행을 갱신하고 새 이벤트 표식은 추가
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

  // 공급자 결과 불명이지만 커밋된 쓰기는 재시도 시 가족·이벤트 행 중복 없이 정리
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

  // 추가 전용 이벤트 표식이 중복이면 행을 더하지 않고 차단
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

  // 기록 후 가족 행이 바뀌면 재조회 검증 실패
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
