import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { AppEnvironment } from "../../common/config/environment.js";
import {
  SheetsClient,
  SheetsClientError,
  type SheetsAccessMode,
  type SheetsValueRange,
} from "./google-sheets-v4.client.js";
import {
  BOOKING_LOG_SHEET_ID,
  BOOKING_LOG_SHEET_TITLE,
  BOOKING_LOG_BUSINESS_HEADERS,
  BOOKING_LOG_RESERVED_BLANK_COLUMN_COUNT,
  BOOKING_LOG_TECHNICAL_MARKER_HEADER,
  FAMILY_SUMMARY_SHEET_ID,
  FAMILY_SUMMARY_SHEET_TITLE,
  FAMILY_SUMMARY_BUSINESS_HEADERS,
  FAMILY_SUMMARY_RESERVED_BLANK_COLUMN_COUNT,
  FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
  locateExactBookingLogSheet,
  locateExactFamilySummarySheet,
  locateExactReservationSheet,
  RESERVATION_SHEET_ID,
  RESERVATION_SHEET_TITLE,
  SHEET_BUSINESS_HEADERS,
  SHEET_RESERVED_BLANK_COLUMN_COUNT,
  SHEET_TECHNICAL_MARKER_HEADER,
  type SheetIdentity,
} from "./google-sheets-schema.js";

export const SHEET_SCHEMA_VERSION = 4;
export {
  BOOKING_LOG_BUSINESS_HEADERS,
  BOOKING_LOG_RESERVED_BLANK_COLUMN_COUNT,
  BOOKING_LOG_SHEET_ID,
  BOOKING_LOG_SHEET_TITLE,
  BOOKING_LOG_TECHNICAL_MARKER_HEADER,
  FAMILY_SUMMARY_BUSINESS_HEADERS,
  FAMILY_SUMMARY_RESERVED_BLANK_COLUMN_COUNT,
  FAMILY_SUMMARY_SHEET_ID,
  FAMILY_SUMMARY_SHEET_TITLE,
  FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
  RESERVATION_SHEET_ID,
  RESERVATION_SHEET_TITLE,
  SHEET_BUSINESS_HEADERS,
  SHEET_RESERVED_BLANK_COLUMN_COUNT,
  SHEET_TECHNICAL_MARKER_HEADER,
} from "./google-sheets-schema.js";

export const SHEET_SCHEMA_DESCRIPTOR = [
  "sheet:예약명단#1777564107",
  "columns:30",
  `A:M:${SHEET_BUSINESS_HEADERS.join(",")}`,
  "N:AC:blank",
  `AD:hidden+protected:${SHEET_TECHNICAL_MARKER_HEADER}`,
  "sheet:예약집계#202607180",
  "columns:26",
  `A:M:${FAMILY_SUMMARY_BUSINESS_HEADERS.join(",")}`,
  "N:Y:blank",
  `Z:hidden+protected:${FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER}`,
  "sheet:로그#1415280656",
  "columns:26",
  `A:M:${BOOKING_LOG_BUSINESS_HEADERS.join(",")}`,
  "N:Y:blank",
  `Z:hidden+protected:${BOOKING_LOG_TECHNICAL_MARKER_HEADER}`,
  "v4",
].join("|");
export const SHEET_SCHEMA_FINGERPRINT = createHash("sha256").update(SHEET_SCHEMA_DESCRIPTOR).digest("hex");
export const SHEET_WORKER_VALIDATION_INTERVAL_MS = 60_000;
export const SHEET_WORKER_READINESS_TTL_MS = 180_000;

export interface SheetWorkbookExpectation {
  readonly spreadsheetId: string;
  readonly schemaFingerprint: string;
  readonly schemaVersion: number;
  readonly reservationSheetTitle: string;
  readonly reservationSheetId: number;
}

export function sheetWorkbookExpectation(mapping: SheetWorkbookExpectation): SheetWorkbookExpectation {
  return {
    spreadsheetId: mapping.spreadsheetId,
    schemaFingerprint: mapping.schemaFingerprint,
    schemaVersion: mapping.schemaVersion,
    reservationSheetTitle: mapping.reservationSheetTitle,
    reservationSheetId: mapping.reservationSheetId,
  };
}

export interface SheetDispatchPlan {
  readonly workbook: SheetWorkbookExpectation;
  readonly valueInputMode: "RAW";
  readonly hiddenMarkerColumn: "AD";
  readonly sourceStudentNoDisplayColumn: "B";
  readonly rowIdentity: "FAMILY_BOOKING_STUDENT_ID_ONLY";
  readonly postVerify: true;
  /** Student-grain current projection retained for the existing 예약명단 tab. */
  readonly row: {
    readonly bookingCreatedAt: string;
    readonly sourceStudentNo: string;
    readonly campus: "송파" | "위례" | "광진";
    readonly studentName: string;
    readonly mathClassNames: string;
    readonly scienceClassNames: string;
    readonly schoolName: string;
    readonly grade: string;
    readonly primaryTeacher: string;
    readonly motherPhone: string;
    readonly fatherPhone: string;
    readonly reservationState: string;
    readonly latestOperationalLog: string;
    readonly marker: string;
  };
  /** Family-grain current projection, idempotent by familyBookingId. */
  readonly family: {
    readonly bookingCreatedAt: string;
    readonly familyBookingId: string;
    readonly campuses: string;
    readonly studentNames: string;
    readonly attendanceParty: string;
    readonly activeBookingCount: number;
    readonly activeReservationPersonCount: number;
    readonly checkedInBookingCount: number;
    readonly checkedInPersonCount: number;
    readonly reservationState: string;
    readonly bookingSource: string;
    readonly checkedInAt: string;
    readonly latestOperationalLog: string;
    readonly marker: string;
  };
  /** Family-event append-only projection, idempotent by eventId. */
  readonly event: {
    readonly occurredAt: string;
    readonly eventLabel: string;
    readonly familyBookingId: string;
    readonly campuses: string;
    readonly studentCount: number;
    readonly studentNames: string;
    readonly attendanceParty: string;
    readonly activeReservationPersonCount: number;
    readonly checkedInPersonCount: number;
    readonly reservationState: string;
    readonly bookingSource: string;
    readonly actor: string;
    readonly operationalLog: string;
    readonly marker: string;
  };
}

export type SheetGatewayResult =
  | { readonly kind: "SUCCEEDED" }
  | { readonly kind: "RETRY"; readonly errorCode: string }
  | { readonly kind: "BLOCKED"; readonly errorCode: string; readonly openCircuit: boolean }
  | { readonly kind: "DEAD"; readonly errorCode: string };

const reservationRange = `${RESERVATION_SHEET_TITLE}!A:AD`;
const familySummaryRange = `${FAMILY_SUMMARY_SHEET_TITLE}!A:Z`;
const bookingLogRange = `${BOOKING_LOG_SHEET_TITLE}!A:Z`;
const reservationHeaderRange = `${RESERVATION_SHEET_TITLE}!A1:AD1`;
const familySummaryHeaderRange = `${FAMILY_SUMMARY_SHEET_TITLE}!A1:Z1`;
const bookingLogHeaderRange = `${BOOKING_LOG_SHEET_TITLE}!A1:Z1`;
const reservationMarkerIndex = 29;
const projectionMarkerIndex = 25;
const sourceStudentNoIndex = 1;

@Injectable()
export class GoogleSheetsGateway {
  public constructor(
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
    private readonly client: SheetsClient,
  ) {}

  public async prepare(workbook: SheetWorkbookExpectation): Promise<SheetGatewayResult> {
    try {
      this.assertAllowlisted(workbook);
      this.assertSchemaFingerprint(workbook);
      await this.client.assertSafeSharing(workbook.spreadsheetId, "ACTIVATION");
      await this.client.ensureTechnicalMarkerColumn(workbook.spreadsheetId, SHEET_TECHNICAL_MARKER_HEADER);
      await this.validateWorkbook(workbook, "ACTIVATION");
      return { kind: "SUCCEEDED" };
    } catch (error) {
      return this.classify(error);
    }
  }

  public async validate(
    workbook: SheetWorkbookExpectation,
    access: SheetsAccessMode = "DISPATCH",
  ): Promise<SheetGatewayResult> {
    try {
      this.assertAllowlisted(workbook);
      this.assertSchemaFingerprint(workbook);
      await this.client.assertSafeSharing(workbook.spreadsheetId, access);
      await this.validateWorkbook(workbook, access);
      return { kind: "SUCCEEDED" };
    } catch (error) {
      return this.classify(error);
    }
  }

  public async apply(plan: SheetDispatchPlan): Promise<SheetGatewayResult> {
    if (!this.environment.googleSheetsEnabled) {
      return { kind: "BLOCKED", errorCode: "GOOGLE_SHEETS_DISABLED", openCircuit: true };
    }
    const validation = await this.validate(plan.workbook);
    if (validation.kind !== "SUCCEEDED") return validation;
    try {
      const values = await this.client.batchGet(plan.workbook.spreadsheetId, [
        reservationRange,
        familySummaryRange,
        bookingLogRange,
      ]);
      const studentUpdates = this.buildStudentUpdates(plan, values[reservationRange] ?? []);
      const familyUpdates = this.buildFamilyUpdates(plan, values[familySummaryRange] ?? []);
      const eventProjection = this.buildEventUpdates(plan, values[bookingLogRange] ?? []);
      const updates = [...studentUpdates, ...familyUpdates, ...eventProjection.updates];
      if (Buffer.byteLength(JSON.stringify(updates), "utf8") > 2_000_000) {
        return { kind: "DEAD", errorCode: "GOOGLE_SHEETS_PAYLOAD_TOO_LARGE" };
      }
      await this.client.batchUpdate(plan.workbook.spreadsheetId, updates);
      const verified = await this.client.batchGet(plan.workbook.spreadsheetId, [
        reservationRange,
        familySummaryRange,
        bookingLogRange,
      ]);
      if (!this.hasExactStudentProjection(verified[reservationRange] ?? [], plan)
        || !this.hasExactFamilyProjection(verified[familySummaryRange] ?? [], plan)
        || !this.hasEventProjection(verified[bookingLogRange] ?? [], plan, !eventProjection.existed)) {
        return { kind: "RETRY", errorCode: "GOOGLE_SHEETS_POST_VERIFY_FAILED" };
      }
      return { kind: "SUCCEEDED" };
    } catch (error) {
      return this.classify(error);
    }
  }

  private assertAllowlisted(workbook: SheetWorkbookExpectation): void {
    if (this.environment.googleSheetsSpreadsheetId === undefined
      || workbook.spreadsheetId !== this.environment.googleSheetsSpreadsheetId) {
      throw new SheetsClientError(403, "GOOGLE_SHEETS_SPREADSHEET_NOT_ALLOWLISTED");
    }
  }

  private assertSchemaFingerprint(workbook: SheetWorkbookExpectation): void {
    if (workbook.schemaVersion !== SHEET_SCHEMA_VERSION
      || workbook.schemaFingerprint !== SHEET_SCHEMA_FINGERPRINT) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_SCHEMA_FINGERPRINT_MISMATCH");
    }
  }

  private async validateWorkbook(
    workbook: SheetWorkbookExpectation,
    access: SheetsAccessMode,
  ): Promise<void> {
    const metadata = await this.client.metadata(workbook.spreadsheetId, access);
    if (metadata.locale !== "ko_KR") throw new SheetsClientError(400, "GOOGLE_SHEETS_LOCALE_DRIFT");
    if (metadata.timeZone !== "Asia/Seoul") throw new SheetsClientError(400, "GOOGLE_SHEETS_TIMEZONE_DRIFT");
    const reservationSheet = locateExactReservationSheet(
      metadata.sheets,
      workbook.reservationSheetId,
      workbook.reservationSheetTitle,
    );
    const familySummarySheet = locateExactFamilySummarySheet(metadata.sheets);
    const bookingLogSheet = locateExactBookingLogSheet(metadata.sheets);
    if (workbook.reservationSheetTitle !== RESERVATION_SHEET_TITLE
      || workbook.reservationSheetId !== RESERVATION_SHEET_ID
      || reservationSheet === null || familySummarySheet === null || bookingLogSheet === null) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_SCHEMA_DRIFT");
    }
    this.assertTechnicalColumn(metadata.technicalColumns, reservationSheet, reservationMarkerIndex);
    this.assertTechnicalColumn(metadata.technicalColumns, familySummarySheet, projectionMarkerIndex);
    this.assertTechnicalColumn(metadata.technicalColumns, bookingLogSheet, projectionMarkerIndex);

    const values = await this.client.batchGet(workbook.spreadsheetId, [
      reservationHeaderRange,
      familySummaryHeaderRange,
      bookingLogHeaderRange,
    ], access);
    this.validateHeader(
      values[reservationHeaderRange]?.[0] ?? [],
      SHEET_BUSINESS_HEADERS,
      SHEET_RESERVED_BLANK_COLUMN_COUNT,
      reservationMarkerIndex,
      SHEET_TECHNICAL_MARKER_HEADER,
    );
    this.validateHeader(
      values[familySummaryHeaderRange]?.[0] ?? [],
      FAMILY_SUMMARY_BUSINESS_HEADERS,
      FAMILY_SUMMARY_RESERVED_BLANK_COLUMN_COUNT,
      projectionMarkerIndex,
      FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
    );
    this.validateHeader(
      values[bookingLogHeaderRange]?.[0] ?? [],
      BOOKING_LOG_BUSINESS_HEADERS,
      BOOKING_LOG_RESERVED_BLANK_COLUMN_COUNT,
      projectionMarkerIndex,
      BOOKING_LOG_TECHNICAL_MARKER_HEADER,
    );
  }

  private assertTechnicalColumn(
    columns: readonly {
      readonly sheetId: number;
      readonly title: string;
      readonly hidden: boolean;
      readonly protected: boolean;
      readonly requestingUserCanEdit: boolean;
      readonly editorsRestrictedToServiceAccount: boolean;
    }[],
    sheet: SheetIdentity,
    _markerIndex: number,
  ): void {
    const candidates = columns.filter((column) => column.sheetId === sheet.sheetId || column.title === sheet.title);
    const technical = candidates.length === 1
      && candidates[0]?.sheetId === sheet.sheetId
      && candidates[0].title === sheet.title
      ? candidates[0]
      : undefined;
    if (technical?.hidden !== true || technical.protected !== true || technical.requestingUserCanEdit !== true
      || technical.editorsRestrictedToServiceAccount !== true) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_TECHNICAL_COLUMN_UNSAFE");
    }
  }

  private validateHeader(
    row: readonly string[],
    businessHeaders: readonly string[],
    reservedBlankCount: number,
    markerIndex: number,
    markerHeader: string,
  ): void {
    const businessHeadersMatch = businessHeaders.every((header, index) => row[index] === header);
    const reservedColumnsBlank = Array.from(
      { length: reservedBlankCount },
      (_, offset) => row[businessHeaders.length + offset] ?? "",
    ).every((value) => value === "");
    if (!businessHeadersMatch || !reservedColumnsBlank || (row[markerIndex] ?? "") !== markerHeader) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_HEADER_DRIFT");
    }
  }

  private buildStudentUpdates(plan: SheetDispatchPlan, rows: readonly (readonly string[])[]): SheetsValueRange[] {
    const marker = plan.row.marker;
    // familyBookingStudentId is the only reservation-row identity. A source
    // student number can legitimately recur in another seminar session within
    // the same workbook and must never cause that other booking row to move or
    // be overwritten.
    const markerRowIndex = rows.findIndex((row, index) => index > 0
      && row[reservationMarkerIndex] === marker);
    const targetIndex = markerRowIndex >= 0
      && !this.isBusinessRowVacant(rows[markerRowIndex] ?? [], SHEET_BUSINESS_HEADERS.length)
      ? markerRowIndex
      : this.firstReusableRowIndex(rows, SHEET_BUSINESS_HEADERS.length);
    const targetRow = targetIndex + 1;
    const updates: SheetsValueRange[] = [];
    for (let index = 1; index < rows.length; index += 1) {
      if (index !== targetIndex && rows[index]?.[reservationMarkerIndex] === marker) {
        updates.push({ range: `${RESERVATION_SHEET_TITLE}!AD${index + 1}`, values: [[""]] });
      }
    }
    updates.push({ range: `${RESERVATION_SHEET_TITLE}!A${targetRow}:M${targetRow}`, values: [this.studentValues(plan)] });
    updates.push({ range: `${RESERVATION_SHEET_TITLE}!AD${targetRow}`, values: [[marker]] });
    return updates;
  }

  private buildFamilyUpdates(plan: SheetDispatchPlan, rows: readonly (readonly string[])[]): SheetsValueRange[] {
    const marker = plan.family.marker;
    const markerRows = rows.flatMap((row, index) => index > 0 && row[projectionMarkerIndex] === marker ? [index] : []);
    const currentIndex = markerRows[0];
    const targetIndex = currentIndex !== undefined
      && !this.isBusinessRowVacant(rows[currentIndex] ?? [], FAMILY_SUMMARY_BUSINESS_HEADERS.length)
      ? currentIndex
      : this.firstReusableRowIndex(rows, FAMILY_SUMMARY_BUSINESS_HEADERS.length);
    const updates: SheetsValueRange[] = [];
    for (const markerIndex of markerRows) {
      if (markerIndex !== targetIndex) {
        updates.push({ range: `${FAMILY_SUMMARY_SHEET_TITLE}!Z${markerIndex + 1}`, values: [[""]] });
      }
    }
    const targetRow = targetIndex + 1;
    updates.push({ range: `${FAMILY_SUMMARY_SHEET_TITLE}!A${targetRow}:M${targetRow}`, values: [this.familyValues(plan)] });
    updates.push({ range: `${FAMILY_SUMMARY_SHEET_TITLE}!Z${targetRow}`, values: [[marker]] });
    return updates;
  }

  private buildEventUpdates(
    plan: SheetDispatchPlan,
    rows: readonly (readonly string[])[],
  ): { readonly updates: readonly SheetsValueRange[]; readonly existed: boolean } {
    const matches = rows.flatMap((row, index) => index > 0 && row[projectionMarkerIndex] === plan.event.marker ? [index] : []);
    if (matches.length > 1) throw new SheetsClientError(400, "GOOGLE_SHEETS_EVENT_MARKER_DUPLICATE");
    if (matches.length === 1
      && !this.isBusinessRowVacant(rows[matches[0]!] ?? [], BOOKING_LOG_BUSINESS_HEADERS.length)) {
      return { updates: [], existed: true };
    }
    // A development reset (or an interrupted provider write) can leave only
    // the hidden idempotency marker behind. Such a row is visibly empty and
    // must be repaired/reused instead of making the next delivery jump past
    // it. A matching orphan marker is preferred so the same event heals in
    // place; otherwise the first visibly empty row is reused.
    const targetIndex = this.firstReusableRowIndex(rows, BOOKING_LOG_BUSINESS_HEADERS.length);
    const targetRow = targetIndex + 1;
    const staleMarkerUpdates = matches[0] !== undefined && matches[0] !== targetIndex
      ? [{ range: `${BOOKING_LOG_SHEET_TITLE}!Z${matches[0] + 1}`, values: [[""]] }]
      : [];
    return {
      existed: false,
      updates: [
        ...staleMarkerUpdates,
        { range: `${BOOKING_LOG_SHEET_TITLE}!A${targetRow}:M${targetRow}`, values: [this.eventValues(plan)] },
        { range: `${BOOKING_LOG_SHEET_TITLE}!Z${targetRow}`, values: [[plan.event.marker]] },
      ],
    };
  }

  private hasExactStudentProjection(rows: readonly (readonly string[])[], plan: SheetDispatchPlan): boolean {
    const matches = rows.filter((row, index) => index > 0 && row[reservationMarkerIndex] === plan.row.marker);
    return matches.length === 1
      && matches[0]?.[sourceStudentNoIndex] === plan.row.sourceStudentNo
      && this.sameValues(matches[0]!, this.studentValues(plan));
  }

  private hasExactFamilyProjection(rows: readonly (readonly string[])[], plan: SheetDispatchPlan): boolean {
    const matches = rows.filter((row, index) => index > 0 && row[projectionMarkerIndex] === plan.family.marker);
    return matches.length === 1 && this.sameValues(matches[0]!, this.familyValues(plan));
  }

  private hasEventProjection(
    rows: readonly (readonly string[])[],
    plan: SheetDispatchPlan,
    requireExactValues: boolean,
  ): boolean {
    const matches = rows.filter((row, index) => index > 0 && row[projectionMarkerIndex] === plan.event.marker);
    return matches.length === 1 && (!requireExactValues || this.sameValues(matches[0]!, this.eventValues(plan)));
  }

  private studentValues(plan: SheetDispatchPlan): readonly string[] {
    return [
      plan.row.bookingCreatedAt,
      plan.row.sourceStudentNo,
      plan.row.campus,
      plan.row.studentName,
      plan.row.mathClassNames,
      plan.row.scienceClassNames,
      plan.row.schoolName,
      plan.row.grade,
      plan.row.primaryTeacher,
      plan.row.motherPhone,
      plan.row.fatherPhone,
      plan.row.reservationState,
      plan.row.latestOperationalLog,
    ];
  }

  private familyValues(plan: SheetDispatchPlan): readonly (string | number)[] {
    return [
      plan.family.bookingCreatedAt,
      plan.family.familyBookingId,
      plan.family.campuses,
      plan.family.studentNames,
      plan.family.attendanceParty,
      plan.family.activeBookingCount,
      plan.family.activeReservationPersonCount,
      plan.family.checkedInBookingCount,
      plan.family.checkedInPersonCount,
      plan.family.reservationState,
      plan.family.bookingSource,
      plan.family.checkedInAt,
      plan.family.latestOperationalLog,
    ];
  }

  private eventValues(plan: SheetDispatchPlan): readonly (string | number)[] {
    return [
      plan.event.occurredAt,
      plan.event.eventLabel,
      plan.event.familyBookingId,
      plan.event.campuses,
      plan.event.studentCount,
      plan.event.studentNames,
      plan.event.attendanceParty,
      plan.event.activeReservationPersonCount,
      plan.event.checkedInPersonCount,
      plan.event.reservationState,
      plan.event.bookingSource,
      plan.event.actor,
      plan.event.operationalLog,
    ];
  }

  private sameValues(row: readonly string[], expected: readonly (string | number)[]): boolean {
    return expected.every((value, index) => (row[index] ?? "") === String(value));
  }

  private firstReusableRowIndex(
    rows: readonly (readonly string[])[],
    businessColumnCount: number,
  ): number {
    const vacantIndex = rows.findIndex((row, index) => index > 0
      && this.isBusinessRowVacant(row, businessColumnCount));
    return vacantIndex >= 0 ? vacantIndex : Math.max(rows.length, 1);
  }

  private isBusinessRowVacant(row: readonly string[], businessColumnCount: number): boolean {
    return Array.from(
      { length: businessColumnCount },
      (_, index) => row[index] ?? "",
    ).every((value) => value === "");
  }

  private classify(error: unknown): SheetGatewayResult {
    if (!(error instanceof SheetsClientError)) {
      return { kind: "DEAD", errorCode: "GOOGLE_SHEETS_CLIENT_FAILURE" };
    }
    if ([
      "GOOGLE_SHEETS_DISABLED",
      "GOOGLE_SHEETS_WORKER_ISOLATION_REQUIRED",
      "GOOGLE_SHEETS_CREDENTIAL_PATH_INVALID",
      "GOOGLE_SHEETS_CREDENTIAL_INVALID",
      "GOOGLE_SHEETS_TOKEN_REJECTED",
      "GOOGLE_SHEETS_TOKEN_INVALID",
    ].includes(error.code)) {
      return { kind: "BLOCKED", errorCode: error.code, openCircuit: true };
    }
    if ([400, 401, 403].includes(error.status)) {
      return { kind: "BLOCKED", errorCode: error.code, openCircuit: true };
    }
    if (error.status === 429 || error.status >= 500 || error.status === 0) {
      return { kind: "RETRY", errorCode: error.code };
    }
    return { kind: "DEAD", errorCode: error.code };
  }
}
