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

/**
 * 시트 스키마 버전. 매핑의 schemaVersion과 같아야 반영
 */
export const SHEET_SCHEMA_VERSION = 4;

/**
 * 시트 머리글 상수 재수출
 */
export {
  BOOKING_LOG_BUSINESS_HEADERS,
  BOOKING_LOG_TECHNICAL_MARKER_HEADER,
  FAMILY_SUMMARY_BUSINESS_HEADERS,
  FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
  SHEET_BUSINESS_HEADERS,
  SHEET_TECHNICAL_MARKER_HEADER,
} from "./google-sheets-schema.js";

/**
 * 시트 구조 기술 문자열. 시트 ID·열 수·머리글·표식 열 위치를 한 줄로 고정
 */
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

/**
 * 시트 구조 지문(SHA-256 hex). 매핑에 저장된 값과 다르면 반영 차단
 */
export const SHEET_SCHEMA_FINGERPRINT = createHash("sha256").update(SHEET_SCHEMA_DESCRIPTOR).digest("hex");

/**
 * 워커의 매핑 재검증 주기(밀리초)
 */
export const SHEET_WORKER_VALIDATION_INTERVAL_MS = 60_000;

/**
 * 마지막 검증 후 실시간 반영 가능으로 보는 시간(밀리초)
 */
export const SHEET_WORKER_READINESS_TTL_MS = 180_000;

/**
 * 매핑이 기대하는 스프레드시트·구조
 */
export interface SheetWorkbookExpectation {
  /**
   * 스프레드시트 ID
   */
  readonly spreadsheetId: string;

  /**
   * 구조 지문
   */
  readonly schemaFingerprint: string;

  /**
   * 스키마 버전
   */
  readonly schemaVersion: number;

  /**
   * 예약명단 시트 제목
   */
  readonly reservationSheetTitle: string;

  /**
   * 예약명단 시트 ID
   */
  readonly reservationSheetId: number;
}

/**
 * 매핑 행에서 스프레드시트·구조 기대값만 추출
 */
export function sheetWorkbookExpectation(mapping: SheetWorkbookExpectation): SheetWorkbookExpectation {
  return {
    spreadsheetId: mapping.spreadsheetId,
    schemaFingerprint: mapping.schemaFingerprint,
    schemaVersion: mapping.schemaVersion,
    reservationSheetTitle: mapping.reservationSheetTitle,
    reservationSheetId: mapping.reservationSheetId,
  };
}

/**
 * 예약 학생 1명 반영 계획
 *
 * 예약명단(학생 단위 현재 상태), 예약집계(가족 단위 현재 상태), 로그(가족 이벤트 추가 전용)에 함께 반영
 */
export interface SheetDispatchPlan {
  /**
   * 대상 스프레드시트·구조
   */
  readonly workbook: SheetWorkbookExpectation;

  /**
   * 값 입력 방식. 수식 해석 없이 RAW
   */
  readonly valueInputMode: "RAW";

  /**
   * 예약명단 숨김 표식 열
   */
  readonly hiddenMarkerColumn: "AD";

  /**
   * 학번 표시 열
   */
  readonly sourceStudentNoDisplayColumn: "B";

  /**
   * 행 식별 기준. 예약 학생 ID만 사용
   */
  readonly rowIdentity: "FAMILY_BOOKING_STUDENT_ID_ONLY";

  /**
   * 기록 후 재조회 검증 수행
   */
  readonly postVerify: true;

  /**
   * 예약명단 탭의 학생 단위 현재 상태 행
   */
  readonly row: {
    /**
     * 예약 일시
     */
    readonly bookingCreatedAt: string;

    /**
     * 학번
     */
    readonly sourceStudentNo: string;

    /**
     * 캠퍼스
     */
    readonly campus: "A" | "B" | "C";

    /**
     * 학생 이름
     */
    readonly studentName: string;

    /**
     * 수학반 목록
     */
    readonly mathClassNames: string;

    /**
     * 과학반 목록
     */
    readonly scienceClassNames: string;

    /**
     * 학교
     */
    readonly schoolName: string;

    /**
     * 학년
     */
    readonly grade: string;

    /**
     * 담임
     */
    readonly primaryTeacher: string;

    /**
     * 어머니 연락처
     */
    readonly motherPhone: string;

    /**
     * 아버지 연락처
     */
    readonly fatherPhone: string;

    /**
     * 예약 상태 표시
     */
    readonly reservationState: string;

    /**
     * 최신 운영 로그
     */
    readonly latestOperationalLog: string;

    /**
     * 숨김 표식 값. 예약 학생 ID
     */
    readonly marker: string;
  };

  /**
   * 가족 단위 현재 상태 행. 가족 예약 ID 기준 멱등
   */
  readonly family: {
    /**
     * 예약 일시
     */
    readonly bookingCreatedAt: string;

    /**
     * 가족 예약 ID
     */
    readonly familyBookingId: string;

    /**
     * 캠퍼스 목록
     */
    readonly campuses: string;

    /**
     * 학생 이름 목록
     */
    readonly studentNames: string;

    /**
     * 참석 보호자 표시
     */
    readonly attendanceParty: string;

    /**
     * 활성 예약 학생 수
     */
    readonly activeBookingCount: number;

    /**
     * 예약 인원
     */
    readonly activeReservationPersonCount: number;

    /**
     * 입장한 예약 학생 수
     */
    readonly checkedInBookingCount: number;

    /**
     * 입장 인원
     */
    readonly checkedInPersonCount: number;

    /**
     * 예약 상태 표시
     */
    readonly reservationState: string;

    /**
     * 예약 경로 표시
     */
    readonly bookingSource: string;

    /**
     * 체크인 시각
     */
    readonly checkedInAt: string;

    /**
     * 최신 운영 로그
     */
    readonly latestOperationalLog: string;

    /**
     * 숨김 표식 값. 가족 예약 ID
     */
    readonly marker: string;
  };

  /**
   * 가족 이벤트 추가 전용 행. 이벤트 ID 기준 멱등
   */
  readonly event: {
    /**
     * 이벤트 일시
     */
    readonly occurredAt: string;

    /**
     * 이벤트 표시 이름
     */
    readonly eventLabel: string;

    /**
     * 가족 예약 ID
     */
    readonly familyBookingId: string;

    /**
     * 캠퍼스 목록
     */
    readonly campuses: string;

    /**
     * 학생 수
     */
    readonly studentCount: number;

    /**
     * 학생 이름 목록
     */
    readonly studentNames: string;

    /**
     * 참석 보호자 표시
     */
    readonly attendanceParty: string;

    /**
     * 예약 인원
     */
    readonly activeReservationPersonCount: number;

    /**
     * 입장 인원
     */
    readonly checkedInPersonCount: number;

    /**
     * 예약 상태 표시
     */
    readonly reservationState: string;

    /**
     * 예약 경로 표시
     */
    readonly bookingSource: string;

    /**
     * 처리자
     */
    readonly actor: string;

    /**
     * 운영 로그
     */
    readonly operationalLog: string;

    /**
     * 숨김 표식 값. 예약 이벤트 ID
     */
    readonly marker: string;
  };
}

/**
 * 시트 반영 결과
 *
 * - SUCCEEDED: 반영·검증 완료
 * - RETRY: 일시 오류. 지연 후 재시도
 * - BLOCKED: 설정·권한·구조 문제. openCircuit이면 매핑 회로 차단
 * - DEAD: 재시도해도 해결되지 않는 오류
 */
export type SheetGatewayResult =
  | { readonly kind: "SUCCEEDED" }
  | { readonly kind: "RETRY"; readonly errorCode: string }
  | { readonly kind: "BLOCKED"; readonly errorCode: string; readonly openCircuit: boolean }
  | { readonly kind: "DEAD"; readonly errorCode: string };

/**
 * 예약명단 전체 범위
 */
const reservationRange = `${RESERVATION_SHEET_TITLE}!A:AD`;

/**
 * 예약집계 전체 범위
 */
const familySummaryRange = `${FAMILY_SUMMARY_SHEET_TITLE}!A:Z`;

/**
 * 로그 전체 범위
 */
const bookingLogRange = `${BOOKING_LOG_SHEET_TITLE}!A:Z`;

/**
 * 예약명단 머리글 범위
 */
const reservationHeaderRange = `${RESERVATION_SHEET_TITLE}!A1:AD1`;

/**
 * 예약집계 머리글 범위
 */
const familySummaryHeaderRange = `${FAMILY_SUMMARY_SHEET_TITLE}!A1:Z1`;

/**
 * 로그 머리글 범위
 */
const bookingLogHeaderRange = `${BOOKING_LOG_SHEET_TITLE}!A1:Z1`;

/**
 * 예약명단 표식 열 위치(AD, 0부터)
 */
const reservationMarkerIndex = 29;

/**
 * 예약집계·로그 표식 열 위치(Z, 0부터)
 */
const projectionMarkerIndex = 25;

/**
 * 예약명단 학번 열 위치(B, 0부터)
 */
const sourceStudentNoIndex = 1;

/**
 * 허용된 스프레드시트에 대한 구조 검증과 반영
 *
 * 모든 오류를 SheetGatewayResult로 분류해 반환하고 예외를 던지지 않음
 */
@Injectable()
export class GoogleSheetsGateway {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 실행 환경. 시트 사용 여부·허용 스프레드시트 ID
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,

    /**
     * 스프레드시트 API 클라이언트
     */
    private readonly client: SheetsClient,
  ) {}

  /**
   * 운영자 준비 작업. 공유 설정 확인, 기술 표식 열 준비, 전체 구조 검증
   */
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

  /**
   * 허용 목록·구조 지문·공유 설정·시트 구조 검증
   *
   * @param access 일반 반영 또는 활성화 작업
   */
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

  /**
   * 반영 계획 적용
   *
   * 1. 시트 사용 여부와 구조 검증
   * 2. 세 시트 전체를 읽어 행 위치 결정과 갱신 범위 계산
   * 3. 한 번의 batchUpdate로 기록. 요청이 2,000,000바이트를 넘으면 DEAD
   * 4. 재조회해 표식 행이 정확히 하나이고 값이 같은지 확인. 다르면 RETRY
   */
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

  /**
   * 환경 설정의 허용 스프레드시트인지 확인
   *
   * @throws {SheetsClientError} 403 허용 목록 밖
   */
  private assertAllowlisted(workbook: SheetWorkbookExpectation): void {
    if (this.environment.googleSheetsSpreadsheetId === undefined
      || workbook.spreadsheetId !== this.environment.googleSheetsSpreadsheetId) {
      throw new SheetsClientError(403, "GOOGLE_SHEETS_SPREADSHEET_NOT_ALLOWLISTED");
    }
  }

  /**
   * 매핑의 스키마 버전·구조 지문이 현재 코드와 같은지 확인
   *
   * @throws {SheetsClientError} 400 지문 불일치
   */
  private assertSchemaFingerprint(workbook: SheetWorkbookExpectation): void {
    if (workbook.schemaVersion !== SHEET_SCHEMA_VERSION
      || workbook.schemaFingerprint !== SHEET_SCHEMA_FINGERPRINT) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_SCHEMA_FINGERPRINT_MISMATCH");
    }
  }

  /**
   * 스프레드시트 구조 검증
   *
   * 로캘 ko_KR·시간대 Asia/Seoul, 세 시트의 ID·제목·열 수, 표식 열 숨김·보호, 머리글 확인
   *
   * @throws {SheetsClientError} 400 구조 변경 감지
   */
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

  /**
   * 기술 표식 열이 숨김·보호되고 편집자가 서비스 계정·소유자로 제한되는지 확인
   *
   * @throws {SheetsClientError} 400 GOOGLE_SHEETS_TECHNICAL_COLUMN_UNSAFE
   */
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

  /**
   * 머리글 행 검증. 업무 머리글 일치, 예비 열 비어 있음, 표식 머리글 일치
   *
   * @throws {SheetsClientError} 400 GOOGLE_SHEETS_HEADER_DRIFT
   */
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

  /**
   * 예약명단 학생 행 갱신 범위 계산
   *
   * 같은 표식의 업무 값이 있는 행이 있으면 그 행, 없으면 첫 빈 업무 행 또는 끝 다음 행에 기록
   * 대상 외 행에 남은 같은 표식은 지움
   */
  private buildStudentUpdates(plan: SheetDispatchPlan, rows: readonly (readonly string[])[]): SheetsValueRange[] {
    const marker = plan.row.marker;
    // 예약명단 행 식별은 예약 학생 ID만 사용
    // 같은 학번이 같은 스프레드시트의 다른 회차에 정상적으로 다시 나올 수 있으므로 학번으로 다른 예약 행을 옮기거나 덮어쓰면 안 됨
    const markerRowIndex = rows.findIndex((row, index) => index > 0
      && row[reservationMarkerIndex] === marker);
    const targetIndex = markerRowIndex >= 0
      && !this.isBusinessRowVacant(rows[markerRowIndex] ?? [], SHEET_BUSINESS_HEADERS.length)
      ? markerRowIndex
      : this.firstReusableRowIndex(rows, SHEET_BUSINESS_HEADERS.length);
    const targetRow = targetIndex + 1;
    const updates: SheetsValueRange[] = [];
    // 대상 행이 아닌 곳의 중복 표식 제거
    for (let index = 1; index < rows.length; index += 1) {
      if (index !== targetIndex && rows[index]?.[reservationMarkerIndex] === marker) {
        updates.push({ range: `${RESERVATION_SHEET_TITLE}!AD${index + 1}`, values: [[""]] });
      }
    }
    updates.push({ range: `${RESERVATION_SHEET_TITLE}!A${targetRow}:M${targetRow}`, values: [this.studentValues(plan)] });
    updates.push({ range: `${RESERVATION_SHEET_TITLE}!AD${targetRow}`, values: [[marker]] });
    return updates;
  }

  /**
   * 예약집계 가족 행 갱신 범위 계산. 행 선택 규칙은 예약명단과 같음
   */
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

  /**
   * 로그 이벤트 행 추가 범위 계산
   *
   * 같은 이벤트 표식의 업무 값이 이미 있으면 갱신하지 않음(추가 전용)
   *
   * @returns 갱신 범위와 기존 기록 존재 여부
   * @throws {SheetsClientError} 400 같은 이벤트 표식이 둘 이상
   */
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
    // 개발 초기화나 중단된 쓰기로 숨김 표식만 남은 빈 행이 생길 수 있음
    // 이런 행은 건너뛰지 않고 재사용해 다음 기록이 뒤로 밀리지 않게 함
    // 첫 빈 업무 행에 기록하고, 그 행이 아닌 곳에 남은 같은 표식은 지움
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

  /**
   * 예약명단에 표식 행이 하나이고 학번·값이 계획과 같은지 확인
   */
  private hasExactStudentProjection(rows: readonly (readonly string[])[], plan: SheetDispatchPlan): boolean {
    const matches = rows.filter((row, index) => index > 0 && row[reservationMarkerIndex] === plan.row.marker);
    return matches.length === 1
      && matches[0]?.[sourceStudentNoIndex] === plan.row.sourceStudentNo
      && this.sameValues(matches[0]!, this.studentValues(plan));
  }

  /**
   * 예약집계에 표식 행이 하나이고 값이 계획과 같은지 확인
   */
  private hasExactFamilyProjection(rows: readonly (readonly string[])[], plan: SheetDispatchPlan): boolean {
    const matches = rows.filter((row, index) => index > 0 && row[projectionMarkerIndex] === plan.family.marker);
    return matches.length === 1 && this.sameValues(matches[0]!, this.familyValues(plan));
  }

  /**
   * 로그에 이벤트 표식 행이 하나인지 확인
   *
   * @param requireExactValues 이번에 새로 기록한 경우에만 값까지 비교
   */
  private hasEventProjection(
    rows: readonly (readonly string[])[],
    plan: SheetDispatchPlan,
    requireExactValues: boolean,
  ): boolean {
    const matches = rows.filter((row, index) => index > 0 && row[projectionMarkerIndex] === plan.event.marker);
    return matches.length === 1 && (!requireExactValues || this.sameValues(matches[0]!, this.eventValues(plan)));
  }

  /**
   * 예약명단 A~M열 값
   */
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

  /**
   * 예약집계 A~M열 값
   */
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

  /**
   * 로그 A~M열 값
   */
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

  /**
   * 시트 값과 기대 값을 문자열로 비교
   */
  private sameValues(row: readonly string[], expected: readonly (string | number)[]): boolean {
    return expected.every((value, index) => (row[index] ?? "") === String(value));
  }

  /**
   * 첫 재사용 가능 행 위치(0부터, 머리글 제외)
   *
   * @returns 업무 열이 모두 빈 첫 행. 없으면 마지막 행 다음
   */
  private firstReusableRowIndex(
    rows: readonly (readonly string[])[],
    businessColumnCount: number,
  ): number {
    const vacantIndex = rows.findIndex((row, index) => index > 0
      && this.isBusinessRowVacant(row, businessColumnCount));
    return vacantIndex >= 0 ? vacantIndex : Math.max(rows.length, 1);
  }

  /**
   * 업무 열이 모두 비었는지 여부
   */
  private isBusinessRowVacant(row: readonly string[], businessColumnCount: number): boolean {
    return Array.from(
      { length: businessColumnCount },
      (_, index) => row[index] ?? "",
    ).every((value) => value === "");
  }

  /**
   * 오류를 반영 결과로 분류
   *
   * - 자격 증명·비활성·격리 위반, 400·401·403: BLOCKED(회로 차단)
   * - 429·5xx·네트워크 오류: RETRY
   * - 그 외·예상하지 못한 오류: DEAD
   */
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
