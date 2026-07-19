import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import iconv from "iconv-lite";
import { type AppEnvironment, type TongWireContractConfiguration } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  TongTongTongGateway,
  type TongBranchDescriptor,
  type TongBranchSnapshot,
  type TongSession,
  type TongSourceAssignment,
} from "./tongtontong.gateway.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
interface HttpTongSession extends TongSession { readonly opaque: { readonly cookies: Map<string, string> }; }
type Configuration = ReturnType<HttpTongTongTongGateway["configuration"]>;
const USER_AGENT = "NPR-Student-Sync/1.0";

@Injectable()
export class HttpTongTongTongGateway extends TongTongTongGateway {
  public constructor(
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
    @Inject("TONG_HTTP_FETCH") private readonly fetcher: FetchLike,
  ) { super(); }

  public assertReady(): void { this.configuration(); }

  public async login(): Promise<TongSession> {
    const configuration = this.configuration();
    const { contract } = configuration;
    const cookies = new Map<string, string>();
    const loginPage = new URL(contract.login.pagePath, configuration.origin);
    loginPage.searchParams.set(contract.login.academyCodeQueryField, contract.login.academyCode);
    await this.request(configuration, cookies, { method: "GET", url: loginPage, charset: contract.login.htmlCharset });

    const credentials = new URLSearchParams({
      [contract.login.usernameField]: configuration.username,
      [contract.login.passwordField]: configuration.password,
      [contract.login.academyCodeField]: contract.login.academyCode,
    });
    const security = await this.request(configuration, cookies, {
      method: "POST", url: new URL(contract.login.securityPath, configuration.origin), body: credentials,
      charset: contract.login.securityCharset, referer: loginPage,
    });
    const actionReference = this.securityAction(security.body, contract);
    const action = this.safeLoginAction(actionReference, configuration);
    await this.request(configuration, cookies, {
      method: "POST", url: action, body: credentials, charset: contract.login.htmlCharset,
      referer: loginPage, acceptedStatuses: [200, 302, 303],
    });

    const verified = await this.request(configuration, cookies, {
      method: "GET", url: new URL(contract.login.defaultPath, configuration.origin), charset: contract.login.htmlCharset,
    });
    if (verified.body.toLocaleLowerCase("en-US").includes(contract.login.passwordFormMarker.toLocaleLowerCase("en-US"))) {
      this.fail("TONG_SESSION_VERIFICATION_FAILED");
    }
    const top = await this.request(configuration, cookies, {
      method: "GET", url: new URL(contract.login.topPath, configuration.origin), charset: contract.login.htmlCharset,
    });
    this.verifyAuthenticatedTop(top.body, contract);
    if (cookies.size === 0) this.fail("TONG_SESSION_COOKIE_MISSING");
    return { opaque: { cookies } } satisfies HttpTongSession;
  }

  public async fetchBranch(session: TongSession, branch: TongBranchDescriptor): Promise<TongBranchSnapshot> {
    const configuration = this.configuration();
    const { contract } = configuration;
    const cookies = this.cookies(session);
    const topUrl = new URL(contract.login.topPath, configuration.origin);
    let top = await this.request(configuration, cookies, {
      method: "GET", url: new URL(contract.login.topPath, configuration.origin), charset: contract.login.htmlCharset,
    });
    if (!this.topMatches(top.body, branch.sourceCode, contract)) {
      const switchBody = new URLSearchParams({
        [contract.switchBranch.paramField]: contract.switchBranch.paramValue,
        [contract.switchBranch.kindField]: contract.switchBranch.kindValue,
        [contract.switchBranch.usernameField]: configuration.username,
        [contract.switchBranch.passwordField]: configuration.password,
        [contract.switchBranch.targetField]: contract.switchBranch.targetValue,
        [contract.switchBranch.branchField]: branch.sourceCode,
      });
      await this.request(configuration, cookies, {
        method: "POST", url: new URL(contract.switchBranch.path, configuration.origin), body: switchBody,
        charset: contract.login.htmlCharset, referer: topUrl, acceptedStatuses: [200, 302, 303],
      });
      top = await this.request(configuration, cookies, {
        method: "GET", url: topUrl, charset: contract.login.htmlCharset,
      });
      this.verifyTop(top.body, branch.sourceCode, contract);
    }

    const frameBody = new URLSearchParams({
      [contract.students.filterField]: contract.students.filterValue,
      [contract.students.framePageField]: contract.students.framePageValue,
    });
    const frame = await this.request(configuration, cookies, {
      method: "POST", url: new URL(contract.students.framePath, configuration.origin), body: frameBody,
      charset: contract.students.charset,
    });
    const indexes = this.columnIndexes(frame.body, contract);
    const assignments: TongSourceAssignment[] = [];
    const hash = createHash("sha256").update(frame.bytes).update("\u0000frame\n");
    let expectedTotal: number | undefined;
    let effectivePageSize: number | undefined;
    let pageCount = 1;
    const previousPageKeys = new Set<string>();
    for (let page = 1; page <= pageCount; page += 1) {
      const pageBody = new URLSearchParams(Object.fromEntries(contract.students.searchFields.map((field) => [field, ""])));
      pageBody.set(contract.students.filterField, contract.students.filterValue);
      pageBody.set(contract.students.pageField, String(page));
      pageBody.set(contract.students.pageSizeField, String(contract.students.pageSize));
      const response = await this.request(configuration, cookies, {
        method: "POST", url: new URL(contract.students.gridPath, configuration.origin), body: pageBody,
        charset: contract.students.charset,
      });
      hash.update(response.bytes).update(`\u0000page:${page}\n`);
      const parsed = this.page(response.body, page, contract);
      if (parsed.rows.length > contract.students.maxRecords) this.fail("TONG_STUDENT_PAGE_SIZE_INVALID");
      if (expectedTotal === undefined) {
        expectedTotal = parsed.total;
        effectivePageSize = parsed.rows.length;
        if (expectedTotal > 0 && effectivePageSize === 0) this.fail("TONG_STUDENT_PAGE_ROW_COUNT_MISMATCH");
        // pq_rpp is only a hint on the legacy grid. Pin the first observed
        // page size for this fetch, then validate every remaining page and the
        // final total against that immutable observation.
        pageCount = expectedTotal === 0 ? 1 : Math.ceil(expectedTotal / effectivePageSize);
        if (pageCount > contract.students.maxPages) this.fail("TONG_STUDENT_PAGE_LIMIT_EXCEEDED");
      } else if (parsed.total !== expectedTotal) {
        this.fail("TONG_STUDENT_TOTAL_CHANGED");
      }
      if (effectivePageSize === undefined) this.fail("TONG_STUDENT_PAGE_SIZE_INVALID");
      if (page > 1 && parsed.rows.length > effectivePageSize) this.fail("TONG_STUDENT_PAGE_SIZE_INVALID");
      const expectedRows = expectedTotal === 0 ? 0
        : page < pageCount ? effectivePageSize : expectedTotal - assignments.length;
      if (parsed.rows.length !== expectedRows) this.fail("TONG_STUDENT_PAGE_ROW_COUNT_MISMATCH");
      const mapped = this.mapRows(parsed.rows, indexes);
      const currentPageKeys = new Set<string>();
      for (const assignment of mapped) {
        const key = this.assignmentIdentity(assignment);
        if (previousPageKeys.has(key) || currentPageKeys.has(key)) this.fail("TONG_STUDENT_PAGE_DUPLICATE_ROW");
        currentPageKeys.add(key);
      }
      for (const key of currentPageKeys) previousPageKeys.add(key);
      assignments.push(...mapped);
    }
    if (expectedTotal === undefined || assignments.length !== expectedTotal) this.fail("TONG_STUDENT_TOTAL_MISMATCH");
    return { branch: branch.code, assignments, snapshotHash: hash.digest() };
  }

  private securityAction(body: string, contract: TongWireContractConfiguration): string {
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { this.fail("TONG_AUTH_RESULT_INDETERMINATE"); }
    if (!Array.isArray(payload) || payload.length === 0 || !this.record(payload[0])) this.fail("TONG_AUTH_RESULT_INDETERMINATE");
    const code = payload[0][contract.login.resultCodeField];
    const action = payload[0][contract.login.actionField];
    if (typeof code !== "string" || !contract.login.successResultCodes.includes(code)
      || typeof action !== "string" || action.trim() === "") this.fail("TONG_AUTH_RESULT_INDETERMINATE");
    return action;
  }

  private safeLoginAction(reference: string, configuration: Configuration): URL {
    if (/\p{C}|\s/u.test(reference) || reference.includes("..") || reference.startsWith("//")) {
      this.fail("TONG_LOGIN_ACTION_INVALID");
    }
    const base = new URL(configuration.contract.login.actionPathPrefix, configuration.origin);
    const action = new URL(reference, base);
    if (action.origin !== configuration.origin.origin || action.username !== "" || action.password !== ""
      || !action.pathname.startsWith(configuration.contract.login.actionPathPrefix) || action.hash !== "") {
      this.fail("TONG_LOGIN_ACTION_INVALID");
    }
    return action;
  }

  private verifyTop(body: string, expectedBranchCode: string, contract: TongWireContractConfiguration): void {
    if (!this.topMatches(body, expectedBranchCode, contract)) this.fail("TONG_BRANCH_CONTEXT_INDETERMINATE");
  }

  private verifyAuthenticatedTop(body: string, contract: TongWireContractConfiguration): void {
    if (!contract.login.topRequiredMarkers.every((marker) => body.includes(marker))) {
      this.fail("TONG_BRANCH_CONTEXT_INDETERMINATE");
    }
    let offset = 0;
    while (offset < body.length) {
      const marker = body.indexOf(contract.login.branchCodeMarkerPrefix, offset);
      if (marker < 0) break;
      const afterMarker = body.slice(marker + contract.login.branchCodeMarkerPrefix.length);
      if (/^[A-Z0-9]{1,32}(?![A-Z0-9])/u.test(afterMarker)) return;
      offset = marker + contract.login.branchCodeMarkerPrefix.length;
    }
    this.fail("TONG_BRANCH_CONTEXT_INDETERMINATE");
  }

  private topMatches(body: string, expectedBranchCode: string, contract: TongWireContractConfiguration): boolean {
    return contract.login.topRequiredMarkers.every((marker) => body.includes(marker))
      && body.includes(`${contract.login.branchCodeMarkerPrefix}${expectedBranchCode}`);
  }

  private columnIndexes(frame: string, contract: TongWireContractConfiguration): Readonly<Record<string, string>> {
    const titleMap = new Map<string, string>();
    const dataIndexes = new Set<string>();
    const columnPattern = /dataIndx\s*:\s*["']([^"']+)["'][^{}]{0,2000}?title\s*:\s*["']([^"']*)["']/gu;
    for (const match of frame.matchAll(columnPattern)) {
      const dataIndex = match[1]?.normalize("NFKC").trim();
      const title = match[2]?.normalize("NFKC").trim();
      if (dataIndex === undefined || title === undefined || dataIndex === "") this.fail("TONG_COLMODEL_INCOMPATIBLE");
      if (dataIndexes.has(dataIndex)) this.fail("TONG_COLMODEL_DUPLICATE");
      dataIndexes.add(dataIndex);
      // Captured branch frames contain unnamed presentation-only columns. They
      // are not source fields, but their data indexes still participate in the
      // duplicate guard so a named column cannot alias one of them.
      if (title === "") continue;
      if (titleMap.has(title)) this.fail("TONG_COLMODEL_DUPLICATE");
      titleMap.set(title, dataIndex);
    }
    if (titleMap.size === 0) this.fail("TONG_COLMODEL_INCOMPATIBLE");
    const indexes = Object.fromEntries(Object.entries(contract.columns).flatMap(([semantic, configuredTitle]) => {
      if (configuredTitle === undefined) return [];
      const dataIndex = titleMap.get(configuredTitle.normalize("NFKC").trim());
      if (semantic === "fatherPhone" && dataIndex === undefined) return [];
      if (dataIndex === undefined) this.fail("TONG_COLMODEL_REQUIRED_COLUMN_MISSING");
      return [[semantic, dataIndex]];
    })) as Record<string, string>;
    if (new Set(Object.values(indexes)).size !== Object.values(indexes).length) this.fail("TONG_COLMODEL_INCOMPATIBLE");
    return indexes;
  }

  private page(body: string, expectedPage: number, contract: TongWireContractConfiguration): {
    readonly total: number; readonly rows: readonly unknown[];
  } {
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { this.fail("TONG_STUDENT_PAYLOAD_INVALID"); }
    if (!this.record(payload)) this.fail("TONG_STUDENT_PAYLOAD_INVALID");
    const currentPage = payload[contract.students.currentPageField];
    const total = payload[contract.students.totalRecordsField];
    const rows = payload[contract.students.rowsField];
    if (currentPage !== expectedPage || !Number.isSafeInteger(total) || (total as number) < 0
      || (total as number) > contract.students.maxRecords || !Array.isArray(rows)) this.fail("TONG_STUDENT_PAYLOAD_INVALID");
    return { total: total as number, rows };
  }

  private mapRows(rows: readonly unknown[], indexes: Readonly<Record<string, string>>): readonly TongSourceAssignment[] {
    return rows.map((rawRow) => {
      if (!this.record(rawRow)) this.fail("TONG_STUDENT_ROW_INVALID");
      const value = (key: string): string => {
        const index = indexes[key];
        if (index === undefined) this.fail("TONG_COLMODEL_REQUIRED_COLUMN_MISSING");
        const raw = rawRow[index];
        if (raw === null || raw === undefined) return "";
        if (typeof raw !== "string" && typeof raw !== "number") this.fail("TONG_STUDENT_ROW_INVALID");
        return String(raw).normalize("NFKC").trim();
      };
      const fatherPhone = indexes.fatherPhone === undefined ? undefined : value("fatherPhone");
      return {
        sourceUniqueNo: value("sourceUniqueNo"), classRegistrationNo: value("classRegistrationNo"),
        studentNo: value("studentNo"), name: value("name"), className: value("className"),
        motherPhone: value("motherPhone"), schoolName: value("schoolName"), grade: value("grade"),
        teacherName: value("teacherName"), unitName: value("unitName"), sourceStatus: value("sourceStatus"),
        ...(fatherPhone === undefined ? {} : { fatherPhone }),
      };
    });
  }

  private assignmentIdentity(assignment: TongSourceAssignment): string {
    return `${assignment.studentNo}\u0000${assignment.sourceUniqueNo}\u0000${assignment.classRegistrationNo}`;
  }

  private async request(configuration: Configuration, cookies: Map<string, string>, options: {
    readonly method: "GET" | "POST";
    readonly url: URL;
    readonly body?: URLSearchParams;
    readonly charset: "utf-8" | "cp949";
    readonly referer?: URL;
    readonly acceptedStatuses?: readonly number[];
  }): Promise<{ readonly body: string; readonly bytes: Buffer }> {
    if (options.url.origin !== configuration.origin.origin || options.url.username !== "" || options.url.password !== "") {
      this.fail("TONG_REQUEST_URL_INVALID");
    }
    let response: Response;
    try {
      response = await this.fetcher(options.url, {
        method: options.method, redirect: "manual", signal: AbortSignal.timeout(configuration.contract.timeoutMs),
        headers: {
          accept: "application/json,text/html;q=0.9,*/*;q=0.1",
          // Keep the production adapter on the same captured request profile as
          // the separately verified one-shot login/snapshot tooling. A stable,
          // non-browser identifier also avoids inheriting Node's versioned UA.
          "user-agent": USER_AGENT,
          ...(options.body === undefined ? {} : {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            origin: configuration.origin.origin,
          }),
          ...(options.referer === undefined ? {} : { referer: options.referer.toString() }),
          ...(cookies.size === 0 ? {} : { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") }),
        },
        ...(options.body === undefined ? {} : { body: options.body.toString() }),
      });
    } catch { this.fail("TONG_HTTP_REQUEST_FAILED"); }
    this.captureCookies(response, cookies);
    const acceptedStatuses = options.acceptedStatuses ?? [200];
    if (!acceptedStatuses.includes(response.status)) this.fail("TONG_HTTP_RESPONSE_FAILED");
    const bytes = await this.responseBytes(response, configuration.contract.maxResponseBytes);
    return { body: this.decode(bytes, response.headers.get("content-type"), options.charset), bytes };
  }

  private async responseBytes(response: Response, limit: number): Promise<Buffer> {
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > limit)) {
      this.fail("TONG_HTTP_RESPONSE_TOO_LARGE");
    }
    if (response.body === null) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const result = await reader.read().catch(() => this.fail("TONG_HTTP_RESPONSE_FAILED"));
      if (result.done) break;
      length += result.value.byteLength;
      if (length > limit) { await reader.cancel().catch(() => undefined); this.fail("TONG_HTTP_RESPONSE_TOO_LARGE"); }
      chunks.push(result.value);
    }
    return Buffer.concat(chunks, length);
  }

  private captureCookies(response: Response, cookies: Map<string, string>): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const values = headers.getSetCookie?.() ?? (response.headers.get("set-cookie") === null ? [] : [response.headers.get("set-cookie")!]);
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair?.indexOf("=") ?? -1;
      if (pair === undefined || separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) cookies.set(name, cookieValue);
    }
  }

  private cookies(session: TongSession): Map<string, string> {
    const opaque = session.opaque as Partial<HttpTongSession["opaque"]>;
    if (!(opaque.cookies instanceof Map)) this.fail("TONG_SESSION_INVALID");
    return opaque.cookies;
  }

  private configuration() {
    if (!this.environment.tongSyncEnabled) this.fail("TONG_SYNC_DISABLED", 503);
    if (this.environment.tongWireContractConfirmed !== true || this.environment.tongWireContract === undefined
      || this.environment.tongBaseUrl === undefined || this.environment.tongUsername === undefined
      || this.environment.tongPassword === undefined) this.fail("TONG_WIRE_CONTRACT_UNCONFIRMED", 503);
    const titles = Object.values(this.environment.tongWireContract.columns)
      .filter((value): value is string => value !== undefined)
      .map((value) => value.normalize("NFKC").trim());
    if (new Set(titles).size !== titles.length
      || new Set(this.environment.tongWireContract.login.successResultCodes).size
        !== this.environment.tongWireContract.login.successResultCodes.length) this.fail("TONG_WIRE_CONTRACT_INVALID", 503);
    return {
      origin: new URL(this.environment.tongBaseUrl), contract: this.environment.tongWireContract,
      username: this.environment.tongUsername, password: this.environment.tongPassword,
    };
  }

  private record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  private decode(bytes: Buffer, contentType: string | null, expected: "utf-8" | "cp949"): string {
    const declared = /(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/iu.exec(contentType ?? "")?.[1]?.toLowerCase();
    if (declared !== undefined) {
      const declaredFamily = declared === "utf-8" || declared === "utf8" ? "utf-8"
        : ["euc-kr", "euckr", "cp949", "ms949", "windows-949"].includes(declared) ? "cp949" : undefined;
      if (declaredFamily === undefined) this.fail("TONG_RESPONSE_CHARSET_UNSUPPORTED");
      if (declaredFamily !== expected) this.fail("TONG_RESPONSE_CHARSET_MISMATCH");
    }
    if (expected === "utf-8") {
      try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { return this.fail("TONG_RESPONSE_ENCODING_INVALID"); }
    }
    const decoded = iconv.decode(bytes, "cp949");
    if (!iconv.encode(decoded, "cp949").equals(bytes)) this.fail("TONG_RESPONSE_ENCODING_INVALID");
    return decoded;
  }

  private fail(code: string, status = 502): never {
    throw new DomainError(status, code, "The TongTongTong integration failed closed.");
  }
}
