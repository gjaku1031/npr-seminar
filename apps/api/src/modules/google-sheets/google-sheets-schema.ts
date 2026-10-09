/**
 * 학생 단위 예약명단 시트 제목
 */
export const RESERVATION_SHEET_TITLE = "예약명단";

/**
 * 예약명단 시트 ID
 */
export const RESERVATION_SHEET_ID = 1777564107;

/**
 * 예약명단 시트 열 수. 업무 열 + 예비 빈 열 + 기술 표식 열
 */
const RESERVATION_SHEET_COLUMN_COUNT = 30;

/**
 * 가족 단위 예약집계 시트 제목
 */
export const FAMILY_SUMMARY_SHEET_TITLE = "예약집계";

/**
 * 예약집계 시트 ID
 */
export const FAMILY_SUMMARY_SHEET_ID = 202607180;

/**
 * 예약집계 시트 열 수
 */
export const FAMILY_SUMMARY_SHEET_COLUMN_COUNT = 26;

/**
 * 예약 이벤트 로그 시트 제목
 */
export const BOOKING_LOG_SHEET_TITLE = "로그";

/**
 * 로그 시트 ID
 */
export const BOOKING_LOG_SHEET_ID = 1415280656;

/**
 * 로그 시트 열 수
 */
export const BOOKING_LOG_SHEET_COLUMN_COUNT = 26;

/**
 * 예약명단 행 식별용 기술 표식 열 머리글. 예약 학생 ID 저장
 */
export const SHEET_TECHNICAL_MARKER_HEADER = "__NPR_FAMILY_BOOKING_STUDENT_ID";

/**
 * 예약집계 행 식별용 기술 표식 열 머리글. 가족 예약 ID 저장
 */
export const FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER = "__NPR_FAMILY_BOOKING_ID";

/**
 * 로그 행 식별용 기술 표식 열 머리글. 예약 이벤트 ID 저장
 */
export const BOOKING_LOG_TECHNICAL_MARKER_HEADER = "__NPR_BOOKING_EVENT_ID";

/**
 * 예약명단 업무 열 머리글. 순서가 시트 열 순서
 */
export const SHEET_BUSINESS_HEADERS = [
  "예약일시", "학번", "캠퍼스", "학생명", "수학반", "과학반", "학교", "학년", "담임",
  "학부모HP (모)", "학부모HP (부)", "예약상태", "로그",
] as const;

/**
 * 예약집계 업무 열 머리글
 */
export const FAMILY_SUMMARY_BUSINESS_HEADERS = [
  "예약일시", "가족예약ID", "캠퍼스", "학생명 목록", "참석자", "예약건수", "예약인원",
  "입장건수", "입장인원", "상태", "예약경로", "체크인시각", "최신로그",
] as const;

/**
 * 로그 업무 열 머리글
 */
export const BOOKING_LOG_BUSINESS_HEADERS = [
  "이벤트일시", "이벤트", "가족예약ID", "캠퍼스", "학생수", "학생명", "참석자",
  "예약인원", "입장인원", "예약상태", "예약경로", "처리자", "로그",
] as const;

/**
 * 예약명단 업무 열과 기술 표식 열 사이 예비 빈 열 수
 */
export const SHEET_RESERVED_BLANK_COLUMN_COUNT = 16;

/**
 * 예약집계 예비 빈 열 수
 */
export const FAMILY_SUMMARY_RESERVED_BLANK_COLUMN_COUNT = 12;

/**
 * 로그 예비 빈 열 수
 */
export const BOOKING_LOG_RESERVED_BLANK_COLUMN_COUNT = 12;

/**
 * 스프레드시트에서 읽은 시트 정보
 */
export interface SheetIdentity {
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
 * 기대하는 시트 ID·제목·열 수
 */
export interface ExactSheetIdentity {
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
 * ID·제목·열 수가 모두 일치하는 시트 탐색
 *
 * ID 또는 제목이 같은 후보가 정확히 하나이고 세 값이 모두 같아야 함
 *
 * @returns 일치 시트. 없거나 모호하거나 일부만 같으면 null
 */
function locateExactSheet(
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

/**
 * 예약명단 시트 탐색
 *
 * @param expectedSheetId 매핑에 저장된 시트 ID. 생략 시 기본값
 * @param expectedTitle 매핑에 저장된 시트 제목. 생략 시 기본값
 */
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

/**
 * 예약집계 시트 탐색
 */
export function locateExactFamilySummarySheet(sheets: readonly SheetIdentity[]): SheetIdentity | null {
  return locateExactSheet(sheets, {
    sheetId: FAMILY_SUMMARY_SHEET_ID,
    title: FAMILY_SUMMARY_SHEET_TITLE,
    columnCount: FAMILY_SUMMARY_SHEET_COLUMN_COUNT,
  });
}

/**
 * 로그 시트 탐색
 */
export function locateExactBookingLogSheet(sheets: readonly SheetIdentity[]): SheetIdentity | null {
  return locateExactSheet(sheets, {
    sheetId: BOOKING_LOG_SHEET_ID,
    title: BOOKING_LOG_SHEET_TITLE,
    columnCount: BOOKING_LOG_SHEET_COLUMN_COUNT,
  });
}
