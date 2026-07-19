import { describe, expect, it, vi } from "vitest";
import iconv from "iconv-lite";
import type { AppEnvironment, TongWireContractConfiguration } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { HttpTongTongTongGateway } from "../../src/modules/student-sync/http-tongtontong.gateway.js";
import { StudentNormalizerService } from "../../src/modules/student-sync/student-normalizer.service.js";
import type { TongBranchSnapshot, TongSourceAssignment } from "../../src/modules/student-sync/tongtontong.gateway.js";

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

const cp949 = (body: string, status = 200, headers: Record<string, string> = {}): Response => new Response(iconv.encode(body, "cp949"), {
  status, headers: { "content-type": "text/html; charset=euc-kr", ...headers },
});
const gridRow = (suffix: string) => ({
  m43: `unique-${suffix}`, m42: `registration-${suffix}`, m19: `S-${suffix}`, m41: `학생${suffix}`,
  m8: "3T3A", m7: "01012345678", m11: "학교", m12: "3", m13: "담임", m14: "고등부", m15: "재원생",
});
const frameHtml = [
  ["m35", ""], ["m36", ""],
  ["m41", "성명"], ["m43", "고유번호"], ["m15", "등록구분"], ["m19", "학번"],
  ["m42", "반등록번호"], ["m8", "반명"], ["m7", "부모HP(모)"], ["m11", "학교"],
  ["m12", "학년"], ["m13", "담임명"], ["m14", "학부"],
].map(([dataIndx, title]) => `{dataIndx:"${dataIndx}", title:"${title}"}`).join(",");
const columnFrame = (columns: readonly (readonly [string, string])[]): string => columns
  .map(([dataIndx, title]) => `{dataIndx:"${dataIndx}", title:"${title}"}`).join(",");

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

function environment(overrides: Partial<AppEnvironment> = {}): AppEnvironment {
  return {
    appEnv: "test", processRole: "api", port: 4000,
    phoneEncryptionKey: "BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=",
    phoneHmacKey: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=",
    smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
    smsSenders: { SONGPA: undefined, WIRYE: undefined, GWANGJIN: undefined }, smsAligoTestMode: true,
    googleSheetsEnabled: false, trustProxy: 0, tongSyncEnabled: true,
    tongWireContractConfirmed: true, tongWireContract: contract, tongBaseUrl: "https://tong.test/",
    tongUsername: "operator", tongPassword: "secret",
    sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
    ...overrides,
  };
}

describe("TongTongTong HTTP safety boundary", () => {
  const columnIndexes = (frame: string, wireContract: TongWireContractConfiguration = contract) => (
    new HttpTongTongTongGateway(environment(), vi.fn()) as unknown as {
    columnIndexes(value: string, wireContract: TongWireContractConfiguration): Readonly<Record<string, string>>;
  }).columnIndexes(frame, wireContract);

  it("makes no request until the exact wire contract is explicitly confirmed", async () => {
    const fetcher = vi.fn();
    const gateway = new HttpTongTongTongGateway(environment({ tongWireContractConfirmed: false }), fetcher);
    expect(() => gateway.assertReady()).toThrowError(expect.objectContaining({ code: "TONG_WIRE_CONTRACT_UNCONFIRMED" }));
    await expect(gateway.login()).rejects.toMatchObject({ code: "TONG_WIRE_CONTRACT_UNCONFIRMED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

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

  it("accepts a valid authenticated top context even when login opens on the account's last selected branch", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    await expect(gateway.login()).resolves.toMatchObject({ opaque: expect.any(Object) });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

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
    const snapshot = await gateway.fetchBranch(session, { code: "SONGPA", sourceCode: "SE8A" });
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

  it("ignores captured unnamed presentation columns while retaining strict semantic mappings", () => {
    expect(columnIndexes(frameHtml)).toMatchObject({
      sourceUniqueNo: "m43", classRegistrationNo: "m42", studentNo: "m19", name: "m41",
    });
  });

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

  it.each([
    ["named title", `${frameHtml},{dataIndx:"m99", title:"학번"}`],
    ["data index shared with an unnamed column", `${frameHtml},{dataIndx:"m35", title:"추가열"}`],
  ])("still fails closed on a duplicate %s", (_label, duplicateFrame) => {
    expect(() => columnIndexes(duplicateFrame)).toThrowError(expect.objectContaining({ code: "TONG_COLMODEL_DUPLICATE" }));
  });

  it("skips the credential-bearing branch switch when the verified top context is already the target", async () => {
    const fetcher = vi.fn();
    successfulLoginResponses(fetcher);
    fetcher
      .mockResolvedValueOnce(cp949("targetranch_proc.asp 님 환영합니다 학원코드 : SE8A"))
      .mockResolvedValueOnce(cp949(frameHtml))
      .mockResolvedValueOnce(cp949(JSON.stringify({ curPage: 1, totalRecords: 1, data: [gridRow("1")] })));
    const gateway = new HttpTongTongTongGateway(environment(), fetcher);
    const session = await gateway.login();
    await gateway.fetchBranch(session, { code: "SONGPA", sourceCode: "SE8A" });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(fetcher.mock.calls.slice(5).map((call) => [new URL(call[0] as URL).pathname, call[1]?.method])).toEqual([
      ["/mmsc/mmsc_top.asp", "GET"], ["/mmsc/student/st02frame.asp", "POST"],
      ["/mmsc/student/st02frame_json.asp", "POST"],
    ]);
  });

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

    await expect(gateway.fetchBranch(session, { code: "WIRYE", sourceCode: "KG5M" }))
      .resolves.toMatchObject({ assignments: expect.arrayContaining([
        expect.objectContaining({ sourceUniqueNo: "unique-1" }),
        expect.objectContaining({ sourceUniqueNo: "unique-2" }),
        expect.objectContaining({ sourceUniqueNo: "unique-3" }),
      ]) });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(fetcher.mock.calls[7]?.[1]?.body).toContain("pq_rpp=2");
  });

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

    await expect(gateway.fetchBranch(session, { code: "WIRYE", sourceCode: "KG5M" }))
      .rejects.toMatchObject({ code: "TONG_STUDENT_PAGE_ROW_COUNT_MISMATCH" });
  });

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

    await expect(gateway.fetchBranch(session, { code: "WIRYE", sourceCode: "KG5M" }))
      .rejects.toMatchObject({ code: "TONG_STUDENT_PAGE_SIZE_INVALID" });
  });

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

    await expect(gateway.fetchBranch(session, { code: "WIRYE", sourceCode: "KG5M" }))
      .rejects.toMatchObject({ code: "TONG_STUDENT_PAGE_DUPLICATE_ROW" });
  });
});

describe("live student normalization", () => {
  const assignment = (values: Partial<TongSourceAssignment>): TongSourceAssignment => ({
    sourceUniqueNo: "u", classRegistrationNo: "r", studentNo: "s", name: "학생", className: "3T3A", motherPhone: "",
    schoolName: "학교", grade: "3", teacherName: "담임", unitName: "고등부", sourceStatus: "재원생", ...values,
  });
  const snapshot = (branch: TongBranchSnapshot["branch"], assignments: readonly TongSourceAssignment[]): TongBranchSnapshot => ({
    branch, assignments, snapshotHash: Buffer.alloc(32, branch.length),
  });

  it("prioritizes a sole regular class, recognizes science subjects, retains supplementary assignments, and reports ambiguity", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("SONGPA", [
        assignment({ sourceUniqueNo: "a1", studentNo: "s1", className: "과고3화학" }),
        assignment({ sourceUniqueNo: "a2", studentNo: "s1", className: "3T3A" }),
        assignment({ sourceUniqueNo: "a3", studentNo: "s1", className: "여름특강" }),
      ]),
      snapshot("WIRYE", [assignment({ sourceUniqueNo: "b1", studentNo: "s2", name: "학생2", className: "화학 심화" })]),
      snapshot("GWANGJIN", [assignment({ sourceUniqueNo: "c1", studentNo: "s3", name: "학생3", className: "TEST 패키지" })]),
    ]);
    const selected = normalized.rows.filter((row) => row.primarySelected);
    expect(selected.find((row) => row.sourceStudentNo === "s1")).toMatchObject({ className: "3T3A", classResolutionStatus: "ONE_REGULAR" });
    expect(selected.find((row) => row.sourceStudentNo === "s2")).toMatchObject({ classResolutionStatus: "SCIENCE_ONLY" });
    expect(selected.find((row) => row.sourceStudentNo === "s3")).toMatchObject({ classResolutionReason: "NO_CLASS" });
    expect(normalized.rows.find((row) => row.className === "여름특강")).toMatchObject({ included: true, primaryCandidate: false });
    expect(normalized.counts.ambiguousStudentCount).toBe(1);
  });

  it("excludes inactive and bracketed rows and reports global student-number conflicts without dropping assignments", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("SONGPA", [assignment({ sourceUniqueNo: "a1", studentNo: "shared" }), assignment({ sourceUniqueNo: "x", studentNo: "x", className: "[폐강]" })]),
      snapshot("WIRYE", [assignment({ sourceUniqueNo: "b1", studentNo: "shared" })]),
      snapshot("GWANGJIN", [
        assignment({ sourceUniqueNo: "c1", studentNo: "z", sourceStatus: "퇴원생" }),
        assignment({ sourceUniqueNo: "c2", studentNo: "active-z", name: "학생Z" }),
      ]),
    ]);
    expect(normalized.rows.filter((row) => row.included)).toHaveLength(3);
    expect(normalized.conflicts.map((conflict) => conflict.type)).toContain("CROSS_BRANCH_STUDENT_NO");
    expect(normalized.counts.bracketExcludedAssignmentCount).toBe(1);
  });

  it("retains the verified Wirye and Gwangjin science-only source assignment shapes without rewriting their IDs", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("SONGPA", [assignment({ sourceUniqueNo: "songpa", classRegistrationNo: "songpa-r", studentNo: "songpa" })]),
      snapshot("WIRYE", [assignment({
        sourceUniqueNo: "5100293", classRegistrationNo: "285320", studentNo: "5100293",
        name: "류시하", className: "과1특A[토3]",
      })]),
      snapshot("GWANGJIN", [assignment({
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
    expect(normalized.branchCounts.WIRYE.scienceAliasRepresentativeCount).toBe(1);
    expect(normalized.branchCounts.GWANGJIN.scienceAliasRepresentativeCount).toBe(1);
  });

  it("retains a subject-only geometry assignment without creating a second regular representative", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("SONGPA", [
        assignment({ sourceUniqueNo: "base", classRegistrationNo: "base-r", studentNo: "geometry", className: "고1A" }),
        assignment({ sourceUniqueNo: "geometry", classRegistrationNo: "geometry-r", studentNo: "geometry", className: "기하[일1]" }),
      ]),
      snapshot("WIRYE", [assignment({ sourceUniqueNo: "wirye", classRegistrationNo: "wirye-r", studentNo: "wirye" })]),
      snapshot("GWANGJIN", [assignment({ sourceUniqueNo: "gwangjin", classRegistrationNo: "gwangjin-r", studentNo: "gwangjin" })]),
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

  it("deduplicates timetable variants by their suffix-stripped base for representative resolution", () => {
    const normalizer = new StudentNormalizerService(new PhoneProtector(environment()));
    const normalized = normalizer.normalize([
      snapshot("SONGPA", [
        assignment({ sourceUniqueNo: "first", classRegistrationNo: "first-r", studentNo: "same-base", className: "3T3A[토3]" }),
        assignment({ sourceUniqueNo: "second", classRegistrationNo: "second-r", studentNo: "same-base", className: "3T3A[일4]" }),
      ]),
      snapshot("WIRYE", [assignment({ sourceUniqueNo: "wirye", classRegistrationNo: "wirye-r", studentNo: "wirye" })]),
      snapshot("GWANGJIN", [assignment({ sourceUniqueNo: "gwangjin", classRegistrationNo: "gwangjin-r", studentNo: "gwangjin" })]),
    ]);

    expect(normalized.rows.filter((row) => row.sourceStudentNo === "same-base" && row.included)).toHaveLength(2);
    expect(normalized.rows.filter((row) => row.sourceStudentNo === "same-base" && row.primarySelected)).toEqual([
      expect.objectContaining({ classResolutionStatus: "ONE_REGULAR", classResolutionReason: null }),
    ]);
    expect(normalized.counts.multipleRegularAmbiguousCount).toBe(0);
  });
});
