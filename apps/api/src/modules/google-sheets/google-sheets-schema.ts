export const RESERVATION_SHEET_TITLE = "예약명단";
export const RESERVATION_SHEET_ID = 1777564107;
export const RESERVATION_SHEET_COLUMN_COUNT = 30;

export const FAMILY_SUMMARY_SHEET_TITLE = "예약집계";
export const FAMILY_SUMMARY_SHEET_ID = 202607180;
export const FAMILY_SUMMARY_SHEET_COLUMN_COUNT = 26;

export const BOOKING_LOG_SHEET_TITLE = "로그";
export const BOOKING_LOG_SHEET_ID = 1415280656;
export const BOOKING_LOG_SHEET_COLUMN_COUNT = 26;

export const SHEET_TECHNICAL_MARKER_HEADER = "__NPR_FAMILY_BOOKING_STUDENT_ID";
export const FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER = "__NPR_FAMILY_BOOKING_ID";
export const BOOKING_LOG_TECHNICAL_MARKER_HEADER = "__NPR_BOOKING_EVENT_ID";

export const SHEET_BUSINESS_HEADERS = [
  "예약일시", "학번", "캠퍼스", "학생명", "수학반", "과학반", "학교", "학년", "담임",
  "학부모HP (모)", "학부모HP (부)", "예약상태", "로그",
] as const;
export const FAMILY_SUMMARY_BUSINESS_HEADERS = [
  "예약일시", "가족예약ID", "캠퍼스", "학생명 목록", "참석자", "예약건수", "예약인원",
  "입장건수", "입장인원", "상태", "예약경로", "체크인시각", "최신로그",
] as const;
export const BOOKING_LOG_BUSINESS_HEADERS = [
  "이벤트일시", "이벤트", "가족예약ID", "캠퍼스", "학생수", "학생명", "참석자",
  "예약인원", "입장인원", "예약상태", "예약경로", "처리자", "로그",
] as const;

export const SHEET_RESERVED_BLANK_COLUMN_COUNT = 16;
export const FAMILY_SUMMARY_RESERVED_BLANK_COLUMN_COUNT = 12;
export const BOOKING_LOG_RESERVED_BLANK_COLUMN_COUNT = 12;

export interface SheetIdentity {
  readonly sheetId: number;
  readonly title: string;
  readonly columnCount: number;
}

export interface ExactSheetIdentity {
  readonly sheetId: number;
  readonly title: string;
  readonly columnCount: number;
}

export function locateExactSheet(
  sheets: readonly SheetIdentity[],
  expected: ExactSheetIdentity,
): SheetIdentity | null {
  const candidates = sheets.filter((sheet) => sheet.sheetId === expected.sheetId || sheet.title === expected.title);
  if (candidates.length !== 1) return null;
  const sheet = candidates[0]!;
  return sheet.sheetId === expected.sheetId
    && sheet.title === expected.title
    && sheet.columnCount === expected.columnCount
    ? sheet
    : null;
}

export function locateExactReservationSheet(
  sheets: readonly SheetIdentity[],
  expectedSheetId: number = RESERVATION_SHEET_ID,
  expectedTitle: string = RESERVATION_SHEET_TITLE,
): SheetIdentity | null {
  return locateExactSheet(sheets, {
    sheetId: expectedSheetId,
    title: expectedTitle,
    columnCount: RESERVATION_SHEET_COLUMN_COUNT,
  });
}

export function locateExactFamilySummarySheet(sheets: readonly SheetIdentity[]): SheetIdentity | null {
  return locateExactSheet(sheets, {
    sheetId: FAMILY_SUMMARY_SHEET_ID,
    title: FAMILY_SUMMARY_SHEET_TITLE,
    columnCount: FAMILY_SUMMARY_SHEET_COLUMN_COUNT,
  });
}

export function locateExactBookingLogSheet(sheets: readonly SheetIdentity[]): SheetIdentity | null {
  return locateExactSheet(sheets, {
    sheetId: BOOKING_LOG_SHEET_ID,
    title: BOOKING_LOG_SHEET_TITLE,
    columnCount: BOOKING_LOG_SHEET_COLUMN_COUNT,
  });
}
