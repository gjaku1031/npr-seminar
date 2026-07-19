import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { StudentListQuery, StudentReviewRequiredQuery } from "../../src/modules/students/students.controller.js";
import { StudentsService } from "../../src/modules/students/students.service.js";

describe("admin student response contract", () => {
  it("keeps review summary branch-only and primary-teacher facets page-independent", async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }])
      .mockResolvedValueOnce([{
        unique_student_count: 9n,
        multi_assignment_student_count: 0n,
        regular_representative_count: 0n,
        science_alias_representative_count: 0n,
        multiple_regular_ambiguous_count: 0n,
        no_class_ambiguous_count: 0n,
        math_regular_student_count: 0n,
        science_regular_student_count: 0n,
        eligible_unique_student_count: 7n,
        math_student_count: 5n,
        science_only_student_count: 2n,
      }])
      .mockResolvedValueOnce([{ count: 4n }])
      .mockResolvedValueOnce([{ teachers: ["김수민", "신유진"] }]);
    const service = new StudentsService({
      $queryRaw: queryRaw,
      syncRun: { findFirst: vi.fn(async () => null) },
      student: { findMany: vi.fn(async () => []) },
    } as never, {} as never, {} as never);

    const response = await service.list({
      branch: "SONGPA",
      query: "검색학생",
      unitGroup: "HIGH",
      teacherName: "신유진",
      sourceActive: false,
      page: 4,
      pageSize: 10,
    });

    expect(response.facets).toEqual({ teachers: ["김수민", "신유진"] });
    expect(response.page.totalItems).toBe(0);
    expect(response.summary.uniqueStudentCount).toBe(9);
    expect(response.summary).toMatchObject({
      eligibleUniqueStudentCount: 7,
      mathStudentCount: 5,
      scienceOnlyStudentCount: 2,
      reviewRequiredStudentCount: 4,
    });
    expect(queryRaw).toHaveBeenCalledTimes(5);
    const pageQuery = queryRaw.mock.calls[0]![0] as { strings: string[]; values: unknown[] };
    expect(pageQuery.strings.join(" ")).toContain("cardinality(assignment_projection.math_class_names)>0");
    expect(pageQuery.values).toContain("신유진");
    const summaryQuery = queryRaw.mock.calls[2]![0] as { strings: string[]; values: unknown[] };
    expect(summaryQuery.strings.join(" ")).toContain("s.source_active=true");
    expect(summaryQuery.strings.join(" ")).not.toContain("review_required_student_count");
    expect(summaryQuery.values).toEqual(["고등", "SONGPA"]);
    const reviewSummaryQuery = queryRaw.mock.calls[3]![0] as { strings: string[]; values: unknown[] };
    expect(reviewSummaryQuery.strings.join(" ")).toContain("select count(*)::bigint count");
    expect(reviewSummaryQuery.strings.join(" ")).toContain("s.source_active=true");
    expect(reviewSummaryQuery.strings.join(" ")).toContain("s.class_resolution_status='AMBIGUOUS_FALLBACK'");
    expect(reviewSummaryQuery.values).toEqual(["SONGPA"]);
    const facetQuery = queryRaw.mock.calls[4]![0] as { strings: string[]; values: unknown[] };
    expect(facetQuery.strings.join(" ")).toContain("select distinct npr_primary_teacher(s.teacher_name)");
    expect(facetQuery.strings.join(" ")).toContain("cardinality(assignment_projection.math_class_names)>0");
    expect(facetQuery.values).toContain("SONGPA");
    expect(facetQuery.values).toContain("검색학생");
    expect(facetQuery.values).toContain(false);
    expect(facetQuery.values).not.toContain("신유진");
    expect(facetQuery.values).not.toContain(30);
    expect(facetQuery.values).not.toContain(10);
  });

  it("transforms categorizedOnly like sourceActive and applies its eligible-class SQL only when true", async () => {
    const enabled = plainToInstance(StudentListQuery, { categorizedOnly: "true", sourceActive: "false" });
    const disabled = plainToInstance(StudentListQuery, { categorizedOnly: "false" });
    const invalid = plainToInstance(StudentListQuery, { categorizedOnly: "yes" });
    expect(enabled).toMatchObject({ categorizedOnly: true, sourceActive: false });
    expect(disabled.categorizedOnly).toBe(false);
    expect(await validate(enabled)).toHaveLength(0);
    expect(await validate(disabled)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);

    const service = new StudentsService({} as never, {} as never, {} as never);
    const sqlWhere = (service as unknown as {
      sqlWhere(filters: unknown): { strings: readonly string[] };
    }).sqlWhere.bind(service);
    const enabledSql = sqlWhere({ categorizedOnly: true, page: 1, pageSize: 50 }).strings.join(" ");
    const disabledSql = sqlWhere({ categorizedOnly: false, page: 1, pageSize: 50 }).strings.join(" ");
    expect(enabledSql).toContain("cardinality(assignment_projection.math_class_names)");
    expect(enabledSql).toContain("cardinality(assignment_projection.science_class_names) > 0");
    expect(disabledSql).not.toContain("cardinality(assignment_projection.math_class_names)");
  });

  it("returns complete mother and father phones only through the admin mapper", () => {
    const phoneProtector = {
      reveal: vi.fn((ciphertext: Uint8Array) => Buffer.from(ciphertext).toString("utf8") === "mother"
        ? "01012345678" : "01098765432"),
    };
    const service = new StudentsService({} as never, {} as never, phoneProtector as never);
    const map = (service as unknown as { map(row: unknown): Record<string, unknown> }).map.bind(service);
    const response = map({
      publicId: "00000000-0000-4000-8000-000000000001", sourceStudentNo: "S1", name: "학생",
      branch: { code: "SONGPA" }, schoolName: "학교", grade: "3",
      motherPhoneCiphertext: Buffer.from("mother"), fatherPhoneCiphertext: Buffer.from("father"),
      unitName: "3T3A", sourceActive: true, className: "3T3A", classResolutionStatus: "ONE_REGULAR",
      classResolutionReason: null, sourceStatus: "재원생",
      assignments: [{
        publicId: "00000000-0000-4000-8000-000000000002", sourceUniqueNo: "S1", classRegistrationNo: "A1",
        className: "3T3A", teacherName: "담임", schoolName: "학교", grade: "3", sourceActive: true,
        firstSeenRun: { publicId: "00000000-0000-4000-8000-000000000003" },
        lastSeenRun: { publicId: "00000000-0000-4000-8000-000000000004" },
      }],
      firstSeenRun: { startedAt: new Date("2026-07-17T00:00:00Z") },
      lastSeenRun: { startedAt: new Date("2026-07-17T06:00:00Z") },
    });
    expect(response).toMatchObject({
      motherPhone: "01012345678",
      fatherPhone: "01098765432",
      mathClassName: "3T3A",
      scienceClassNames: [],
    });
    expect(response).not.toHaveProperty("maskedMotherContact");
    expect(response).not.toHaveProperty("maskedFatherContact");
    expect(phoneProtector.reveal).toHaveBeenCalledTimes(2);
    expect(response.representativeClass).toEqual({
      resolution: "REGULAR", displayName: "3T3A", ambiguous: false,
      regularCandidateCount: 1, scienceCandidateCount: 0, selectedSourceAssignmentKey: "S1:A1",
    });
    expect(response.assignments).toEqual([expect.objectContaining({
      sourceAssignmentKey: "S1:A1", sourceStudentNo: "S1", branch: "SONGPA",
      candidateType: "REGULAR", exclusionReason: "NONE",
    })]);
  });

  it("returns a null homeroom teacher for science-only students while preserving assignment teachers", () => {
    const service = new StudentsService({} as never, {} as never, { reveal: vi.fn() } as never);
    const map = (service as unknown as { map(row: unknown): Record<string, any> }).map.bind(service);
    const assignment = (className: string, teacherName: string, key: string) => ({
      publicId: `00000000-0000-4000-8000-${key.padStart(12, "0")}`,
      sourceUniqueNo: `2050929-${key}`,
      classRegistrationNo: `CLASS-${key}`,
      className,
      teacherName,
      schoolName: "학교",
      grade: "2",
      sourceActive: true,
      firstSeenRun: { publicId: "00000000-0000-4000-8000-000000000101" },
      lastSeenRun: { publicId: "00000000-0000-4000-8000-000000000102" },
    });
    const row = {
      publicId: "00000000-0000-4000-8000-000000000929",
      sourceStudentNo: "2050929",
      name: "강민진",
      branch: { code: "SONGPA" },
      schoolName: "학교",
      grade: "2",
      teacherName: "박세영",
      motherPhoneCiphertext: null,
      fatherPhoneCiphertext: null,
      className: "과고2역학SKY[일5]",
      sourceActive: true,
      sourceStatus: "재원생",
      classResolutionStatus: "SCIENCE_ONLY",
      classResolutionReason: null,
      assignments: [
        assignment("과고2화학SKY[일4]", "김성현", "2"),
        assignment("과고2역학SKY[일5]", "박세영", "1"),
      ],
      firstSeenRun: { startedAt: new Date("2026-07-17T00:00:00Z") },
      lastSeenRun: { startedAt: new Date("2026-07-17T06:00:00Z") },
    };

    expect(map(row)).toMatchObject({
      sourceStudentNo: "2050929",
      name: "강민진",
      teacherName: null,
      unitName: "과학",
      mathClassName: null,
      scienceClassNames: ["과고2역학SKY[일5]", "과고2화학SKY[일4]"],
      assignments: [
        { className: "과고2화학SKY[일4]", teacherName: "김성현" },
        { className: "과고2역학SKY[일5]", teacherName: "박세영" },
      ],
    });
  });

  it("uses the student-row primary teacher for math-plus-science and keeps projected classes stable", () => {
    const service = new StudentsService({} as never, {} as never, { reveal: vi.fn() } as never);
    const map = (service as unknown as { map(row: unknown): Record<string, any> }).map.bind(service);
    const assignment = (className: string, key: string) => ({
      publicId: `00000000-0000-4000-8000-${key.padStart(12, "0")}`,
      sourceUniqueNo: `SOURCE-${key}`,
      classRegistrationNo: `CLASS-${key}`,
      className,
      teacherName: "담임",
      schoolName: "학교",
      grade: "2",
      sourceActive: true,
      firstSeenRun: { publicId: "00000000-0000-4000-8000-000000000101" },
      lastSeenRun: { publicId: "00000000-0000-4000-8000-000000000102" },
    });
    const assignments = [
      assignment("2A", "1"),
      assignment("2B", "2"),
      assignment("과2B", "3"),
      assignment("과1A", "4"),
      assignment("과1A", "5"),
      assignment("과1TEST", "6"),
      assignment("물리심화", "7"),
      assignment("화학A", "8"),
    ];
    const row = {
      publicId: "00000000-0000-4000-8000-000000000001",
      sourceStudentNo: "S1",
      name: "학생",
      branch: { code: "SONGPA" },
      schoolName: "학교",
      grade: "2",
      teacherName: "학생담임, 공동담임",
      motherPhoneCiphertext: null,
      fatherPhoneCiphertext: null,
      className: "2B",
      sourceActive: true,
      sourceStatus: "재원생",
      classResolutionStatus: "ONE_REGULAR",
      classResolutionReason: null,
      assignments,
      firstSeenRun: { startedAt: new Date("2026-07-17T00:00:00Z") },
      lastSeenRun: { startedAt: new Date("2026-07-17T06:00:00Z") },
    };

    expect(map(row)).toMatchObject({
      teacherName: "학생담임",
      mathClassName: "2B",
      scienceClassNames: ["과1A", "과2B", "물리심화", "화학A"],
    });
    expect(map({
      ...row,
      className: "과1A",
      classResolutionStatus: "SCIENCE_ONLY",
      assignments: assignments.filter((candidate) => !candidate.className.startsWith("2")),
    })).toMatchObject({
      mathClassName: null,
      scienceClassNames: ["과1A", "과2B", "물리심화", "화학A"],
    });
  });

  it("preserves normalized schedule suffix variants and de-duplicates exact projected names", () => {
    const service = new StudentsService({} as never, {} as never, { reveal: vi.fn() } as never);
    const map = (service as unknown as { map(row: unknown): Record<string, any> }).map.bind(service);
    const assignment = (className: string, key: string) => ({
      publicId: `00000000-0000-4000-8000-${key.padStart(12, "0")}`,
      sourceUniqueNo: `SOURCE-${key}`, classRegistrationNo: `CLASS-${key}`, className,
      teacherName: "담임", schoolName: "학교", grade: "1", sourceActive: true,
      firstSeenRun: { publicId: "00000000-0000-4000-8000-000000000101" },
      lastSeenRun: { publicId: "00000000-0000-4000-8000-000000000102" },
    });
    const response = map({
      publicId: "00000000-0000-4000-8000-000000000001", sourceStudentNo: "S1", name: "학생",
      branch: { code: "WIRYE" }, schoolName: "학교", grade: "1",
      motherPhoneCiphertext: null, fatherPhoneCiphertext: null,
      className: "과1특A[토3]", sourceActive: true, sourceStatus: "재원생",
      classResolutionStatus: "SCIENCE_ONLY", classResolutionReason: null,
      assignments: [
        assignment("과1특A[토3]", "1"),
        assignment("과1특A[일4]", "2"),
        assignment("과１특A[토３]", "3"),
      ],
      firstSeenRun: { startedAt: new Date("2026-07-17T00:00:00Z") },
      lastSeenRun: { startedAt: new Date("2026-07-17T06:00:00Z") },
    });

    expect(response.scienceClassNames).toEqual(["과1특A[일4]", "과1특A[토3]"]);
    expect(response.representativeClass).toMatchObject({
      resolution: "SCIENCE_ALIAS", displayName: "과학", regularCandidateCount: 0, scienceCandidateCount: 2,
    });
    expect(response.assignments.map((candidate: { className: string }) => candidate.className)).toEqual([
      "과1특A[토3]", "과1특A[일4]", "과１특A[토３]",
    ]);
  });

  it("projects seminar reservations with matching top-level and nested booleans in one batch query", async () => {
    const seminarSessionId = "00000000-0000-4000-8000-000000000900";
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ id: 11n }, { id: 12n }, { id: 13n }])
      .mockResolvedValueOnce([{ count: 3n }])
      .mockResolvedValueOnce([{
        unique_student_count: 3n,
        multi_assignment_student_count: 0n,
        regular_representative_count: 3n,
        science_alias_representative_count: 0n,
        multiple_regular_ambiguous_count: 0n,
        no_class_ambiguous_count: 0n,
        math_regular_student_count: 3n,
        science_regular_student_count: 0n,
        eligible_unique_student_count: 3n,
        math_student_count: 3n,
        science_only_student_count: 0n,
      }])
      .mockResolvedValueOnce([{ count: 0n }])
      .mockResolvedValueOnce([{ teachers: [] }])
      .mockResolvedValueOnce([
        {
          student_id: 11n,
          family_booking_id: "00000000-0000-4000-8000-000000000901",
          status: "RESERVED",
          attendance_party: "BOTH",
          booking_source: "WEB_APP",
        },
        {
          student_id: 13n,
          family_booking_id: "00000000-0000-4000-8000-000000000903",
          status: "CANCELLED",
          attendance_party: "FATHER",
          booking_source: "ON_SITE",
        },
      ]);
    const student = (id: bigint, sourceStudentNo: string, name: string) => ({
      id,
      publicId: `00000000-0000-4000-8000-${id.toString().padStart(12, "0")}`,
      sourceStudentNo,
      name,
      branch: { code: "SONGPA" },
      schoolName: "학교",
      grade: "2",
      motherPhoneCiphertext: null,
      fatherPhoneCiphertext: null,
      className: "2A",
      sourceActive: true,
      sourceStatus: "재원생",
      classResolutionStatus: "ONE_REGULAR",
      classResolutionReason: null,
      assignments: [{
        publicId: `00000000-0000-4000-8001-${id.toString().padStart(12, "0")}`,
        sourceUniqueNo: sourceStudentNo,
        classRegistrationNo: "A1",
        className: "2A",
        teacherName: "담임",
        schoolName: "학교",
        grade: "2",
        sourceActive: true,
        firstSeenRun: { publicId: "00000000-0000-4000-8000-000000000101" },
        lastSeenRun: { publicId: "00000000-0000-4000-8000-000000000102" },
      }],
      firstSeenRun: { startedAt: new Date("2026-07-17T00:00:00Z") },
      lastSeenRun: { startedAt: new Date("2026-07-17T06:00:00Z") },
    });
    const service = new StudentsService({
      $queryRaw: queryRaw,
      syncRun: { findFirst: vi.fn(async () => null) },
      student: { findMany: vi.fn(async () => [
        student(13n, "S13", "셋"), student(12n, "S12", "둘"), student(11n, "S11", "하나"),
      ]) },
    } as never, {} as never, { reveal: vi.fn() } as never);

    const response = await service.list({ seminarSessionId, page: 1, pageSize: 50 });

    expect(response.items.map((item) => item.sourceStudentNo)).toEqual(["S11", "S12", "S13"]);
    expect(response.items[0]).toMatchObject({
      hasReservation: true,
      reservation: {
        status: "RESERVED",
        hasReservation: true,
        familyBookingId: "00000000-0000-4000-8000-000000000901",
        attendanceParty: "BOTH",
        bookingSource: "WEB_APP",
      },
    });
    expect(response.items[1]).toMatchObject({ hasReservation: false, reservation: null });
    expect(response.items[2]).toMatchObject({
      hasReservation: false,
      reservation: {
        status: "CANCELLED",
        hasReservation: false,
        familyBookingId: "00000000-0000-4000-8000-000000000903",
        attendanceParty: "FATHER",
        bookingSource: "ON_SITE",
      },
    });
    for (const item of response.items) {
      expect(item).not.toHaveProperty("bookingStatus");
      expect(item).not.toHaveProperty("familyBookingId");
      expect(item).not.toHaveProperty("attendanceParty");
      expect(item).not.toHaveProperty("bookingSource");
      expect(item).not.toHaveProperty("latestEventAt");
      if (item.reservation !== null) expect(item.reservation).not.toHaveProperty("latestEventAt");
    }
    expect(queryRaw).toHaveBeenCalledTimes(6);
    const bookingQuery = queryRaw.mock.calls[5]![0] as { strings: string[]; values: unknown[] };
    expect(bookingQuery.strings.join(" ")).toContain("distinct on (booking_student.student_id)");
    expect(bookingQuery.values).toEqual(expect.arrayContaining([11n, 12n, 13n, seminarSessionId]));
  });

  it("maps review-required students to the exact branch-based response and reason codes", async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ id: 21n }, { id: 22n }])
      .mockResolvedValueOnce([{ count: 2n }]);
    const assignment = (className: string, key: string) => ({
      publicId: `00000000-0000-4000-8002-${key.padStart(12, "0")}`,
      sourceUniqueNo: `SOURCE-${key}`,
      classRegistrationNo: `CLASS-${key}`,
      className,
      teacherName: "담임",
      schoolName: "학교",
      grade: "2",
      sourceActive: true,
      firstSeenRun: { publicId: "00000000-0000-4000-8000-000000000101" },
      lastSeenRun: { publicId: "00000000-0000-4000-8000-000000000102" },
    });
    const base = {
      branch: { code: "WIRYE" },
      schoolName: "학교",
      grade: "2",
      motherPhoneCiphertext: null,
      fatherPhoneCiphertext: null,
      sourceActive: true,
      sourceStatus: "재원생",
      firstSeenRun: { startedAt: new Date("2026-07-17T00:00:00Z") },
      lastSeenRun: { startedAt: new Date("2026-07-17T06:00:00Z") },
    };
    const rows = [{
      ...base,
      id: 22n,
      publicId: "00000000-0000-4000-8000-000000000022",
      sourceStudentNo: "S22",
      name: "검토 둘",
      className: "미분류",
      classResolutionStatus: "AMBIGUOUS_FALLBACK",
      classResolutionReason: "NO_CLASS",
      assignments: [assignment("수학특강", "22"), assignment("", "220")],
    }, {
      ...base,
      id: 21n,
      publicId: "00000000-0000-4000-8000-000000000021",
      sourceStudentNo: "S21",
      name: "검토 하나",
      className: "2B",
      classResolutionStatus: "AMBIGUOUS_FALLBACK",
      classResolutionReason: "MULTIPLE_REGULAR",
      assignments: [assignment("2A[토3]", "211"), assignment("2B", "212")],
    }];
    const service = new StudentsService({
      $queryRaw: queryRaw,
      student: { findMany: vi.fn(async () => rows) },
    } as never, {} as never, {} as never);

    const response = await service.reviewRequired({ branch: "WIRYE", page: 1, pageSize: 50 });

    expect(response.page).toEqual({ page: 1, pageSize: 50, totalItems: 2, totalPages: 1 });
    expect(response.items).toEqual([{
      studentId: "00000000-0000-4000-8000-000000000021",
      sourceStudentNo: "S21",
      branch: "WIRYE",
      name: "검토 하나",
      originalClassName: "2B",
      mathClassName: "2B",
      scienceClassNames: [],
      reasonCodes: ["MULTIPLE_MATH_CLASS"],
      rawClassNames: ["2A[토3]", "2B"],
      rawRepresentativeClassNames: ["2A[토3]", "2B"],
    }, {
      studentId: "00000000-0000-4000-8000-000000000022",
      sourceStudentNo: "S22",
      branch: "WIRYE",
      name: "검토 둘",
      originalClassName: "미분류",
      mathClassName: null,
      scienceClassNames: [],
      reasonCodes: ["NO_RECOGNIZABLE_CLASS", "UNIT_UNRESOLVED", "ABNORMAL_OR_EMPTY_CLASS"],
      rawClassNames: ["", "수학특강"],
      rawRepresentativeClassNames: [],
    }]);
    const pageQuery = queryRaw.mock.calls[0]![0] as { strings: string[]; values: unknown[] };
    expect(pageQuery.strings.join(" ")).toContain("cardinality(assignment_projection.math_class_names)");
    expect(pageQuery.values).toContain("WIRYE");
  });

  it("reviews an abnormal original class despite a stale normal persisted resolution", async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ id: 23n }])
      .mockResolvedValueOnce([{ count: 1n }]);
    const row = {
      id: 23n,
      publicId: "00000000-0000-4000-8000-000000000023",
      sourceStudentNo: "S23",
      branch: { code: "WIRYE" },
      name: "검토 셋",
      className: "　ＴＥＳＴ 패키지　",
      classResolutionStatus: "ONE_REGULAR",
      classResolutionReason: null,
      assignments: [{ className: "2A", sourceActive: true }],
    };
    const service = new StudentsService({
      $queryRaw: queryRaw,
      student: { findMany: vi.fn(async () => [row]) },
    } as never, {} as never, {} as never);

    const response = await service.reviewRequired({ branch: "WIRYE", page: 1, pageSize: 50 });

    expect(response.items).toEqual([{
      studentId: "00000000-0000-4000-8000-000000000023",
      sourceStudentNo: "S23",
      branch: "WIRYE",
      name: "검토 셋",
      originalClassName: "TEST 패키지",
      mathClassName: "2A",
      scienceClassNames: [],
      reasonCodes: ["ABNORMAL_OR_EMPTY_CLASS"],
      rawClassNames: ["2A"],
      rawRepresentativeClassNames: ["2A"],
    }]);
    const pageQuery = queryRaw.mock.calls[0]![0] as { strings: string[] };
    const pageSql = pageQuery.strings.join(" ");
    expect(pageSql).toContain("btrim(normalize(s.class_name,NFKC))=''");
    expect(pageSql).toContain(
      "not npr_is_representative_student_class(btrim(normalize(s.class_name,NFKC)))",
    );
  });

  it("accepts only public resolution values and maps each one to the persisted status and reason", async () => {
    const accepted = ["REGULAR", "SCIENCE_ALIAS", "MULTIPLE_REGULAR", "NO_CLASS"] as const;
    for (const resolution of accepted) {
      expect(await validate(Object.assign(new StudentListQuery(), { resolution }))).toHaveLength(0);
    }
    expect(await validate(Object.assign(new StudentListQuery(), { resolution: "ONE_REGULAR" }))).not.toHaveLength(0);

    const service = new StudentsService({} as never, {} as never, {} as never);
    const where = (service as unknown as { where(filters: unknown): Record<string, unknown> }).where.bind(service);
    const filters = { page: 1, pageSize: 50 };
    expect(where({ ...filters, resolution: "REGULAR" })).toMatchObject({ classResolutionStatus: "ONE_REGULAR" });
    expect(where({ ...filters, resolution: "SCIENCE_ALIAS" })).toMatchObject({ classResolutionStatus: "SCIENCE_ONLY" });
    expect(where({ ...filters, resolution: "MULTIPLE_REGULAR" })).toMatchObject({
      classResolutionStatus: "AMBIGUOUS_FALLBACK", classResolutionReason: "MULTIPLE_REGULAR",
    });
    expect(where({ ...filters, resolution: "NO_CLASS" })).toMatchObject({
      classResolutionStatus: "AMBIGUOUS_FALLBACK", classResolutionReason: "NO_CLASS",
    });
  });

  it("validates optional seminar booking context and review pagination queries", async () => {
    expect(await validate(Object.assign(new StudentListQuery(), {
      seminarSessionId: "00000000-0000-4000-8000-000000000900",
    }))).toHaveLength(0);
    expect(await validate(Object.assign(new StudentListQuery(), { seminarSessionId: "not-a-session" })))
      .not.toHaveLength(0);
    expect(await validate(Object.assign(new StudentReviewRequiredQuery(), {
      branch: "GWANGJIN", page: 2, pageSize: 25,
    }))).toHaveLength(0);
    expect(await validate(Object.assign(new StudentReviewRequiredQuery(), { branch: "UNKNOWN" })))
      .not.toHaveLength(0);
  });

  it("accepts the roster unit groups and maps special-purpose units as one filter", async () => {
    const accepted = [
      "ALL", "ELEMENTARY", "MIDDLE_1", "MIDDLE_2", "MIDDLE_3", "SPECIAL_PURPOSE", "HIGH", "SCIENCE", "GUEST",
    ] as const;
    for (const unitGroup of accepted) {
      expect(await validate(Object.assign(new StudentListQuery(), { unitGroup }))).toHaveLength(0);
    }
    expect(await validate(Object.assign(new StudentListQuery(), { unitGroup: "MIDDLE_4" }))).not.toHaveLength(0);

    const service = new StudentsService({} as never, {} as never, {} as never);
    const where = (service as unknown as { where(filters: unknown): Record<string, unknown> }).where.bind(service);
    expect(where({ page: 1, pageSize: 50, unitGroup: "SPECIAL_PURPOSE" })).toMatchObject({
      AND: [{ unitName: { in: ["특목", "예중1", "예고1"] } }],
    });
    expect(where({ page: 1, pageSize: 50, unitGroup: "GUEST" })).toMatchObject({
      AND: [{ id: { lt: 0n } }],
    });
  });

  it("never selects or serializes parent phones in public student search", async () => {
    const findMany = vi.fn(async (_query: unknown) => [{
      publicId: "00000000-0000-4000-8000-000000000001", sourceStudentNo: "S1", name: "학생",
      branch: { code: "SONGPA" }, schoolName: "학교", grade: "3", className: "3T3A",
      classResolutionStatus: "ONE_REGULAR", classResolutionReason: null,
      assignments: [{ className: "3T3A", sourceUniqueNo: "S1", classRegistrationNo: "A1" }],
      motherPhone: "01012345678", fatherPhone: "01098765432",
      motherPhoneCiphertext: Buffer.from("mother"), fatherPhoneCiphertext: Buffer.from("father"),
    }]);
    const service = new StudentsService(
      { student: { findMany, count: vi.fn(async () => 1) } } as never,
      { authorize: vi.fn(async () => ({
        contactDigest: new Uint8Array([1]),
        selectedBranchCode: "SONGPA",
      })) } as never,
      { reveal: vi.fn(() => "must-not-run") } as never,
    );

    const response = await service.publicSearch("proof", { page: 1, pageSize: 50 });

    expect(response.items[0]).toEqual({
      studentId: "00000000-0000-4000-8000-000000000001", sourceStudentNo: "S1", name: "학생",
      branch: "SONGPA", schoolName: "학교", grade: "3",
      representativeClass: {
        resolution: "REGULAR", displayName: "3T3A", ambiguous: false,
        regularCandidateCount: 1, scienceCandidateCount: 0, selectedSourceAssignmentKey: "S1:A1",
      },
    });
    const query = findMany.mock.calls[0]![0] as { select?: Record<string, unknown> };
    expect(JSON.stringify(query.select)).not.toMatch(/phone|contact/iu);
    expect(JSON.stringify((findMany.mock.calls[0]![0] as { where?: unknown }).where)).toContain("SONGPA");
    expect(response.items[0]).not.toHaveProperty("motherPhone");
    expect(response.items[0]).not.toHaveProperty("fatherPhone");
  });
});
