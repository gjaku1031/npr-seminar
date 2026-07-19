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

export interface SheetsMetadata {
  readonly locale: string;
  readonly timeZone: string;
  readonly driveOwnersPresent: boolean;
  readonly sheets: readonly { readonly sheetId: number; readonly title: string; readonly columnCount: number }[];
  readonly technicalColumns: readonly {
    readonly sheetId: number;
    readonly title: string;
    readonly hidden: boolean;
    readonly protected: boolean;
    readonly requestingUserCanEdit: boolean;
    /** Drive owners are implicit editors and are allowed in addition to the service account. */
    readonly editorsRestrictedToServiceAccount: boolean;
  }[];
}

export interface SheetsValueRange {
  readonly range: string;
  readonly values: readonly (readonly (string | number | boolean | null)[])[];
}

export class SheetsClientError extends Error {
  public constructor(public readonly status: number, public readonly code: string, public readonly writeMayHaveCommitted = false) {
    super(code);
  }
}

export type SheetsAccessMode = "DISPATCH" | "ACTIVATION";

export abstract class SheetsClient {
  public abstract assertSafeSharing(spreadsheetId: string, access?: SheetsAccessMode): Promise<void>;
  public abstract metadata(spreadsheetId: string, access?: SheetsAccessMode): Promise<SheetsMetadata>;
  public abstract batchGet(spreadsheetId: string, ranges: readonly string[], access?: SheetsAccessMode): Promise<Readonly<Record<string, readonly (readonly string[])[]>>>;
  public abstract batchUpdate(spreadsheetId: string, data: readonly SheetsValueRange[]): Promise<void>;
  public abstract ensureTechnicalMarkerColumn(spreadsheetId: string, markerHeader: string): Promise<void>;
}

interface ServiceAccount {
  readonly client_email: string;
  readonly private_key: string;
}

const googleTokenUri = "https://oauth2.googleapis.com/token";

@Injectable()
export class GoogleSheetsV4Client extends SheetsClient {
  private accessToken: { readonly value: string; readonly expiresAt: number } | null = null;
  private serviceAccountCache: ServiceAccount | null = null;

  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) { super(); }

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

    const structuralUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
    if (familySummary === null) {
      await this.request("POST", structuralUrl, true, { requests: [{ addSheet: { properties: {
        sheetId: FAMILY_SUMMARY_SHEET_ID,
        title: FAMILY_SUMMARY_SHEET_TITLE,
        gridProperties: { rowCount: 1000, columnCount: FAMILY_SUMMARY_SHEET_COLUMN_COUNT },
      } } }] }, "ACTIVATION");
      metadata = await this.metadata(spreadsheetId, "ACTIVATION");
    }

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

  public async batchUpdate(spreadsheetId: string, data: readonly SheetsValueRange[]): Promise<void> {
    await this.request("POST", `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, true, {
      valueInputOption: "RAW",
      includeValuesInResponse: false,
      data,
    });
  }

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

  private assertExistingTechnicalSafety(metadata: SheetsMetadata, sheetId: number, title: string): void {
    const technical = this.exactTechnicalColumn(metadata, sheetId, title);
    if (technical.protected && (!technical.requestingUserCanEdit || !technical.editorsRestrictedToServiceAccount)) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_TECHNICAL_COLUMN_UNSAFE");
    }
  }

  private exactTechnicalColumn(metadata: SheetsMetadata, sheetId: number, title: string): SheetsMetadata["technicalColumns"][number] {
    const candidates = metadata.technicalColumns.filter((column) => column.sheetId === sheetId || column.title === title);
    if (candidates.length !== 1 || candidates[0]?.sheetId !== sheetId || candidates[0].title !== title) {
      throw new SheetsClientError(400, "GOOGLE_SHEETS_SCHEMA_DRIFT");
    }
    return candidates[0];
  }

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

  private normalizedEmail(value: string): string {
    return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  }

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
