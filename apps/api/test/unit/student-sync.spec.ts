import { describe, expect, it, vi } from "vitest";
import iconv from "iconv-lite";
import type { AppEnvironment, TongWireContractConfiguration } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { HttpTongTongTongGateway } from "../../src/modules/student-sync/http-tongtontong.gateway.js";
import { StudentNormalizerService } from "../../src/modules/student-sync/student-normalizer.service.js";
import type { TongBranchSnapshot, TongSourceAssignment } from "../../src/modules/student-sync/tongtontong.gateway.js";

/**
 * 테스트용 통통통 연동 계약
 */
const contract: TongWireContractConfiguration = {
  login: {
    pagePath: "/mmsc/login.asp", academyCodeQueryField: "acamcode", academyCode: "SE8A",
    securityPath: "/mmsc/Login_security_Proc.asp", usernameField: "txtmb_id", passwordField: "txtmb_pw",
    academyCodeField: "txtbr_code", resultCodeField: "skey", actionField: "retunkey",
    successResultCodes: ["R9999", "R9998"], actionPathPrefix: "/mmsc/", defaultPath: "/mmsc/default.asp",
    topPath: "/mmsc/mmsc_top.asp?containeryn=Y", passwordFormMarker: "txtmb_pw",
    topRequiredMarkers: ["targetranch_proc.asp", "님 환영합니다"], branchCodeMarkerPrefix: "학원코드 : ",
    securityCharset: "utf-8", htmlCharset: "cp949",
  },
  switchBranch: {
    path: "/mmsc/targetranch_proc.asp", paramField: "param", paramValue: "", kindField: "txtmb_kind",
    kindValue: "T", usernameField: "txtmb_id", passwordField: "txtmb_pw", targetField: "gotarget",
    targetValue: "mmsc", branchField: "gobrcode",
  },
  students: {
    framePath: "/mmsc/student/st02frame.asp?proctype=R", gridPath: "/mmsc/student/st02frame_json.asp?proctype=R&selbs_inorout=NN&page=1",
    rowsField: "data", currentPageField: "curPage", totalRecordsField: "totalRecords",
    filterField: "selbs_inorout", filterValue: "NN", framePageField: "page", framePageValue: "1",
    pageField: "pq_curpage", pageSizeField: "pq_rpp", pageSize: 2,
    searchFields: ["txtst_name", "txtcl_code", "txtcl_name"], maxPages: 100, maxRecords: 10_000, charset: "cp949",
  },
  columns: {
    sourceUniqueNo: "고유번호", classRegistrationNo: "반등록번호", studentNo: "학번", name: "성명", className: "반명",
    motherPhone: "부모HP(모)", schoolName: "학교", grade: "학년", teacherName: "담임명", unitName: "학부", sourceStatus: "등록구분",
  },
  maxResponseBytes: 1024 * 1024, timeoutMs: 2_000,
};

/**
 * CP949로 인코딩한 HTML 응답
 */
const cp949 = (body: string, status = 200, headers: Record<string, string> = {}): Response => new Response(iconv.encode(body, "cp949"), {
  status, headers: { "content-type": "text/html; charset=euc-kr", ...headers },
});

/**
 * 학생 그리드 행 1개
 */
const gridRow = (suffix: string) => ({
  m43: `unique-${suffix}`, m42: `registration-${suffix}`, m19: `S-${suffix}`, m41: `학생${suffix}`,
  m8: "3T3A", m7: "01012345678", m11: "학교", m12: "3", m13: "담임", m14: "고등부", m15: "재원생",
});

/**
 * 학생 프레임 열 정의 문자열. 이름 없는 표시 열 포함
 */
const frameHtml = [
  ["m35", ""], ["m36", ""],
  ["m41", "성명"], ["m43", "고유번호"], ["m15", "등록구분"], ["m19", "학번"],
  ["m42", "반등록번호"], ["m8", "반명"], ["m7", "부모HP(모)"], ["m11", "학교"],
  ["m12", "학년"], ["m13", "담임명"], ["m14", "학부"],
].map(([dataIndx, title]) => `{dataIndx:"${dataIndx}", title:"${title}"}`).join(",");

/**
 * 열 정의 목록을 프레임 문자열로 변환
 */
const columnFrame = (columns: readonly (readonly [string, string])[]): string => columns
  .map(([dataIndx, title]) => `{dataIndx:"${dataIndx}", title:"${title}"}`).join(",");

/**
 * 정상 로그인 응답 순서(로그인 화면, 보안 처리, action, 기본 화면, 상단 화면)를 fetch 대역에 등록
 */
function successfulLoginResponses(fetcher: ReturnType<typeof vi.fn>): void {
  fetcher
    .mockResolvedValueOnce(cp949("login", 200, { "set-cookie": "sid=one; HttpOnly" }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ skey: "R9999", retunkey: "CheckOK.asp" }]), {
      headers: { "content-type": "application/json; charset=utf-8" },
    }))
    .mockResolvedValueOnce(cp949("accepted", 302))
    .mockResolvedValueOnce(cp949("default"))
    .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : KG5M"));
}

/**
 * 연동 계약이 확인된 테스트 실행 환경
 *
 * @param overrides 덮어쓸 값
 */
function environment(overrides: Partial<AppEnvironment> = {}): AppEnvironment {
  return {
    appEnv: "test", processRole: "api", port: 4000,
    phoneEncryptionKey: "BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=",
    phoneHmacKey: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=",
    smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
    smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined }, smsAligoTestMode: true,
    googleSheetsEnabled: false, trustProxy: 0, tongSyncEnabled: true,
    tongWireContractConfirmed: true, tongWireContract: contract, tongBaseUrl: "https://tong.test/",
    tongUsername: "operator", tongPassword: "secret",
    sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
    ...overrides,
  };
}

// 통통통 HTTP 게이트웨이 안전 경계
describe("TongTongTong HTTP safety boundary", () => {
  // 프레임 문자열의 열 대응 계산
  const columnIndexes = (frame: string, wireContract: TongWireContractConfiguration = contract) => (
    new HttpTongTongTongGateway(environment(), vi.fn()) as unknown as {
    columnIndexes(value: string, wireContract: TongWireContractConfiguration): Readonly<Record<string, string>>;
  }).columnIndexes(frame, wireContract);

  // 연동 계약을 명시적으로 확인하기 전에는 요청을 보내지 않음
  it("makes no request until the exact wire contract is explicitly confirmed", async () => {
    const fetcher = vi.fn();
    const gateway = new HttpTongTongTongGateway(environment({ tongWireContractConfirmed: false }), fetcher);
    expect(() => gateway.assertReady()).toThrowError(expect.objectContaining({ code: "TONG_WIRE_CONTRACT_UNCONFIRMED" }));
    await expect(gateway.login()).rejects.toMatchObject({ code: "TONG_WIRE_CONTRACT_UNCONFIRMED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  // 논리적 로그인은 1회이며 실패한 자격 증명 확인 요청을 재시도하지 않음
  it("performs one logical login attempt and never retries a failed credential-check request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(cp949("login", 200, { "set-cookie": "sid=one; HttpOnly" }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ skey: "DENIED" }]), {
        headers: { "content-type": "application/json; charset=utf-8" },
      }));
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    await expect(gateway.login()).rejects.toMatchObject({ code: "TONG_AUTH_RESULT_INDETERMINATE" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  // 로그인 직후 상단 화면이 계정의 마지막 선택 지점이어도 인증된 화면이면 수락
  it("accepts a valid authenticated top context even when login opens on the account's last selected branch", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    await expect(gateway.login()).resolves.toMatchObject({ opaque: expect.any(Object) });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  // 확인된 요청 순서를 따르고 페이지당 한 번 조회하며 지점별 열 제목을 대응
  it("follows the captured state machine, paginates once per page, and maps branch-local colModel titles", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    fetcher
      .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : KG5M"))
      .mockResolvedValueOnce(cp949("switched", 302))
      .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : SE8A"))
      .mockResolvedValueOnce(cp949(frameHtml))
      .mockResolvedValueOnce(cp949(JSON.stringify({ curPage: 1, totalRecords: 3, data: [gridRow("1"), gridRow("2")] })))
      .mockResolvedValueOnce(cp949(JSON.stringify({ curPage: 2, totalRecords: 3, data: [gridRow("3")] })));
    const gateway = new HttpTongTongTongGateway(environment({
      tongWireContract: { ...contract, columns: { ...contract.columns, fatherPhone: "부모HP(부)" } },
    }), fetcher);
    const session = await gateway.login();
    const snapshot = await gateway.fetchBranch(session, { code: "CAMPUS_A", sourceCode: "SE8A" });
    expect(snapshot.assignments).toHaveLength(3);
    expect(snapshot.assignments[0]).toMatchObject({
      sourceUniqueNo: "unique-1", classRegistrationNo: "registration-1", studentNo: "S-1", className: "3T3A",
    });
    expect(snapshot.assignments[0]).not.toHaveProperty("fatherPhone");
    expect(fetcher).toHaveBeenCalledTimes(11);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "manual" });
    expect(fetcher.mock.calls.every((call) => call[1]?.headers?.["user-agent"] === "NPR-Student-Sync/1.0")).toBe(true);
    expect(fetcher.mock.calls[5]?.[1]).toMatchObject({ method: "GET", redirect: "manual" });
    expect(fetcher.mock.calls[6]?.[1]).toMatchObject({ method: "POST", redirect: "manual" });
    expect(fetcher.mock.calls[9]?.[1]?.body).toContain("pq_curpage=1");
    expect(fetcher.mock.calls[9]?.[1]?.body).toContain("selbs_inorout=NN");
    expect(fetcher.mock.calls[10]?.[1]?.body).toContain("pq_curpage=2");
  });

  // 이름 없는 표시 열은 무시하고 의미 있는 열 대응은 엄격하게 유지
  it("ignores captured unnamed presentation columns while retaining strict semantic mappings", () => {
    expect(columnIndexes(frameHtml)).toMatchObject({
      sourceUniqueNo: "m43", classRegistrationNo: "m42", studentNo: "m19", name: "m41",
    });
  });

  // A·B·C 지점별 실제 열 정의(이름 없는 열 포함) 대응
  it.each([
    ["SE8A", [
      ["m1", "학번"], ["m2", "성명"], ["m3", "반명"], ["m5", "부모HP(모)"], ["m6", "학교"],
      ["m7", "학부"], ["m8", "학년"], ["m10", "담임명"], ["m15", "부모HP(부)"], ["m20", "등록구분"],
      ["m35", ""], ["m36", ""], ["m42", "반등록번호"], ["m43", "고유번호"],
    ], { motherPhone: "m5", fatherPhone: "m15", schoolName: "m6", unitName: "m7", grade: "m8", teacherName: "m10", sourceStatus: "m20" }],
    ["KG5M", [
      ["m1", "학번"], ["m2", "성명"], ["m3", "반명"], ["m4", "담임명"], ["m5", "학부"],
      ["m6", "학교"], ["m7", "학년"], ["m11", "부모HP(모)"], ["m20", "등록구분"], ["m28", "부모HP(부)"],
      ["m32", ""], ["m34", ""], ["m41", ""], ["m42", "반등록번호"], ["m43", "고유번호"],
    ], { motherPhone: "m11", fatherPhone: "m28", schoolName: "m6", unitName: "m5", grade: "m7", teacherName: "m4", sourceStatus: "m20" }],
    ["SE9P", [
      ["m1", "학번"], ["m2", "성명"], ["m3", "반명"], ["m5", "부모HP(모)"], ["m6", "학부"],
      ["m7", "학교"], ["m8", "학년"], ["m10", "담임명"], ["m17", "부모HP(부)"], ["m21", "등록구분"],
      ["m36", ""], ["m37", ""], ["m41", ""], ["m42", "반등록번호"], ["m43", "고유번호"],
    ], { motherPhone: "m5", fatherPhone: "m17", schoolName: "m7", unitName: "m6", grade: "m8", teacherName: "m10", sourceStatus: "m21" }],
  ] as const)("maps the verified %s branch colModel including unnamed columns", (_branch, columns, branchSpecific) => {
    const indexes = columnIndexes(columnFrame(columns), {
      ...contract, columns: { ...contract.columns, fatherPhone: "부모HP(부)" },
    });
    expect(indexes).toMatchObject({
      sourceUniqueNo: "m43", classRegistrationNo: "m42", studentNo: "m1", name: "m2", className: "m3",
      ...branchSpecific,
    });
  });

  // 이름 있는 제목 중복, 이름 없는 열과 데이터 키 공유는 TONG_COLMODEL_DUPLICATE
  it.each([
    ["named title", `${frameHtml},{dataIndx:"m99", title:"학번"}`],
    ["data index shared with an unnamed column", `${frameHtml},{dataIndx:"m35", title:"추가열"}`],
  ])("still fails closed on a duplicate %s", (_label, duplicateFrame) => {
    expect(() => columnIndexes(duplicateFrame)).toThrowError(expect.objectContaining({ code: "TONG_COLMODEL_DUPLICATE" }));
  });

  // 상단 화면이 이미 대상 지점이면 자격 증명을 담는 지점 전환 요청을 생략
  it("skips the credential-bearing branch switch when the verified top context is already the target", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    fetcher
      .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : SE8A"))
      .mockResolvedValueOnce(cp949(frameHtml))
      .mockResolvedValueOnce(cp949(JSON.stringify({ curPage: 1, totalRecords: 1, data: [gridRow("1")] })));
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    const session = await gateway.login();
    await gateway.fetchBranch(session, { code: "CAMPUS_A", sourceCode: "SE8A" });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(fetcher.mock.calls.slice(5).map((call) => [new URL(call[0] as URL).pathname, call[1]?.method])).toEqual([
      ["/mmsc/mmsc_top.asp", "GET"], ["/mmsc/student/st02frame.asp", "POST"],
      ["/mmsc/student/st02frame_json.asp", "POST"],
    ]);
  });

  // 요청 pq_rpp보다 큰 공급자 페이지 크기도 일관되면 수락
  it("accepts a self-consistent provider-selected page larger than the requested pq_rpp hint", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    fetcher
      .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : KG5M"))
      .mockResolvedValueOnce(cp949(frameHtml))
      .mockResolvedValueOnce(cp949(JSON.stringify({
        curPage: 1, totalRecords: 3, data: [gridRow("1"), gridRow("2"), gridRow("3")],
      })));
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    const session = await gateway.login();

    await expect(gateway.fetchBranch(session, { code: "CAMPUS_B", sourceCode: "KG5M" }))
      .resolves.toMatchObject({ assignments: expect.arrayContaining([
        expect.objectContaining({ sourceUniqueNo: "unique-1" }),
        expect.objectContaining({ sourceUniqueNo: "unique-2" }),
        expect.objectContaining({ sourceUniqueNo: "unique-3" }),
      ]) });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(fetcher.mock.calls[7]?.[1]?.body).toContain("pq_rpp=2");
  });

  // 페이지 행 수가 총건수와 맞지 않으면 실패
  it("fails closed when a provider-selected page length is inconsistent with totalRecords", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    fetcher
      .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : KG5M"))
      .mockResolvedValueOnce(cp949(frameHtml))
      .mockResolvedValueOnce(cp949(JSON.stringify({
        curPage: 1, totalRecords: 2, data: [gridRow("1"), gridRow("2"), gridRow("3")],
      })));
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    const session = await gateway.login();

    await expect(gateway.fetchBranch(session, { code: "CAMPUS_B", sourceCode: "KG5M" }))
      .rejects.toMatchObject({ code: "TONG_STUDENT_PAGE_ROW_COUNT_MISMATCH" });
  });

  // 이후 페이지가 첫 페이지 크기를 넘으면 실패
  it("fails closed when a later page exceeds the first observed page size", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    fetcher
      .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : KG5M"))
      .mockResolvedValueOnce(cp949(frameHtml))
      .mockResolvedValueOnce(cp949(JSON.stringify({ curPage: 1, totalRecords: 4, data: [gridRow("1"), gridRow("2")] })))
      .mockResolvedValueOnce(cp949(JSON.stringify({ curPage: 2, totalRecords: 4, data: [gridRow("3"), gridRow("4"), gridRow("5")] })));
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    const session = await gateway.login();

    await expect(gateway.fetchBranch(session, { code: "CAMPUS_B", sourceCode: "KG5M" }))
      .rejects.toMatchObject({ code: "TONG_STUDENT_PAGE_SIZE_INVALID" });
  });

  // 같은 페이지 안 학생 등록 중복이면 실패
  it("fails closed on duplicate student identities within the same page", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    fetcher
      .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : KG5M"))
      .mockResolvedValueOnce(cp949(frameHtml))
      .mockResolvedValueOnce(cp949(JSON.stringify({
        curPage: 1, totalRecords: 2, data: [gridRow("1"), gridRow("1")],
      })));
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    const session = await gateway.login();

    await expect(gateway.fetchBranch(session, { code: "CAMPUS_B", sourceCode: "KG5M" }))
      .rejects.toMatchObject({ code: "TONG_STUDENT_PAGE_DUPLICATE_ROW" });
  });
});

// 실시간 학생 정규화
describe("live student normalization", () => {
  // 수강 등록 원천 행. 기본값은 재원생 3T3A
  const assignment = (values: Partial<TongSourceAssignment>): TongSourceAssignment => ({
    sourceUniqueNo: "u", classRegistrationNo: "r", studentNo: "s", name: "학생", className: "3T3A", motherPhone: "",
    schoolName: "학교", grade: "3", teacherName: "담임", unitName: "고등부", sourceStatus: "재원생", ...values,
  });

  // 지점 조회 결과
  const snapshot = (branch: TongBranchSnapshot["branch"], assignments: readonly TongSourceAssignment[]): TongBranchSnapshot => ({
    branch, assignments, snapshotHash: Buffer.alloc(32, branch.length),
  });

  // 정규 반 하나를 우선하고 과학 과목을 인식하며 보조 등록은 유지하고 판정 불가를 보고
  it("prioritizes a sole regular class, recognizes science subjects, retains supplementary assignments, and reports ambiguity", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("CAMPUS_A", [
        assignment({ sourceUniqueNo: "a1", studentNo: "s1", className: "과고3화학" }),
        assignment({ sourceUniqueNo: "a2", studentNo: "s1", className: "3T3A" }),
        assignment({ sourceUniqueNo: "a3", studentNo: "s1", className: "여름특강" }),
      ]),
      snapshot("CAMPUS_B", [assignment({ sourceUniqueNo: "b1", studentNo: "s2", name: "학생2", className: "화학 심화" })]),
      snapshot("CAMPUS_C", [assignment({ sourceUniqueNo: "c1", studentNo: "s3", name: "학생3", className: "TEST 패키지" })]),
    ]);
    const selected = normalized.rows.filter((row) => row.primarySelected);
    expect(selected.find((row) => row.sourceStudentNo === "s1")).toMatchObject({ className: "3T3A", classResolutionStatus: "ONE_REGULAR" });
    expect(selected.find((row) => row.sourceStudentNo === "s2")).toMatchObject({ classResolutionStatus: "SCIENCE_ONLY" });
    expect(selected.find((row) => row.sourceStudentNo === "s3")).toMatchObject({ classResolutionReason: "NO_CLASS" });
    expect(normalized.rows.find((row) => row.className === "여름특강")).toMatchObject({ included: true, primaryCandidate: false });
    expect(normalized.counts.ambiguousStudentCount).toBe(1);
  });

  // 회귀 방지: 9월 반이 통통통에 미리 생기자 634명의 대표 반이 `09-…`로 바뀌고 단위·담임이 비었던 사례
  // 규칙이 아니라 정렬이 고름. "09-1M4A"가 "1M4A"보다 앞섬
  // 다음 학기 반이 현재 반을 밀어내지 않음
  it("다음 학기 반이 현재 반을 밀어내지 않는다", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("CAMPUS_A", [
        // 원천이 주는 순서와 무관하게 현재 반이 뽑혀야 함
        assignment({ sourceUniqueNo: "a1", classRegistrationNo: "r1", studentNo: "s1", className: "09-1M4A" }),
        assignment({ sourceUniqueNo: "a2", classRegistrationNo: "r2", studentNo: "s1", className: "1M4A" }),
      ]),
      // 다음 학기 반만 가진 학생 — 개강 전에 등록한 재원생임
      snapshot("CAMPUS_B", [assignment({ sourceUniqueNo: "b1", studentNo: "s2", name: "학생2", className: "09-5M1B" })]),
      snapshot("CAMPUS_C", [assignment({ sourceUniqueNo: "c1", studentNo: "s3", name: "학생3", className: "6T3D" })]),
    ]);
    const selected = normalized.rows.filter((row) => row.primarySelected);
    expect(selected.find((row) => row.sourceStudentNo === "s1"))
      .toMatchObject({ className: "1M4A", classResolutionStatus: "ONE_REGULAR" });
    expect(selected.find((row) => row.sourceStudentNo === "s2"))
      .toMatchObject({ classResolutionReason: "FUTURE_TERM_ONLY" });
    // 다음 학기 배정도 계속 저장함 — 9월이 되면 그때의 현재 반임
    expect(normalized.rows.find((row) => row.className === "09-1M4A"))
      .toMatchObject({ included: true, primaryCandidate: false });
  });

  // 비재원·대괄호 행은 제외하고, 학번 충돌은 등록을 버리지 않고 보고
  it("excludes inactive and bracketed rows and reports global student-number conflicts without dropping assignments", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("CAMPUS_A", [assignment({ sourceUniqueNo: "a1", studentNo: "shared" }), assignment({ sourceUniqueNo: "x", studentNo: "x", className: "[폐강]" })]),
      snapshot("CAMPUS_B", [assignment({ sourceUniqueNo: "b1", studentNo: "shared" })]),
      snapshot("CAMPUS_C", [
        assignment({ sourceUniqueNo: "c1", studentNo: "z", sourceStatus: "퇴원생" }),
        assignment({ sourceUniqueNo: "c2", studentNo: "active-z", name: "학생Z" }),
      ]),
    ]);
    expect(normalized.rows.filter((row) => row.included)).toHaveLength(3);
    expect(normalized.conflicts.map((conflict) => conflict.type)).toContain("CROSS_BRANCH_STUDENT_NO");
    expect(normalized.counts.bracketExcludedAssignmentCount).toBe(1);
  });

  // B·C의 과학 반만 있는 원천 등록 형태를 ID 변경 없이 유지
  it("retains the verified CampusB and CampusC science-only source assignment shapes without rewriting their IDs", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("CAMPUS_A", [assignment({ sourceUniqueNo: "campusA", classRegistrationNo: "campusA-r", studentNo: "campusA" })]),
      snapshot("CAMPUS_B", [assignment({
        sourceUniqueNo: "5100293", classRegistrationNo: "285320", studentNo: "5100293",
        name: "류시하", className: "과1특A[토3]",
      })]),
      snapshot("CAMPUS_C", [assignment({
        sourceUniqueNo: "6020034", classRegistrationNo: "295544", studentNo: "6020034",
        name: "김가은7", className: "과고1가람[일4]",
      })]),
    ]);

    expect(normalized.rows.find((row) => row.sourceStudentNo === "5100293")).toMatchObject({
      sourceUniqueNo: "5100293",
      classRegistrationNo: "285320",
      className: "과1특A[토3]",
      included: true,
      primaryCandidate: true,
      primarySelected: true,
      classResolutionStatus: "SCIENCE_ONLY",
    });
    expect(normalized.rows.find((row) => row.sourceStudentNo === "6020034")).toMatchObject({
      sourceUniqueNo: "6020034",
      classRegistrationNo: "295544",
      className: "과고1가람[일4]",
      included: true,
      primaryCandidate: true,
      primarySelected: true,
      classResolutionStatus: "SCIENCE_ONLY",
    });
    expect(normalized.branchCounts.CAMPUS_B.scienceAliasRepresentativeCount).toBe(1);
    expect(normalized.branchCounts.CAMPUS_C.scienceAliasRepresentativeCount).toBe(1);
  });

  // 과목 단독 기하 등록은 유지하되 두 번째 정규 대표 반으로 만들지 않음
  it("retains a subject-only geometry assignment without creating a second regular representative", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("CAMPUS_A", [
        assignment({ sourceUniqueNo: "base", classRegistrationNo: "base-r", studentNo: "geometry", className: "고1A" }),
        assignment({ sourceUniqueNo: "geometry", classRegistrationNo: "geometry-r", studentNo: "geometry", className: "기하[일1]" }),
      ]),
      snapshot("CAMPUS_B", [assignment({ sourceUniqueNo: "campusB", classRegistrationNo: "campusB-r", studentNo: "campusB" })]),
      snapshot("CAMPUS_C", [assignment({ sourceUniqueNo: "campusC", classRegistrationNo: "campusC-r", studentNo: "campusC" })]),
    ]);

    expect(normalized.rows.find((row) => row.className === "기하[일1]")).toMatchObject({
      included: true,
      primaryCandidate: false,
      primarySelected: false,
    });
    expect(normalized.rows.find((row) => row.sourceStudentNo === "geometry" && row.primarySelected)).toMatchObject({
      className: "고1A",
      classResolutionStatus: "ONE_REGULAR",
      classResolutionReason: null,
    });
    expect(normalized.counts.multipleRegularAmbiguousCount).toBe(0);
  });

  // 시간표 접미사만 다른 반은 기본 반 이름으로 중복 제거해 대표 반 판정
  it("deduplicates timetable variants by their suffix-stripped base for representative resolution", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("CAMPUS_A", [
        assignment({ sourceUniqueNo: "first", classRegistrationNo: "first-r", studentNo: "same-base", className: "3T3A[토3]" }),
        assignment({ sourceUniqueNo: "second", classRegistrationNo: "second-r", studentNo: "same-base", className: "3T3A[일4]" }),
      ]),
      snapshot("CAMPUS_B", [assignment({ sourceUniqueNo: "campusB", classRegistrationNo: "campusB-r", studentNo: "campusB" })]),
      snapshot("CAMPUS_C", [assignment({ sourceUniqueNo: "campusC", classRegistrationNo: "campusC-r", studentNo: "campusC" })]),
    ]);

    expect(normalized.rows.filter((row) => row.sourceStudentNo === "same-base" && row.included)).toHaveLength(2);
    expect(normalized.rows.filter((row) => row.sourceStudentNo === "same-base" && row.primarySelected)).toEqual([
      expect.objectContaining({ classResolutionStatus: "ONE_REGULAR", classResolutionReason: null }),
    ]);
    expect(normalized.counts.multipleRegularAmbiguousCount).toBe(0);
  });
});
