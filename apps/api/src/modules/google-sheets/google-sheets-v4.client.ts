import { Inject, Injectable } from "@nestjs/common";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createSign } from "node:crypto";
import { isAbsolute, normalize } from "node:path";
import type { AppEnvironment } from "../../common/config/environment.js";
import {
  BOOKING_LOG_SHEET_COLUMN_COUNT,
  BOOKING_LOG_SHEET_ID,
  BOOKING_LOG_SHEET_TITLE,
  BOOKING_LOG_BUSINESS_HEADERS,
  BOOKING_LOG_RESERVED_BLANK_COLUMN_COUNT,
  BOOKING_LOG_TECHNICAL_MARKER_HEADER,
  FAMILY_SUMMARY_SHEET_COLUMN_COUNT,
  FAMILY_SUMMARY_SHEET_ID,
  FAMILY_SUMMARY_SHEET_TITLE,
  FAMILY_SUMMARY_BUSINESS_HEADERS,
  FAMILY_SUMMARY_RESERVED_BLANK_COLUMN_COUNT,
  FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
  locateExactBookingLogSheet,
  locateExactFamilySummarySheet,
  locateExactReservationSheet,
  RESERVATION_SHEET_TITLE,
  SHEET_BUSINESS_HEADERS,
  SHEET_RESERVED_BLANK_COLUMN_COUNT,
  SHEET_TECHNICAL_MARKER_HEADER,
} from "./google-sheets-schema.js";

/**
 * 스프레드시트 메타데이터와 기술 표식 열 보호 상태
 */
export interface SheetsMetadata {
  /**
   * 스프레드시트 로캘
   */
  readonly locale: string;

  /**
   * 스프레드시트 시간대
   */
  readonly timeZone: string;

  /**
   * Drive 소유자 존재 여부. 공유 드라이브 등 소유자가 없으면 false
   */
  readonly driveOwnersPresent: boolean;

  /**
   * 시트 목록
   */
  readonly sheets: readonly { readonly sheetId: number; readonly title: string; readonly columnCount: number }[];

  /**
   * 시트별 기술 표식 열 상태
   */
  readonly technicalColumns: readonly {
    /**
     * 시트 ID
     */
    readonly sheetId: number;

    /**
     * 시트 제목
     */
    readonly title: string;

    /**
     * 사용자가 숨긴 열 여부
     */
    readonly hidden: boolean;

    /**
     * 경고 전용이 아닌 보호 범위 적용 여부
     */
    readonly protected: boolean;

    /**
     * 서비스 계정이 보호 범위를 편집할 수 있는지 여부
     */
    readonly requestingUserCanEdit: boolean;

    /**
     * 보호 범위 편집자가 서비스 계정과 Drive 소유자로만 제한되는지 여부. 소유자는 암묵적 편집자라 허용
     */
    readonly editorsRestrictedToServiceAccount: boolean;
  }[];
}

/**
 * 값 기록 범위
 */
export interface SheetsValueRange {
  /**
   * A1 표기 범위
   */
  readonly range: string;

  /**
   * 행 단위 값
   */
  readonly values: readonly (readonly (string | number | boolean | null)[])[];
}

/**
 * Google API 호출 실패
 */
export class SheetsClientError extends Error {
  /**
   * 상태·코드·커밋 가능성 설정
   *
   * @param status HTTP 상태. 네트워크 오류는 0
   * @param writeMayHaveCommitted 쓰기 요청이 서버에 반영됐을 수 있는지 여부. true면 재시도 전 확인 필요
   */
  public constructor(public readonly status: number, public readonly code: string, public readonly writeMayHaveCommitted = false) {
    super(code);
  }
}

/**
 * 접근 목적. DISPATCH는 일반 반영, ACTIVATION은 운영자 활성화 작업(시트 사용 비활성이어도 허용)
 */
export type SheetsAccessMode = "DISPATCH" | "ACTIVATION";

/**
 * 스프레드시트 접근 추상화. 테스트에서 가짜 구현으로 교체
 */
export abstract class SheetsClient {
  /**
   * 공유 설정 안전성 확인
   */
  public abstract assertSafeSharing(spreadsheetId: string, access?: SheetsAccessMode): Promise<void>;

  /**
   * 메타데이터 조회
   */
  public abstract metadata(spreadsheetId: string, access?: SheetsAccessMode): Promise<SheetsMetadata>;

  /**
   * 여러 범위 값 조회
   */
  public abstract batchGet(spreadsheetId: string, ranges: readonly string[], access?: SheetsAccessMode): Promise<Readonly<Record<string, readonly (readonly string[])[]>>>;

  /**
   * 여러 범위 값 기록
   */
  public abstract batchUpdate(spreadsheetId: string, data: readonly SheetsValueRange[]): Promise<void>;

  /**
   * 기술 표식 열 준비
   */
  public abstract ensureTechnicalMarkerColumn(spreadsheetId: string, markerHeader: string): Promise<void>;
}

/**
 * 서비스 계정 자격 증명 JSON의 필요한 필드
 */
interface ServiceAccount {
  /**
   * 서비스 계정 이메일
   */
  readonly client_email: string;

  /**
   * PEM 개인 키
   */
  readonly private_key: string;
}

/**
 * Google OAuth 토큰 엔드포인트
 */
const googleTokenUri = "https://oauth2.googleapis.com/token";

/**
 * Google Sheets v4·Drive v3 REST 클라이언트
 *
 * 서비스 계정 JWT로 접근 토큰을 받아 캐시. 워커 프로세스 전용
 */
@Injectable()
export class GoogleSheetsV4Client extends SheetsClient {
  /**
   * 접근 토큰 캐시. 만료 1분 전까지 재사용
   */
  private accessToken: { readonly value: string; readonly expiresAt: number } | null = null;

  /**
   * 검증된 서비스 계정 캐시
   */
  private serviceAccountCache: ServiceAccount | null = null;

  /**
   * 실행 환경 주입. 시트 사용 여부·자격 증명 경로를 읽음
   */
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) { super(); }

  /**
   * 스프레드시트 공유 설정 안전성 확인
   *
   * 1. 스프레드시트 파일이고 휴지통에 없으며 서비스 계정이 편집 가능해야 함
   * 2. 권한 목록 전체를 페이지 단위로 확인. 링크 공개·도메인·그룹 권한은 읽기 권한이라도 거부
   * 3. 개발 환경 예외 설정이 있을 때만 링크 공개 편집 허용
   * 4. 서비스 계정이 사용자 권한으로 직접 편집자여야 함
   *
   * @throws {SheetsClientError} 403 안전하지 않은 공유·편집 권한 없음, 400 스프레드시트 아님
   */
  public async assertSafeSharing(spreadsheetId: string, access: SheetsAccessMode = "DISPATCH"): Promise<void> {
    const account = await this.serviceAccount();
    const baseUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}`;
    const file = await this.request("GET", `${baseUrl}?supportsAllDrives=true&fields=id,mimeType,trashed,capabilities(canEdit)`, false, undefined, access) as {
      mimeType?: string;
      trashed?: boolean;
      capabilities?: { canEdit?: boolean };
    };
    if (file.mimeType !== "application/vnd.google-apps.spreadsheet" || file.trashed === true) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_WORKBOOK_INVALID");
    }
    if (file.capabilities?.canEdit !== true) {
      throw new SheetsClientError(403, "GOOGLE_SHEETS_SERVICE_ACCOUNT_EDITOR_REQUIRED");
    }

    let pageToken: string | undefined;
    let serviceAccountIsDirectEditor = false;
    do {
      const query = new URLSearchParams({
        supportsAllDrives: "true",
        pageSize: "100",
        fields: "nextPageToken,permissions(type,role,deleted,emailAddress)",
        ...(pageToken === undefined ? {} : { pageToken }),
      });
      const payload = await this.request("GET", `${baseUrl}/permissions?${query.toString()}`, false, undefined, access) as {
        nextPageToken?: string;
        permissions?: Array<{ type?: string; role?: string; deleted?: boolean; emailAddress?: string }>;
      };
      for (const permission of payload.permissions ?? []) {
        if (permission.deleted === true) continue;
        const writable = ["owner", "organizer", "fileOrganizer", "writer"].includes(permission.role ?? "");
        if (permission.type === "anyone") {
          if (permission.role === "writer"
            && this.environment.googleSheetsAllowPublicWriterInDevelopment === true) continue;
          throw new SheetsClientError(403, writable ? "WORKBOOK_LINK_WRITER_ACCESS" : "WORKBOOK_PUBLIC_ACCESS");
        }
        if (permission.type === "domain") {
          throw new SheetsClientError(403, writable ? "WORKBOOK_DOMAIN_WRITER_ACCESS" : "WORKBOOK_DOMAIN_ACCESS");
        }
        if (permission.type === "group") {
          throw new SheetsClientError(403, writable ? "WORKBOOK_GROUP_WRITER_ACCESS" : "WORKBOOK_GROUP_ACCESS");
        }
        if (permission.type === "user" && permission.emailAddress === account.client_email && writable) {
          serviceAccountIsDirectEditor = true;
        }
      }
      pageToken = payload.nextPageToken;
    } while (pageToken !== undefined && pageToken !== "");
    if (!serviceAccountIsDirectEditor) {
      throw new SheetsClientError(403, "GOOGLE_SHEETS_SERVICE_ACCOUNT_EDITOR_REQUIRED");
    }
  }

  /**
   * 스프레드시트 메타데이터와 기술 표식 열 상태 조회
   *
   * 예약명단 AD열, 예약집계·로그 Z열을 기술 표식 열로 보고 숨김·보호·편집자 제한 여부 계산
   */
  public async metadata(spreadsheetId: string, access: SheetsAccessMode = "DISPATCH"): Promise<SheetsMetadata> {
    const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
    const payload = await this.request("GET", `${baseUrl}?fields=properties(locale,timeZone),sheets.properties(sheetId,title,gridProperties(columnCount))`, false, undefined, access) as {
      properties?: { locale?: string; timeZone?: string };
      sheets?: Array<{ properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }>;
    };
    const sheetIdentities = (payload.sheets ?? []).flatMap((sheet) => sheet.properties?.sheetId === undefined
      || sheet.properties.title === undefined || sheet.properties.gridProperties?.columnCount === undefined
      ? [] : [{
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        columnCount: sheet.properties.gridProperties.columnCount,
      }]);
    // 존재하는 시트의 기술 표식 열만 조회
    const markerTargets = [
      { title: RESERVATION_SHEET_TITLE, column: "AD", markerIndex: 29 },
      { title: FAMILY_SUMMARY_SHEET_TITLE, column: "Z", markerIndex: 25 },
      { title: BOOKING_LOG_SHEET_TITLE, column: "Z", markerIndex: 25 },
    ].filter((target) => sheetIdentities.some((sheet) => sheet.title === target.title));
    const technicalQuery = markerTargets.map((target) => `ranges=${encodeURIComponent(`${target.title}!${target.column}:${target.column}`)}`)
      .join("&");
    const technical = markerTargets.length === 0 ? { sheets: [] } : await this.request("GET", `${baseUrl}?includeGridData=true&${technicalQuery}&fields=sheets(properties(sheetId,title),data.columnMetadata.hiddenByUser,protectedRanges(range(sheetId,startColumnIndex,endColumnIndex),warningOnly,requestingUserCanEdit,editors(users,groups,domainUsersCanEdit)))`, false, undefined, access) as {
      sheets?: Array<{
        properties?: { sheetId?: number; title?: string };
        data?: Array<{ columnMetadata?: Array<{ hiddenByUser?: boolean }> }>;
        protectedRanges?: Array<{
          warningOnly?: boolean;
          requestingUserCanEdit?: boolean;
          editors?: { users?: string[]; groups?: string[]; domainUsersCanEdit?: boolean };
          range?: { sheetId?: number; startColumnIndex?: number; endColumnIndex?: number };
        }>;
      }>;
    };
    // 보호 편집자는 서비스 계정과 Drive 소유자만 허용
    const ownerEmails = await this.driveOwnerEmails(spreadsheetId, access);
    const account = await this.serviceAccount();
    const serviceAccountEmail = this.normalizedEmail(account.client_email);
    return {
      locale: payload.properties?.locale ?? "",
      timeZone: payload.properties?.timeZone ?? "",
      driveOwnersPresent: ownerEmails.size > 0,
      sheets: sheetIdentities,
      technicalColumns: (technical.sheets ?? []).flatMap((sheet) => {
        const sheetId = sheet.properties?.sheetId;
        const title = sheet.properties?.title;
        if (sheetId === undefined || title === undefined) return [];
        const markerIndex = markerTargets.find((target) => target.title === title)?.markerIndex;
        if (markerIndex === undefined) return [];
        const protectedColumn = (sheet.protectedRanges ?? []).find((item) => {
          const range = item.range;
          return item.warningOnly !== true && range?.sheetId === sheetId
            && (range.startColumnIndex ?? 0) <= markerIndex
            && (range.endColumnIndex ?? Number.MAX_SAFE_INTEGER) >= markerIndex + 1;
        });
        const protectedEditors = new Set((protectedColumn?.editors?.users ?? [])
          .map((email) => this.normalizedEmail(email)).filter((email) => email !== ""));
        const allowedEditors = new Set([serviceAccountEmail, ...ownerEmails]);
        return [{
          sheetId,
          title,
          hidden: (sheet.data ?? []).some((data) => (data.columnMetadata ?? []).some((column) => column.hiddenByUser === true)),
          protected: protectedColumn !== undefined,
          requestingUserCanEdit: protectedColumn?.requestingUserCanEdit === true,
          editorsRestrictedToServiceAccount: protectedColumn !== undefined
            && ownerEmails.size > 0
            && protectedColumn.editors?.domainUsersCanEdit !== true
            && (protectedColumn.editors?.groups?.length ?? 0) === 0
            && protectedEditors.has(serviceAccountEmail)
            && [...protectedEditors].every((email) => allowedEditors.has(email)),
        }];
      }),
    };
  }

  /**
   * 기술 표식 열 준비. 운영자 활성화 작업 전용
   *
   * 1. 세 시트의 ID·제목·열 수 확인. 예약집계 시트만 없을 수 있음
   * 2. 업무 머리글·예비 빈 열·표식 머리글이 기대와 다르면 변경 없이 중단
   * 3. 기존 보호 범위가 안전하지 않으면 중단
   * 4. 예약집계 시트가 없으면 생성 후 메타데이터 재조회
   * 5. 빈 머리글 채우기, 표식 열 숨김·보호 요청을 한 번의 batchUpdate로 적용
   *
   * @param markerHeader 예약명단 표식 머리글. 다른 값이면 거부
   * @throws {SheetsClientError} 400 구조·머리글 불일치, 보호 설정 위험
   */
  public async ensureTechnicalMarkerColumn(spreadsheetId: string, markerHeader: string): Promise<void> {
    if (markerHeader !== SHEET_TECHNICAL_MARKER_HEADER) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_TECHNICAL_HEADER_CONFLICT");
    }
    let metadata = await this.metadata(spreadsheetId, "ACTIVATION");
    if (!metadata.driveOwnersPresent) throw new SheetsClientError(400, "GOOGLE_SHEETS_TECHNICAL_COLUMN_UNSAFE");
    const reservation = locateExactReservationSheet(metadata.sheets);
    const bookingLog = locateExactBookingLogSheet(metadata.sheets);
    const familySummaryCandidate = metadata.sheets.filter((sheet) => sheet.sheetId === FAMILY_SUMMARY_SHEET_ID
      || sheet.title === FAMILY_SUMMARY_SHEET_TITLE);
    const familySummary = locateExactFamilySummarySheet(metadata.sheets);
    if (reservation === null || bookingLog === null || familySummaryCandidate.length > 1
      || (familySummaryCandidate.length === 1 && familySummary === null)) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_SCHEMA_DRIFT");
    }

    // 변경 전 머리글 검증. 업무 데이터가 있는 시트를 덮어쓰지 않도록 먼저 확인
    const initialRanges = [
      `${RESERVATION_SHEET_TITLE}!A1:AD1`,
      `${BOOKING_LOG_SHEET_TITLE}!A1:Z1`,
      ...(familySummary === null ? [] : [`${FAMILY_SUMMARY_SHEET_TITLE}!A1:Z1`]),
    ];
    const initialHeaders = await this.batchGet(spreadsheetId, initialRanges, "ACTIVATION");
    this.assertPreparatoryHeader(
      initialHeaders[initialRanges[0]!]?.[0] ?? [],
      SHEET_BUSINESS_HEADERS,
      SHEET_RESERVED_BLANK_COLUMN_COUNT,
      29,
      SHEET_TECHNICAL_MARKER_HEADER,
      false,
    );
    this.assertPreparatoryHeader(
      initialHeaders[initialRanges[1]!]?.[0] ?? [],
      BOOKING_LOG_BUSINESS_HEADERS,
      BOOKING_LOG_RESERVED_BLANK_COLUMN_COUNT,
      25,
      BOOKING_LOG_TECHNICAL_MARKER_HEADER,
      true,
    );
    if (familySummary !== null) {
      this.assertPreparatoryHeader(
        initialHeaders[initialRanges[2]!]?.[0] ?? [],
        FAMILY_SUMMARY_BUSINESS_HEADERS,
        FAMILY_SUMMARY_RESERVED_BLANK_COLUMN_COUNT,
        25,
        FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
        true,
      );
    }
    this.assertExistingTechnicalSafety(metadata, reservation.sheetId, reservation.title);
    this.assertExistingTechnicalSafety(metadata, bookingLog.sheetId, bookingLog.title);
    if (familySummary !== null) this.assertExistingTechnicalSafety(metadata, familySummary.sheetId, familySummary.title);

    // 예약집계 시트 생성
    const structuralUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
    if (familySummary === null) {
      await this.request("POST", structuralUrl, true, { requests: [{ addSheet: { properties: {
        sheetId: FAMILY_SUMMARY_SHEET_ID,
        title: FAMILY_SUMMARY_SHEET_TITLE,
        gridProperties: { rowCount: 1000, columnCount: FAMILY_SUMMARY_SHEET_COLUMN_COUNT },
      } } }] }, "ACTIVATION");
      metadata = await this.metadata(spreadsheetId, "ACTIVATION");
    }

    // 생성 이후 구조 재확인과 머리글 채우기 요청 수집
    const preparedReservation = locateExactReservationSheet(metadata.sheets);
    const preparedSummary = locateExactFamilySummarySheet(metadata.sheets);
    const preparedLog = locateExactBookingLogSheet(metadata.sheets);
    if (preparedReservation === null || preparedSummary === null || preparedLog === null) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_SCHEMA_DRIFT");
    }
    const ranges = [
      `${RESERVATION_SHEET_TITLE}!A1:AD1`,
      `${FAMILY_SUMMARY_SHEET_TITLE}!A1:Z1`,
      `${BOOKING_LOG_SHEET_TITLE}!A1:Z1`,
    ];
    const headers = await this.batchGet(spreadsheetId, ranges, "ACTIVATION");
    const requests: unknown[] = [];
    this.appendHeaderPreparation(requests, preparedReservation.sheetId, headers[ranges[0]!]?.[0] ?? [], {
      businessHeaders: SHEET_BUSINESS_HEADERS,
      reservedBlankCount: SHEET_RESERVED_BLANK_COLUMN_COUNT,
      markerIndex: 29,
      markerHeader: SHEET_TECHNICAL_MARKER_HEADER,
      allowBlank: false,
    });
    this.appendHeaderPreparation(requests, preparedSummary.sheetId, headers[ranges[1]!]?.[0] ?? [], {
      businessHeaders: FAMILY_SUMMARY_BUSINESS_HEADERS,
      reservedBlankCount: FAMILY_SUMMARY_RESERVED_BLANK_COLUMN_COUNT,
      markerIndex: 25,
      markerHeader: FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER,
      allowBlank: true,
    });
    this.appendHeaderPreparation(requests, preparedLog.sheetId, headers[ranges[2]!]?.[0] ?? [], {
      businessHeaders: BOOKING_LOG_BUSINESS_HEADERS,
      reservedBlankCount: BOOKING_LOG_RESERVED_BLANK_COLUMN_COUNT,
      markerIndex: 25,
      markerHeader: BOOKING_LOG_TECHNICAL_MARKER_HEADER,
      allowBlank: true,
    });
    // 표식 열 숨김·서비스 계정 전용 보호 요청 수집
    const account = await this.serviceAccount();
    for (const target of [
      { sheet: preparedReservation, markerIndex: 29, markerHeader: SHEET_TECHNICAL_MARKER_HEADER },
      { sheet: preparedSummary, markerIndex: 25, markerHeader: FAMILY_SUMMARY_TECHNICAL_MARKER_HEADER },
      { sheet: preparedLog, markerIndex: 25, markerHeader: BOOKING_LOG_TECHNICAL_MARKER_HEADER },
    ]) {
      const technical = this.exactTechnicalColumn(metadata, target.sheet.sheetId, target.sheet.title);
      if (technical.protected && (!technical.requestingUserCanEdit || !technical.editorsRestrictedToServiceAccount)) {
        throw new SheetsClientError(400, "GOOGLE_SHEETS_TECHNICAL_COLUMN_UNSAFE");
      }
      if (!technical.hidden) requests.push({ updateDimensionProperties: {
        range: {
          sheetId: target.sheet.sheetId,
          dimension: "COLUMNS",
          startIndex: target.markerIndex,
          endIndex: target.markerIndex + 1,
        },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser",
      } });
      if (!technical.protected) requests.push({ addProtectedRange: { protectedRange: {
        range: {
          sheetId: target.sheet.sheetId,
          startColumnIndex: target.markerIndex,
          endColumnIndex: target.markerIndex + 1,
        },
        description: `NPR technical marker: ${target.markerHeader}`,
        warningOnly: false,
        editors: { users: [account.client_email] },
      } } });
    }
    if (requests.length > 0) {
      await this.request("POST", structuralUrl, true, { requests }, "ACTIVATION");
    }
  }

  /**
   * 여러 범위 값을 문자열 행으로 조회
   *
   * @returns 요청 범위 문자열별 행 목록. 값이 없는 범위는 빈 배열
   */
  public async batchGet(spreadsheetId: string, ranges: readonly string[], access: SheetsAccessMode = "DISPATCH"): Promise<Readonly<Record<string, readonly (readonly string[])[]>>> {
    const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join("&");
    const payload = await this.request("GET", `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?majorDimension=ROWS&${query}`, false, undefined, access) as {
      valueRanges?: Array<{ range?: string; values?: Array<Array<string | number | boolean>> }>;
    };
    const result: Record<string, readonly (readonly string[])[]> = {};
    for (let index = 0; index < ranges.length; index += 1) {
      const values = payload.valueRanges?.[index]?.values ?? [];
      result[ranges[index]!] = values.map((row) => row.map(String));
    }
    return result;
  }

  /**
   * 여러 범위 값을 RAW로 기록. 쓰기 요청이라 5xx·네트워크 오류는 커밋 가능성 있음으로 표시
   */
  public async batchUpdate(spreadsheetId: string, data: readonly SheetsValueRange[]): Promise<void> {
    await this.request("POST", `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, true, {
      valueInputOption: "RAW",
      includeValuesInResponse: false,
      data,
    });
  }

  /**
   * 준비 전 머리글 검증
   *
   * 업무 머리글 일치, 예비 열 비어 있음, 표식 열은 비었거나 기대 값이어야 함
   *
   * @param allowBlank 행 전체가 비어 있으면 통과 여부
   * @throws {SheetsClientError} 400 GOOGLE_SHEETS_HEADER_DRIFT
   */
  private assertPreparatoryHeader(
    row: readonly string[],
    businessHeaders: readonly string[],
    reservedBlankCount: number,
    markerIndex: number,
    markerHeader: string,
    allowBlank: boolean,
  ): void {
    if (allowBlank && row.every((value) => value === "")) return;
    const headersMatch = businessHeaders.every((header, index) => row[index] === header);
    const reservedBlank = Array.from(
      { length: reservedBlankCount },
      (_, offset) => row[businessHeaders.length + offset] ?? "",
    ).every((value) => value === "");
    const marker = row[markerIndex] ?? "";
    if (!headersMatch || !reservedBlank || (marker !== "" && marker !== markerHeader)) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_HEADER_DRIFT");
    }
  }

  /**
   * 머리글 준비 요청 추가
   *
   * 빈 행이면 업무 머리글·예비 열·표식 머리글 전체 기록, 표식 칸만 비었으면 표식 머리글만 기록
   */
  private appendHeaderPreparation(
    requests: unknown[],
    sheetId: number,
    row: readonly string[],
    expectation: {
      readonly businessHeaders: readonly string[];
      readonly reservedBlankCount: number;
      readonly markerIndex: number;
      readonly markerHeader: string;
      readonly allowBlank: boolean;
    },
  ): void {
    this.assertPreparatoryHeader(
      row,
      expectation.businessHeaders,
      expectation.reservedBlankCount,
      expectation.markerIndex,
      expectation.markerHeader,
      expectation.allowBlank,
    );
    const blank = row.every((value) => value === "");
    if (blank && expectation.allowBlank) {
      const values = [
        ...expectation.businessHeaders,
        ...Array.from({ length: expectation.reservedBlankCount }, () => ""),
        expectation.markerHeader,
      ];
      requests.push({ updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: expectation.markerIndex + 1,
        },
        rows: [{ values: values.map((value) => ({ userEnteredValue: { stringValue: value } })) }],
        fields: "userEnteredValue",
      } });
      return;
    }
    if ((row[expectation.markerIndex] ?? "") === "") {
      requests.push({ updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: expectation.markerIndex,
          endColumnIndex: expectation.markerIndex + 1,
        },
        rows: [{ values: [{ userEnteredValue: { stringValue: expectation.markerHeader } }] }],
        fields: "userEnteredValue",
      } });
    }
  }

  /**
   * 기존 기술 표식 열 보호 설정이 안전한지 확인
   *
   * @throws {SheetsClientError} 400 보호돼 있지만 서비스 계정이 편집 불가하거나 다른 편집자가 있을 때
   */
  private assertExistingTechnicalSafety(metadata: SheetsMetadata, sheetId: number, title: string): void {
    const technical = this.exactTechnicalColumn(metadata, sheetId, title);
    if (technical.protected && (!technical.requestingUserCanEdit || !technical.editorsRestrictedToServiceAccount)) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_TECHNICAL_COLUMN_UNSAFE");
    }
  }

  /**
   * ID·제목이 정확히 일치하는 기술 표식 열 상태
   *
   * @throws {SheetsClientError} 400 GOOGLE_SHEETS_SCHEMA_DRIFT
   */
  private exactTechnicalColumn(metadata: SheetsMetadata, sheetId: number, title: string): SheetsMetadata["technicalColumns"][number] {
    const candidates = metadata.technicalColumns.filter((column) => column.sheetId === sheetId || column.title === title);
    if (candidates.length !== 1 || candidates[0]?.sheetId !== sheetId || candidates[0].title !== title) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_SCHEMA_DRIFT");
    }
    return candidates[0];
  }

  /**
   * Google API 요청
   *
   * 시트 사용이 꺼져 있으면 활성화 작업 외 거부. 제한 시간 30초
   * 쓰기 요청의 5xx·네트워크 오류는 반영 여부 불명으로 표시
   *
   * @param write 쓰기 요청 여부
   * @returns 응답 JSON. 빈 본문이면 빈 객체
   * @throws {SheetsClientError} HTTP 오류·네트워크 오류
   */
  private async request(method: "GET" | "POST", url: string, write: boolean, body?: unknown, access: SheetsAccessMode = "DISPATCH"): Promise<unknown> {
    if (!this.environment.googleSheetsEnabled && access !== "ACTIVATION") {
      throw new SheetsClientError(503, "GOOGLE_SHEETS_DISABLED");
    }
    const token = await this.token();
    try {
      const response = await fetch(url, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new SheetsClientError(response.status, `GOOGLE_SHEETS_HTTP_${response.status}`, write && response.status >= 500);
      const text = await response.text();
      return text.length === 0 ? {} : JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof SheetsClientError) throw error;
      throw new SheetsClientError(0, write ? "GOOGLE_SHEETS_WRITE_UNKNOWN" : "GOOGLE_SHEETS_NETWORK_UNAVAILABLE", write);
    }
  }

  /**
   * 서비스 계정 JWT로 접근 토큰 발급
   *
   * 남은 유효 시간이 1분 넘게 남은 캐시 토큰은 재사용
   *
   * @throws {SheetsClientError} 서명 실패·토큰 요청 실패·응답 형식 오류
   */
  private async token(): Promise<string> {
    if (this.accessToken !== null && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const account = await this.serviceAccount();
    const now = Math.floor(Date.now() / 1_000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    let assertion: string;
    try {
      const claim = Buffer.from(JSON.stringify({
        iss: account.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly",
        aud: googleTokenUri,
        iat: now,
        exp: now + 3_600,
      })).toString("base64url");
      const unsigned = `${header}.${claim}`;
      const signer = createSign("RSA-SHA256");
      signer.update(unsigned); signer.end();
      assertion = `${unsigned}.${signer.sign(account.private_key).toString("base64url")}`;
    } catch {
      throw new SheetsClientError(503, "GOOGLE_SHEETS_CREDENTIAL_INVALID");
    }
    let response: Response;
    try {
      response = await fetch(googleTokenUri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new SheetsClientError(0, "GOOGLE_SHEETS_TOKEN_NETWORK_UNAVAILABLE");
    }
    if (!response.ok) throw new SheetsClientError(response.status, "GOOGLE_SHEETS_TOKEN_REJECTED");
    const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof payload.access_token !== "string") throw new SheetsClientError(503, "GOOGLE_SHEETS_TOKEN_INVALID");
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3_600;
    this.accessToken = { value: payload.access_token, expiresAt: Date.now() + expiresIn * 1_000 };
    return payload.access_token;
  }

  /**
   * Drive 소유자 이메일 집합. 정규화한 값
   */
  private async driveOwnerEmails(spreadsheetId: string, access: SheetsAccessMode): Promise<ReadonlySet<string>> {
    const baseUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}`;
    const file = await this.request(
      "GET",
      `${baseUrl}?supportsAllDrives=true&fields=owners(emailAddress)`,
      false,
      undefined,
      access,
    ) as { owners?: Array<{ emailAddress?: string }> };
    return new Set((file.owners ?? []).flatMap((owner) => {
      const email = this.normalizedEmail(owner.emailAddress ?? "");
      return email === "" ? [] : [email];
    }));
  }

  /**
   * 이메일 비교용 정규화. NFKC·공백 제거·소문자
   */
  private normalizedEmail(value: string): string {
    return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  }

  /**
   * 서비스 계정 자격 증명 로드
   *
   * 워커 프로세스에서만, 정규화된 절대 경로의 일반 파일을 심볼릭 링크 없이 열고
   * 프로세스 사용자 소유·그룹/기타 권한 없음(0600 계열)인 경우만 허용
   *
   * @throws {SheetsClientError} 503 프로세스 역할·경로·파일 권한·형식 오류
   */
  private async serviceAccount(): Promise<ServiceAccount> {
    if (this.serviceAccountCache !== null) return this.serviceAccountCache;
    const path = this.environment.googleApplicationCredentials;
    if (this.environment.processRole !== "worker") throw new SheetsClientError(503, "GOOGLE_SHEETS_WORKER_ISOLATION_REQUIRED");
    if (path === undefined || !isAbsolute(path) || normalize(path) !== path) {
      throw new SheetsClientError(503, "GOOGLE_SHEETS_CREDENTIAL_PATH_INVALID");
    }
    let account: ServiceAccount;
    try {
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stats = await handle.stat();
        const ownerMismatch = typeof process.getuid === "function" && stats.uid !== process.getuid();
        if (!stats.isFile() || ownerMismatch || (stats.mode & 0o077) !== 0) {
          throw new Error("unsafe credential file");
        }
        account = JSON.parse(await handle.readFile("utf8")) as ServiceAccount;
      } finally {
        await handle.close();
      }
    } catch {
      throw new SheetsClientError(503, "GOOGLE_SHEETS_CREDENTIAL_INVALID");
    }
    if (typeof account.client_email !== "string" || typeof account.private_key !== "string") {
      throw new SheetsClientError(503, "GOOGLE_SHEETS_CREDENTIAL_INVALID");
    }
    this.serviceAccountCache = account;
    return account;
  }
}
