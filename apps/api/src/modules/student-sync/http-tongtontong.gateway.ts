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

/**
 * fetch 호환 함수. 테스트에서 가짜 응답 주입
 */
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * HTTP 구현의 세션. 로그인 쿠키 보관
 */
interface HttpTongSession extends TongSession { readonly opaque: { readonly cookies: Map<string, string> }; }

/**
 * 검증된 접속 설정
 */
type Configuration = ReturnType<HttpTongTongTongGateway["configuration"]>;

/**
 * 요청 User-Agent. 별도 검증한 일회성 로그인·스냅샷 도구와 같은 값
 */
const USER_AGENT = "NPR-Student-Sync/1.0";

/**
 * 통통통 HTTP 게이트웨이
 *
 * 연동 계약 설정에 따라 로그인·지점 전환·학생 그리드 조회를 수행
 * 응답이 예상과 조금이라도 다르면 추정하지 않고 502로 실패(fail closed)
 */
@Injectable()
export class HttpTongTongTongGateway extends TongTongTongGateway {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 실행 환경. 연동 계약·접속 정보
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,

    /**
     * HTTP 요청 함수
     */
    @Inject("TONG_HTTP_FETCH") private readonly fetcher: FetchLike,
  ) { super(); }

  /**
   * 설정 검증만 수행. 네트워크 요청 없음
   */
  public assertReady(): void { this.configuration(); }

  /**
   * 로그인 1회 수행
   *
   * 1. 로그인 화면 요청으로 초기 쿠키 수집
   * 2. 보안 처리 요청 결과 코드 확인 후 로그인 action 경로 검증
   * 3. action으로 자격 증명 전송
   * 4. 기본 화면에 비밀번호 폼이 없고 상단 화면에 필수 표식·지점 코드가 있는지 확인
   *
   * @returns 쿠키를 담은 세션
   * @throws {DomainError} 502 응답 형식 불일치·인증 실패, 503 설정 미확인
   */
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

  /**
   * 지점 1곳의 학생 수강 등록 전체 조회
   *
   * 1. 상단 화면이 대상 지점이 아니면 지점 전환 후 재확인
   * 2. 학생 프레임에서 열 정의를 읽어 계약의 열 제목과 데이터 키 대응
   * 3. 페이지를 순서대로 조회하며 총건수 고정·페이지 행 수·중복 행 검사
   * 4. 프레임과 모든 페이지 응답 바이트로 스냅샷 해시 계산
   *
   * @throws {DomainError} 502 지점 확인 실패·열 정의 불일치·페이지 불일치·총건수 변경
   */
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

    // 학생 프레임 요청과 열 정의 해석
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
    // 페이지 순회. 첫 페이지에서 총건수와 실제 페이지 크기 고정
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
        // pq_rpp는 이전 그리드에서 힌트일 뿐이라 첫 페이지에서 관찰한 크기로 고정
        // 이후 모든 페이지와 최종 총건수를 이 관찰값으로 검증
        pageCount = expectedTotal === 0 ? 1 : Math.ceil(expectedTotal / effectivePageSize);
        if (pageCount > contract.students.maxPages) this.fail("TONG_STUDENT_PAGE_LIMIT_EXCEEDED");
      } else if (parsed.total !== expectedTotal) {
        this.fail("TONG_STUDENT_TOTAL_CHANGED");
      }
      if (effectivePageSize === undefined) this.fail("TONG_STUDENT_PAGE_SIZE_INVALID");
      if (page > 1 && parsed.rows.length > effectivePageSize) this.fail("TONG_STUDENT_PAGE_SIZE_INVALID");
      // 마지막 페이지는 남은 건수, 그 외 페이지는 고정 크기와 정확히 일치해야 함
      const expectedRows = expectedTotal === 0 ? 0
        : page < pageCount ? effectivePageSize : expectedTotal - assignments.length;
      if (parsed.rows.length !== expectedRows) this.fail("TONG_STUDENT_PAGE_ROW_COUNT_MISMATCH");
      const mapped = this.mapRows(parsed.rows, indexes);
      // 페이지 안과 이전 페이지 사이 중복 행 금지
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

  /**
   * 보안 처리 응답에서 로그인 action 경로 추출
   *
   * @throws {DomainError} 502 결과 코드가 성공 목록에 없거나 형식 불명확
   */
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

  /**
   * 로그인 action 경로 검증
   *
   * 제어 문자·공백·`..`·`//` 금지, 같은 출처·자격 증명 없음·허용 경로 접두사·프래그먼트 없음
   *
   * @throws {DomainError} 502 TONG_LOGIN_ACTION_INVALID
   */
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

  /**
   * 상단 화면이 기대 지점인지 확인
   *
   * @throws {DomainError} 502 TONG_BRANCH_CONTEXT_INDETERMINATE
   */
  private verifyTop(body: string, expectedBranchCode: string, contract: TongWireContractConfiguration): void {
    if (!this.topMatches(body, expectedBranchCode, contract)) this.fail("TONG_BRANCH_CONTEXT_INDETERMINATE");
  }

  /**
   * 로그인 직후 상단 화면 확인
   *
   * 필수 표식이 모두 있고 지점 코드 표식 뒤에 영문 대문자·숫자 코드가 있어야 함
   *
   * @throws {DomainError} 502 TONG_BRANCH_CONTEXT_INDETERMINATE
   */
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

  /**
   * 상단 화면에 필수 표식과 기대 지점 코드 표식이 있는지 여부
   */
  private topMatches(body: string, expectedBranchCode: string, contract: TongWireContractConfiguration): boolean {
    return contract.login.topRequiredMarkers.every((marker) => body.includes(marker))
      && body.includes(`${contract.login.branchCodeMarkerPrefix}${expectedBranchCode}`);
  }

  /**
   * 학생 프레임 열 정의에서 계약 필드별 데이터 키 대응
   *
   * 데이터 키·제목 중복 금지. 아버지 연락처 열만 없어도 허용
   *
   * @throws {DomainError} 502 열 정의 불일치·중복·필수 열 누락
   */
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
      // 지점 프레임에는 이름 없는 표시 전용 열이 있음. 원천 필드는 아니지만
      // 이름 있는 열이 이 데이터 키를 재사용하지 못하도록 중복 검사에는 포함
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

  /**
   * 학생 그리드 페이지 응답 해석
   *
   * @throws {DomainError} 502 현재 페이지 불일치·총건수 범위 밖·형식 오류
   */
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

  /**
   * 그리드 행을 수강 등록으로 변환. 값은 NFKC·공백 제거
   *
   * @throws {DomainError} 502 행 형식 오류·필수 열 누락
   */
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

  /**
   * 페이지 중복 검사용 수강 등록 식별자. 학번·원천 고유 번호·등록 번호
   */
  private assignmentIdentity(assignment: TongSourceAssignment): string {
    return `${assignment.studentNo}\u0000${assignment.sourceUniqueNo}\u0000${assignment.classRegistrationNo}`;
  }

  /**
   * 연동 대상 HTTP 요청
   *
   * 같은 출처만 허용, 리다이렉트 따라가지 않음, 계약 제한 시간 적용
   * 응답 쿠키를 세션에 반영하고 크기 상한·문자 인코딩 확인 후 본문 반환
   *
   * @throws {DomainError} 502 다른 출처·요청 실패·허용 외 상태·크기 초과·인코딩 오류
   */
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
          // 별도 검증한 일회성 로그인·스냅샷 도구와 같은 요청 형태 유지
          // 고정된 비브라우저 식별자로 Node 버전별 기본 UA를 쓰지 않음
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

  /**
   * 응답 본문을 상한까지만 읽음
   *
   * Content-Length가 상한을 넘거나 읽는 도중 상한을 넘으면 읽기를 취소하고 실패
   *
   * @throws {DomainError} 502 TONG_HTTP_RESPONSE_TOO_LARGE·응답 실패
   */
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

  /**
   * Set-Cookie의 이름=값만 세션 쿠키에 저장. 토큰 형식이 아닌 이름은 무시
   */
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

  /**
   * 세션의 쿠키 저장소
   *
   * @throws {DomainError} 502 HTTP 구현 세션이 아님
   */
  private cookies(session: TongSession): Map<string, string> {
    const opaque = session.opaque as Partial<HttpTongSession["opaque"]>;
    if (!(opaque.cookies instanceof Map)) this.fail("TONG_SESSION_INVALID");
    return opaque.cookies;
  }

  /**
   * 접속 설정 확인
   *
   * 연동 사용·계약 확인·접속 정보 존재, 열 제목·성공 코드 중복 없음
   *
   * @throws {DomainError} 503 비활성·미확인·계약 오류
   */
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

  /**
   * 배열이 아닌 객체 여부
   */
  private record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  /**
   * 응답 바이트 디코딩
   *
   * Content-Type 문자 집합이 있으면 계약 값과 같은 계열이어야 함
   * UTF-8은 엄격 디코딩, CP949는 재인코딩 왕복이 같아야 함
   *
   * @throws {DomainError} 502 미지원·불일치·잘못된 인코딩
   */
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

  /**
   * 연동 실패 오류 발생
   *
   * @param status 기본 502. 설정 문제는 503
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(code: string, status = 502): never {
    throw new DomainError(status, code, "The TongTongTong integration failed closed.");
  }
}
