import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";
import { BookingProofService } from "../family-bookings/otp-proof.port.js";
import { canonicalUnitName, primaryTeacher } from "../student-sync/student-display-normalizer.js";
import {
  isRepresentativeStudentClass,
  isScienceStudentClass,
  studentClassBaseName,
} from "../student-sync/student-classification.js";
import { UNIT_NAMES_BY_GROUP, type StudentUnitGroup } from "../student-sync/student-unit-group.js";

/**
 * 관리자 학생 목록 필터
 */
interface StudentFilters {
  /**
   * 캠퍼스
   */
  readonly branch?: string;

  /**
   * 검색어
   */
  readonly query?: string;

  /**
   * 학년
   *
   * @deprecated unitGroup 사용
   */
  readonly grade?: string;

  /**
   * 단위 그룹
   */
  readonly unitGroup?: StudentUnitGroup;

  /**
   * 대표 반 이름
   */
  readonly representativeClass?: string;

  /**
   * 수학 담임
   */
  readonly teacherName?: string;

  /**
   * 단위 이름
   */
  readonly unitName?: string;

  /**
   * 대표 반 판정 결과
   */
  readonly resolution?: string;

  /**
   * 원천 재원 여부
   */
  readonly sourceActive?: boolean;

  /**
   * 수학·과학 반 보유 학생만
   */
  readonly categorizedOnly?: boolean;

  /**
   * 예약 정보를 붙일 회차 ID
   */
  readonly seminarSessionId?: string;

  /**
   * 페이지 번호
   */
  readonly page: number;

  /**
   * 페이지 크기
   */
  readonly pageSize: number;
}

/**
 * 검토 필요 학생 필터
 */
interface StudentReviewFilters {
  /**
   * 캠퍼스
   */
  readonly branch?: string;

  /**
   * 페이지 번호
   */
  readonly page: number;

  /**
   * 페이지 크기
   */
  readonly pageSize: number;
}

/**
 * 학생 목록 요약 집계 행
 */
interface StudentSummaryRow {
  /**
   * 학생 수
   */
  readonly unique_student_count: bigint;

  /**
   * 활성 수강 등록이 여러 개인 학생 수
   */
  readonly multi_assignment_student_count: bigint;

  /**
   * 정규 반 하나로 판정된 학생 수
   */
  readonly regular_representative_count: bigint;

  /**
   * 과학 반만으로 판정된 학생 수
   */
  readonly science_alias_representative_count: bigint;

  /**
   * 정규 반 여러 개로 판정 불가한 학생 수
   */
  readonly multiple_regular_ambiguous_count: bigint;

  /**
   * 반 없음으로 판정 불가한 학생 수
   */
  readonly no_class_ambiguous_count: bigint;

  /**
   * 활성 대표 수학 반이 있는 학생 수
   */
  readonly math_regular_student_count: bigint;

  /**
   * 활성 대표 과학 반이 있는 학생 수
   */
  readonly science_regular_student_count: bigint;

  /**
   * 수학·과학 반 중 하나라도 있는 학생 수
   */
  readonly eligible_unique_student_count: bigint;

  /**
   * 수학 반 학생 수
   */
  readonly math_student_count: bigint;

  /**
   * 과학 반만 있는 학생 수
   */
  readonly science_only_student_count: bigint;
}

/**
 * 건수 조회 행
 */
interface StudentCountRow {
  /**
   * 건수
   */
  readonly count: bigint;
}

/**
 * 담임 선택지 조회 행
 */
interface StudentTeacherFacetRow {
  /**
   * 정렬된 대표 담임 목록
   */
  readonly teachers: string[];
}

/**
 * 학생별 선택 회차 예약 조회 행
 */
interface StudentBookingProjectionRow {
  /**
   * 학생 ID
   */
  readonly student_id: bigint;

  /**
   * 가족 예약 공개 ID
   */
  readonly family_booking_id: string;

  /**
   * 예약 상태
   */
  readonly status: string;

  /**
   * 참석 보호자
   */
  readonly attendance_party: string;

  /**
   * 예약 경로
   */
  readonly booking_source: string;

  /**
   * 마지막 예약 이벤트 시각
   */
  readonly latest_event_at: Date | null;
}

/**
 * 활성 수강 등록에서 계산한 반 표시 정보
 */
interface StudentAssignmentProjection {
  /**
   * 활성 수강 등록 반 이름 원문(중복 제거·정렬)
   */
  readonly rawClassNames: string[];

  /**
   * 대표 반 후보(정규화)
   */
  readonly representativeClassNames: string[];

  /**
   * 대표 수학 반 목록
   */
  readonly mathClassNames: string[];

  /**
   * 표시용 수학 반. 원장 대표 반이 목록에 있으면 그 반, 없으면 첫 번째
   */
  readonly mathClassName: string | null;

  /**
   * 대표 과학 반 목록
   */
  readonly scienceClassNames: string[];

  /**
   * 표시용 단위. 수학 반이 없고 과학 반만 있으면 과학
   */
  readonly unitName: ReturnType<typeof canonicalUnitName>;
}

/**
 * 관리자 조회 include 조건으로 읽은 학생 행
 */
type StudentRow = Prisma.StudentGetPayload<{ include: ReturnType<StudentsService["include"]> }>;

/**
 * 공개 검색 select 조건으로 읽은 연락처 없는 학생 행
 */
type PublicStudentRow = Prisma.StudentGetPayload<{ select: ReturnType<StudentsService["publicSelect"]> }>;

/**
 * 반 표시 계산용 수강 등록 입력. 공개 조회는 sourceActive를 선택하지 않아 선택 필드로 둠
 */
type ProjectionAssignment = Pick<StudentRow["assignments"][number],
  "className" | "sourceUniqueNo" | "classRegistrationNo"> &
  Partial<Pick<StudentRow["assignments"][number], "sourceActive">>;

/**
 * 반 표시 계산에 필요한 학생·수강 등록 필드
 */
type ProjectionStudent = Pick<StudentRow,
  "className" | "classResolutionStatus" | "classResolutionReason"> & {
    /**
     * 수강 등록. 공개 조회는 sourceActive 없이 선택
     */
    readonly assignments: readonly ProjectionAssignment[];
  };

/**
 * 반 분류 검토 사유
 *
 * - MULTIPLE_MATH_CLASS: 수학 반 여러 개
 * - NO_RECOGNIZABLE_CLASS: 인식 가능한 대표 반 없음
 * - UNIT_UNRESOLVED: 단위 판정 불가
 * - ABNORMAL_OR_EMPTY_CLASS: 원장 반 이름이 비었거나 대표 반 형식이 아님
 */
type StudentReviewReasonCode =
  | "MULTIPLE_MATH_CLASS"
  | "NO_RECOGNIZABLE_CLASS"
  | "UNIT_UNRESOLVED"
  | "ABNORMAL_OR_EMPTY_CLASS";

/**
 * 학생 원장 조회
 *
 * 반 표시는 원장 대표 반이 아니라 활성 수강 등록에서 다시 계산(SQL·TS 양쪽 같은 규칙)
 * 보호자 연락처는 관리자 응답 조립 시에만 복호화
 */
@Injectable()
export class StudentsService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 공개 검색 예약 증명 확인
     */
    private readonly bookingProof: BookingProofService,

    /**
     * 연락처 복호화
     */
    private readonly phoneProtector: PhoneProtector,
  ) {}

  /**
   * 관리자 학생 목록
   *
   * 페이지 ID·전체 건수·요약 집계·검토 필요 건수·담임 선택지·최근 동기화를 병렬 조회한 뒤
   * 페이지 학생 상세와 선택 회차 예약을 읽어 SQL 정렬 순서대로 응답
   * 요약은 캠퍼스·단위 그룹만 적용한 활성 학생 기준, 담임 선택지는 담임 필터를 뺀 조건 기준
   */
  public async list(filters: StudentFilters) {
    const sqlWhere = this.sqlWhere(filters);
    const summaryWhere = this.summarySqlWhere(filters);
    const teacherFacetWhere = this.sqlWhere(filters, false);
    const reviewSummaryWhere = filters.branch === undefined
      ? Prisma.sql`s.source_active=true`
      : Prisma.sql`s.source_active=true and b.code=${filters.branch}`;
    const offset = (filters.page - 1) * filters.pageSize;
    const [pageIds, countRows, summaryRows, reviewSummaryRows, teacherFacetRows, latest] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        select s.id
          from students s
          join branches b on b.id=s.branch_id
          ${this.assignmentProjectionJoinSql()}
         where ${sqlWhere}
         order by ${this.studentOrderSql()}
         offset ${offset} limit ${filters.pageSize}`),
      this.prisma.$queryRaw<StudentCountRow[]>(Prisma.sql`
        select count(*)::bigint count
          from students s
          join branches b on b.id=s.branch_id
          ${this.assignmentProjectionJoinSql()}
         where ${sqlWhere}`),
      this.prisma.$queryRaw<StudentSummaryRow[]>(Prisma.sql`
        select count(*)::bigint unique_student_count,
               count(*) filter (where (
                 select count(*) from student_class_assignments assignment
                  where assignment.student_id=s.id and assignment.source_active
               ) > 1)::bigint multi_assignment_student_count,
               count(*) filter (where s.class_resolution_status='ONE_REGULAR')::bigint regular_representative_count,
               count(*) filter (where s.class_resolution_status='SCIENCE_ONLY')::bigint science_alias_representative_count,
               count(*) filter (where s.class_resolution_status='AMBIGUOUS_FALLBACK'
                                  and s.class_resolution_reason='MULTIPLE_REGULAR')::bigint multiple_regular_ambiguous_count,
               count(*) filter (where s.class_resolution_status='AMBIGUOUS_FALLBACK'
                                  and s.class_resolution_reason='NO_CLASS')::bigint no_class_ambiguous_count,
               count(*) filter (where cardinality(assignment_projection.math_class_names)>0)
                 ::bigint math_regular_student_count,
               count(*) filter (where cardinality(assignment_projection.science_class_names)>0)
                 ::bigint science_regular_student_count,
               count(*) filter (where
                 cardinality(assignment_projection.math_class_names)
                   + cardinality(assignment_projection.science_class_names) > 0
               )::bigint eligible_unique_student_count,
               count(*) filter (where
                 cardinality(assignment_projection.math_class_names) > 0
               )::bigint math_student_count,
               count(*) filter (where
                 cardinality(assignment_projection.math_class_names) = 0
                 and cardinality(assignment_projection.science_class_names) > 0
               )::bigint science_only_student_count
          from students s
          join branches b on b.id=s.branch_id
          ${this.assignmentProjectionJoinSql()}
         where ${summaryWhere}`),
      this.prisma.$queryRaw<StudentCountRow[]>(Prisma.sql`
        select count(*)::bigint count
          from students s
          join branches b on b.id=s.branch_id
          ${this.assignmentProjectionJoinSql()}
         where ${reviewSummaryWhere}
           and (${this.reviewRequiredSql()})`),
      this.prisma.$queryRaw<StudentTeacherFacetRow[]>(Prisma.sql`
        select coalesce(
                 array_agg(primary_teacher order by primary_teacher collate "C"),
                 '{}'::text[]
               ) teachers
          from (
            select distinct npr_primary_teacher(s.teacher_name) primary_teacher
              from students s
             join branches b on b.id=s.branch_id
              ${this.assignmentProjectionJoinSql()}
             where ${teacherFacetWhere}
               and cardinality(assignment_projection.math_class_names)>0
               and npr_primary_teacher(s.teacher_name) is not null
          ) teacher_options`),
      this.prisma.syncRun.findFirst({ where: { status: { in: ["PUBLISHED", "SUCCEEDED", "NO_CHANGES"] } }, orderBy: { publishedAt: "desc" } }),
    ]);
    // 상세 조회 결과를 SQL 페이지 순서로 재정렬
    const positions = new Map(pageIds.map((row, index) => [row.id.toString(), index]));
    const [rows, bookingRows]: [StudentRow[], StudentBookingProjectionRow[]] = pageIds.length === 0
      ? [[], []]
      : await Promise.all([
        this.prisma.student.findMany({
          where: { id: { in: pageIds.map((row) => row.id) } },
          include: this.include(),
        }),
        this.bookingProjectionRows(pageIds.map((row) => row.id), filters.seminarSessionId),
      ]);
    rows.sort((left, right) => (positions.get(left.id.toString()) ?? 0) - (positions.get(right.id.toString()) ?? 0));
    const bookingsByStudentId = new Map(bookingRows.map((row) => [row.student_id.toString(), row]));
    const summary = summaryRows[0] ?? {
      unique_student_count: 0n,
      multi_assignment_student_count: 0n,
      regular_representative_count: 0n,
      science_alias_representative_count: 0n,
      multiple_regular_ambiguous_count: 0n,
      no_class_ambiguous_count: 0n,
      math_regular_student_count: 0n,
      science_regular_student_count: 0n,
      eligible_unique_student_count: 0n,
      math_student_count: 0n,
      science_only_student_count: 0n,
    };
    const totalItems = Number(countRows[0]?.count ?? 0n);
    const summaryStudentCount = Number(summary.unique_student_count);
    const multiple = Number(summary.multiple_regular_ambiguous_count);
    const noClass = Number(summary.no_class_ambiguous_count);
    return {
      items: rows.map((row) => this.map(row, bookingsByStudentId.get(row.id.toString()))),
      page: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages: Math.ceil(totalItems / filters.pageSize) },
      summary: {
        uniqueStudentCount: summaryStudentCount,
        multiAssignmentStudentCount: Number(summary.multi_assignment_student_count),
        regularRepresentativeCount: Number(summary.regular_representative_count),
        scienceAliasRepresentativeCount: Number(summary.science_alias_representative_count),
        multipleRegularAmbiguousCount: multiple,
        noClassAmbiguousCount: noClass,
        ambiguousStudentCount: multiple + noClass,
        mathRegularStudentCount: Number(summary.math_regular_student_count),
        scienceRegularStudentCount: Number(summary.science_regular_student_count),
        eligibleUniqueStudentCount: Number(summary.eligible_unique_student_count),
        mathStudentCount: Number(summary.math_student_count),
        scienceOnlyStudentCount: Number(summary.science_only_student_count),
        reviewRequiredStudentCount: Number(reviewSummaryRows[0]?.count ?? 0n),
      },
      facets: { teachers: teacherFacetRows[0]?.teachers ?? [] },
      latestSuccessfulSyncAt: latest?.publishedAt ?? null,
    };
  }

  /**
   * 반 분류 검토 필요 활성 학생 목록. 연락처 제외
   */
  public async reviewRequired(filters: StudentReviewFilters) {
    const branchWhere = filters.branch === undefined ? Prisma.sql`true` : Prisma.sql`b.code=${filters.branch}`;
    const where = Prisma.sql`s.source_active=true and ${branchWhere} and (${this.reviewRequiredSql()})`;
    const offset = (filters.page - 1) * filters.pageSize;
    const [pageIds, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        select s.id
          from students s
          join branches b on b.id=s.branch_id
          ${this.assignmentProjectionJoinSql()}
         where ${where}
         order by ${this.studentOrderSql()}
         offset ${offset} limit ${filters.pageSize}`),
      this.prisma.$queryRaw<StudentCountRow[]>(Prisma.sql`
        select count(*)::bigint count
          from students s
          join branches b on b.id=s.branch_id
          ${this.assignmentProjectionJoinSql()}
         where ${where}`),
    ]);
    const positions = new Map(pageIds.map((row, index) => [row.id.toString(), index]));
    const rows = pageIds.length === 0 ? [] : await this.prisma.student.findMany({
      where: { id: { in: pageIds.map((row) => row.id) } },
      include: this.include(),
    });
    rows.sort((left, right) => (positions.get(left.id.toString()) ?? 0) - (positions.get(right.id.toString()) ?? 0));
    const totalItems = Number(countRows[0]?.count ?? 0n);
    return {
      items: rows.map((row) => this.mapReviewRequired(row)),
      page: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / filters.pageSize),
      },
    };
  }

  /**
   * 학생 상세
   *
   * @throws {DomainError} 404 STUDENT_NOT_FOUND
   */
  public async get(studentId: string) {
    const row = await this.prisma.student.findUnique({ where: { publicId: studentId }, include: this.include() });
    if (row === null) this.fail(404, "STUDENT_NOT_FOUND");
    return this.map(row);
  }

  /**
   * 학생 변경 이력 커서 조회
   *
   * @param requestedLimit 1~200, 기본 50
   * @throws {DomainError} 404 STUDENT_NOT_FOUND
   */
  public async history(studentId: string, afterSequence?: string, requestedLimit?: number) {
    const student = await this.prisma.student.findUnique({ where: { publicId: studentId }, select: { id: true } });
    if (student === null) this.fail(404, "STUDENT_NOT_FOUND");
    const after = afterSequence === undefined ? 0n : BigInt(afterSequence);
    const limit = Math.min(Math.max(requestedLimit ?? 50, 1), 200);
    const rows = await this.prisma.studentHistory.findMany({
      where: { studentId: student.id, id: { gt: after } }, orderBy: { id: "asc" }, take: limit + 1,
      select: { id: true, changeType: true, previousSnapshot: true, currentSnapshot: true, recordedAt: true, syncRun: { select: { publicId: true } } },
    });
    return {
      items: rows.slice(0, limit).map((row) => ({
        sequence: row.id.toString(), syncRunId: row.syncRun.publicId, changeType: row.changeType,
        previousSnapshot: row.previousSnapshot, currentSnapshot: row.currentSnapshot, occurredAt: row.recordedAt,
      })),
      page: { nextAfterSequence: rows.length > limit ? rows[limit - 1]!.id.toString() : null, hasMore: rows.length > limit },
    };
  }

  /**
   * 공개 학생 검색
   *
   * 예약 증명에 묶인 캠퍼스와 보호자 연락처 다이제스트가 일치하는 재원생만 이름·학번 앞부분으로 검색
   * 연락처 원문은 반환하지 않음
   *
   * @throws {DomainError} 400 증명에 캠퍼스 없음·요청 캠퍼스 불일치, 증명 오류
   */
  public async publicSearch(proofValue: string, filters: { query?: string; branch?: string; page: number; pageSize: number }) {
    const proof = await this.bookingProof.authorize(proofValue, "FAMILY_BOOKING");
    const selectedBranch = proof.selectedBranchCode;
    if (selectedBranch === null) {
      throw new DomainError(400, "BOOKING_CAMPUS_REQUIRED", "The booking proof is not bound to a campus.");
    }
    if (filters.branch !== undefined && filters.branch !== selectedBranch) {
      throw new DomainError(400, "BOOKING_CAMPUS_MISMATCH", "The requested campus does not match the booking proof.");
    }
    const query = filters.query?.normalize("NFKC").trim();
    const where: Prisma.StudentWhereInput = {
      sourceActive: true,
      branch: { code: selectedBranch },
      AND: [
        { OR: [
          { motherPhoneDigest: this.bytes(proof.contactDigest) },
          { fatherPhoneDigest: this.bytes(proof.contactDigest) },
        ] },
        ...(query === undefined || query === "" ? [] : [{ OR: [
          { name: { startsWith: query, mode: "insensitive" as const } },
          { sourceStudentNo: { startsWith: query, mode: "insensitive" as const } },
        ] }]),
      ],
    };
    const [rows, totalItems] = await Promise.all([
      this.prisma.student.findMany({
        where, select: this.publicSelect(), orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);
    return {
      items: rows.map((row: PublicStudentRow) => ({
        studentId: row.publicId, sourceStudentNo: row.sourceStudentNo, name: row.name, branch: row.branch.code,
        schoolName: row.schoolName, grade: row.grade, representativeClass: this.representative(row),
      })),
      page: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages: Math.ceil(totalItems / filters.pageSize) },
    };
  }

  /**
   * Prisma 조건 형태의 학생 목록 필터
   *
   * 현재 목록 조회는 sqlWhere를 사용하며 이 메서드를 호출하는 곳은 없음
   */
  private where(filters: StudentFilters): Prisma.StudentWhereInput {
    const query = filters.query?.normalize("NFKC").trim();
    const teacherName = primaryTeacher(filters.teacherName);
    const unitGroupWhere = this.unitGroupWhere(filters.unitGroup);
    return {
      ...(filters.branch === undefined ? {} : { branch: { code: filters.branch } }),
      ...(filters.grade === undefined ? {} : { grade: filters.grade }),
      ...(filters.representativeClass === undefined ? {} : { className: filters.representativeClass }),
      ...(filters.teacherName === undefined ? {} : { teacherName }),
      ...(filters.unitName === undefined && unitGroupWhere === null ? {} : { AND: [
        ...(filters.unitName === undefined ? [] : [{ unitName: filters.unitName }]),
        ...(unitGroupWhere === null ? [] : [unitGroupWhere]),
      ] }),
      ...this.resolutionWhere(filters.resolution),
      ...(filters.sourceActive === undefined ? {} : { sourceActive: filters.sourceActive }),
      ...(query === undefined || query === "" ? {} : {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { schoolName: { contains: query, mode: "insensitive" } },
          { sourceStudentNo: { contains: query, mode: "insensitive" } },
          ...(/^\d{4}$/.test(query) ? [{ motherPhoneLast4: query }, { fatherPhoneLast4: query }] : []),
        ],
      }),
    };
  }

  /**
   * 학생 목록 SQL 조건
   *
   * assignment_projection 조인이 있는 쿼리에서만 사용
   *
   * @param includeTeacher 담임 조건 포함 여부. 담임 선택지 계산에서는 제외
   */
  private sqlWhere(filters: StudentFilters, includeTeacher = true): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    const query = filters.query?.normalize("NFKC").trim();
    const teacherName = primaryTeacher(filters.teacherName);
    if (filters.branch !== undefined) conditions.push(Prisma.sql`b.code=${filters.branch}`);
    if (filters.grade !== undefined) conditions.push(Prisma.sql`s.grade=${filters.grade}`);
    if (filters.representativeClass !== undefined) conditions.push(Prisma.sql`s.class_name=${filters.representativeClass}`);
    if (includeTeacher && filters.teacherName !== undefined) {
      conditions.push(Prisma.sql`
        cardinality(assignment_projection.math_class_names)>0
        and npr_primary_teacher(s.teacher_name)=${teacherName}`);
    }
    if (filters.unitName !== undefined) conditions.push(Prisma.sql`${this.projectedUnitSql()}=${filters.unitName}`);
    conditions.push(this.unitGroupSql(filters.unitGroup));
    conditions.push(this.resolutionSql(filters.resolution));
    if (filters.sourceActive !== undefined) conditions.push(Prisma.sql`s.source_active=${filters.sourceActive}`);
    if (filters.categorizedOnly === true) {
      conditions.push(Prisma.sql`
        cardinality(assignment_projection.math_class_names)
          + cardinality(assignment_projection.science_class_names) > 0`);
    }
    if (query !== undefined && query !== "") {
      const contactLast4 = /^\d{4}$/u.test(query) ? query : null;
      conditions.push(Prisma.sql`(
        s.name ilike '%'||${query}||'%'
        or coalesce(s.school_name,'') ilike '%'||${query}||'%'
        or s.source_student_no ilike '%'||${query}||'%'
        or (${contactLast4}::text is not null and ${contactLast4}::text in (
          s.mother_phone_last4::text,s.father_phone_last4::text
        ))
      )`);
    }
    return Prisma.sql`${Prisma.join(conditions, " and ")}`;
  }

  /**
   * 요약 집계 SQL 조건. 활성 학생, 캠퍼스·단위 그룹만 적용
   */
  private summarySqlWhere(filters: Pick<StudentFilters, "branch" | "unitGroup">): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`s.source_active=true`, this.unitGroupSql(filters.unitGroup)];
    if (filters.branch !== undefined) conditions.push(Prisma.sql`b.code=${filters.branch}`);
    return Prisma.sql`${Prisma.join(conditions, " and ")}`;
  }

  /**
   * 단위 그룹 Prisma 조건
   *
   * @returns 전체면 null, 비재원생 그룹은 결과 없음 조건
   */
  private unitGroupWhere(unitGroup?: StudentUnitGroup): Prisma.StudentWhereInput | null {
    if (unitGroup === undefined || unitGroup === "ALL") return null;
    if (unitGroup === "GUEST") return { id: { lt: 0n } };
    return { unitName: { in: [...UNIT_NAMES_BY_GROUP[unitGroup]] } };
  }

  /**
   * 단위 그룹 SQL 조건
   *
   * 비재원생 그룹은 학생 원장에 없으므로 false, 과학 그룹은 수학 반 없이 과학 반만 있는 학생
   */
  private unitGroupSql(unitGroup?: StudentUnitGroup): Prisma.Sql {
    if (unitGroup === undefined || unitGroup === "ALL") return Prisma.sql`true`;
    if (unitGroup === "GUEST") return Prisma.sql`false`;
    if (unitGroup === "SCIENCE") {
      return Prisma.sql`
        cardinality(assignment_projection.math_class_names)=0
        and cardinality(assignment_projection.science_class_names)>0`;
    }
    return Prisma.sql`${this.projectedUnitSql()} in (${Prisma.join(UNIT_NAMES_BY_GROUP[unitGroup])})`;
  }

  /**
   * 활성 대표 수강 등록에서 수학·과학 반 배열을 계산하는 lateral 조인
   *
   * 수학 반은 원장 대표 반을 맨 앞에 두고 나머지는 이름순
   */
  private assignmentProjectionJoinSql(): Prisma.Sql {
    return Prisma.sql`
      left join lateral (
        select coalesce(
                 array_agg(eligible.class_name order by
                   case when eligible.class_name=btrim(normalize(s.class_name,NFKC)) then 0 else 1 end,
                   eligible.class_name collate "C"
                 ) filter (where not eligible.is_science),
                 '{}'::text[]
               ) math_class_names,
               coalesce(
                 array_agg(eligible.class_name order by eligible.class_name collate "C")
                   filter (where eligible.is_science),
                 '{}'::text[]
               ) science_class_names
          from (
            select normalized.class_name,
                   normalized.base_class like '과%'
                     or normalized.base_class ~ '(물리|화학|생명과학|생물|지구과학)' is_science
              from (
                select distinct btrim(normalize(assignment.class_name,NFKC)) class_name,
                                npr_student_class_base(assignment.class_name) base_class
                  from student_class_assignments assignment
                 where assignment.student_id=s.id
                   and assignment.source_active
                   and npr_is_representative_student_class(assignment.class_name)
              ) normalized
          ) eligible
      ) assignment_projection on true`;
  }

  /**
   * 표시용 대표 반 SQL. 첫 수학 반 → 첫 과학 반 → 원장 반 이름 순
   */
  private projectedClassSql(): Prisma.Sql {
    return Prisma.sql`coalesce(
      assignment_projection.math_class_names[1],
      assignment_projection.science_class_names[1],
      btrim(normalize(s.class_name,NFKC))
    )`;
  }

  /**
   * 표시용 단위 SQL. 첫 수학 반의 단위, 과학 반만 있으면 과학
   */
  private projectedUnitSql(): Prisma.Sql {
    return Prisma.sql`case
      when cardinality(assignment_projection.math_class_names)>0
        then npr_canonical_unit_name(assignment_projection.math_class_names[1])
      when cardinality(assignment_projection.science_class_names)>0 then '과학'
      else null
    end`;
  }

  /**
   * 반 분류 검토 필요 SQL 조건
   *
   * 판정 불가(정규 반 여러 개·반 없음), 원장 반 비정상, 수학 반 여러 개, 대표 반 없음, 단위 판정 불가 중 하나
   */
  private reviewRequiredSql(): Prisma.Sql {
    return Prisma.sql`
      (s.class_resolution_status='AMBIGUOUS_FALLBACK'
        and s.class_resolution_reason in ('MULTIPLE_REGULAR','NO_CLASS'))
      or (btrim(normalize(s.class_name,NFKC))=''
        or not npr_is_representative_student_class(btrim(normalize(s.class_name,NFKC))))
      or cardinality(assignment_projection.math_class_names)>1
      or cardinality(assignment_projection.math_class_names)
        + cardinality(assignment_projection.science_class_names)=0
      or ${this.projectedUnitSql()} is null`;
  }

  /**
   * 학생 정렬 SQL. 캠퍼스 → 단위 → 대표 반 → 이름 → 학번
   */
  private studentOrderSql(): Prisma.Sql {
    return Prisma.sql`
      case b.code
        when 'CAMPUS_A' then 1
        when 'CAMPUS_B' then 2
        when 'CAMPUS_C' then 3
        else 4
      end,
      case ${this.projectedUnitSql()}
        when '초등' then 1
        when '중등1' then 2
        when '중등2' then 3
        when '중등3' then 4
        when '특목' then 5
        when '예중1' then 5
        when '예고1' then 5
        when '고등' then 6
        when '과학' then 7
        else 9
      end,
      ${this.projectedClassSql()} collate "C",
      btrim(normalize(s.name,NFKC)) collate "C",
      s.source_student_no collate "C"`;
  }

  /**
   * 대표 반 판정 결과 SQL 조건
   *
   * @throws {DomainError} 400 STUDENT_RESOLUTION_INVALID
   */
  private resolutionSql(resolution?: string): Prisma.Sql {
    switch (resolution) {
      case undefined: return Prisma.sql`true`;
      case "REGULAR": return Prisma.sql`s.class_resolution_status='ONE_REGULAR'`;
      case "SCIENCE_ALIAS": return Prisma.sql`s.class_resolution_status='SCIENCE_ONLY'`;
      case "MULTIPLE_REGULAR": return Prisma.sql`
        s.class_resolution_status='AMBIGUOUS_FALLBACK' and s.class_resolution_reason='MULTIPLE_REGULAR'`;
      case "NO_CLASS": return Prisma.sql`
        s.class_resolution_status='AMBIGUOUS_FALLBACK' and s.class_resolution_reason='NO_CLASS'`;
      case "FUTURE_TERM_ONLY": return Prisma.sql`
        s.class_resolution_status='AMBIGUOUS_FALLBACK' and s.class_resolution_reason='FUTURE_TERM_ONLY'`;
      default: this.fail(400, "STUDENT_RESOLUTION_INVALID");
    }
  }

  /**
   * 학생별 선택 회차 예약 1건
   *
   * 활성 예약 학생·예약·입장 상태를 우선하고, 이후 마지막 이벤트(없으면 예약 변경) 시각이 최신인 예약
   *
   * @param seminarSessionId 생략하면 빈 목록
   */
  private async bookingProjectionRows(
    studentIds: readonly bigint[],
    seminarSessionId?: string,
  ): Promise<StudentBookingProjectionRow[]> {
    if (seminarSessionId === undefined || studentIds.length === 0) return [];
    return this.prisma.$queryRaw<StudentBookingProjectionRow[]>(Prisma.sql`
      select distinct on (booking_student.student_id)
             booking_student.student_id,
             booking.public_id family_booking_id,
             booking.status,
             booking.attendance_party,
             booking.booking_source,
             latest_event.occurred_at latest_event_at
        from family_booking_students booking_student
        join family_bookings booking on booking.id=booking_student.family_booking_id
        join seminar_sessions session on session.id=booking.session_id
        left join lateral (
          select event.occurred_at
            from booking_events event
           where event.family_booking_id=booking.id
           order by event.occurred_at desc,event.id desc
           limit 1
        ) latest_event on true
       where booking_student.student_id in (${Prisma.join(studentIds)})
         and session.public_id=${seminarSessionId}::uuid
       order by booking_student.student_id,
                case
                  when booking_student.active and booking.status in ('RESERVED','CHECKED_IN') then 0
                  else 1
                end,
                coalesce(latest_event.occurred_at,booking.updated_at) desc,
                booking.id desc,booking_student.id desc`);
  }

  /**
   * 관리자 조회 include 조건. 지점, 활성 수강 등록(반 이름순), 최초·마지막 확인 실행
   */
  private include() {
    return {
      branch: { select: { code: true } },
      assignments: {
        where: { sourceActive: true }, orderBy: [{ className: "asc" as const }, { id: "asc" as const }],
        include: {
          firstSeenRun: { select: { publicId: true } }, lastSeenRun: { select: { publicId: true } },
        },
      },
      firstSeenRun: { select: { startedAt: true } }, lastSeenRun: { select: { startedAt: true } },
    } as const satisfies Prisma.StudentInclude;
  }

  /**
   * 공개 검색 select 조건. 연락처 제외, 활성 수강 등록만
   */
  private publicSelect() {
    return {
      publicId: true,
      sourceStudentNo: true,
      name: true,
      schoolName: true,
      grade: true,
      className: true,
      classResolutionStatus: true,
      classResolutionReason: true,
      branch: { select: { code: true } },
      assignments: {
        where: { sourceActive: true },
        orderBy: [{ className: "asc" as const }, { id: "asc" as const }],
        select: { className: true, sourceUniqueNo: true, classRegistrationNo: true },
      },
    } as const satisfies Prisma.StudentSelect;
  }

  /**
   * 관리자 학생 응답 조립
   *
   * 보호자 연락처는 이 경계에서만 복호화. 담임은 수학 반이 있을 때만 표시
   *
   * @param booking 선택 회차 예약. 없으면 예약 필드 null
   */
  private map(row: StudentRow, booking?: StudentBookingProjectionRow) {
    const classProjection = this.assignmentProjection(row);
    const hasReservation = booking !== undefined
      && ["RESERVED", "CHECKED_IN", "NO_SHOW"].includes(booking.status);
    return {
      studentId: row.publicId, sourceStudentNo: row.sourceStudentNo, name: row.name, branch: row.branch.code,
      schoolName: row.schoolName, grade: row.grade,
      teacherName: classProjection.mathClassName === null ? null : primaryTeacher(row.teacherName),
      motherPhone: row.motherPhoneCiphertext === null ? null : this.phoneProtector.reveal(row.motherPhoneCiphertext),
      fatherPhone: row.fatherPhoneCiphertext === null ? null : this.phoneProtector.reveal(row.fatherPhoneCiphertext),
      unitName: classProjection.unitName, sourceActive: row.sourceActive,
      mathClassName: classProjection.mathClassName,
      scienceClassNames: classProjection.scienceClassNames,
      hasReservation,
      reservation: booking === undefined ? null : {
        status: booking.status,
        hasReservation,
        familyBookingId: booking.family_booking_id,
        attendanceParty: booking.attendance_party,
        bookingSource: booking.booking_source,
      },
      representativeClass: this.representative(row, classProjection),
      assignments: row.assignments.map((assignment) => ({
        assignmentId: assignment.publicId,
        sourceAssignmentKey: this.assignmentKey(assignment.sourceUniqueNo, assignment.classRegistrationNo),
        sourceStudentNo: row.sourceStudentNo, branch: row.branch.code, className: assignment.className,
        schoolName: assignment.schoolName, grade: assignment.grade, teacherName: primaryTeacher(assignment.teacherName),
        sourceStatus: row.sourceStatus, sourceActive: assignment.sourceActive,
        candidateType: !isRepresentativeStudentClass(assignment.className) ? "NONE"
          : isScienceStudentClass(assignment.className) ? "SCIENCE" : "REGULAR",
        exclusionReason: !isRepresentativeStudentClass(assignment.className) ? "SUPPLEMENTARY" : "NONE",
        firstSeenRunId: assignment.firstSeenRun.publicId, lastSeenRunId: assignment.lastSeenRun.publicId,
      })),
      firstSeenAt: row.firstSeenRun.startedAt, lastSeenAt: row.lastSeenRun.startedAt,
    };
  }

  /**
   * 활성 수강 등록에서 수학·과학 반 후보와 단위 계산
   *
   * 공개 조회는 sourceActive를 선택하지 않지만 조회 조건이 이미 활성만 허용하며, 값이 있을 때의 검사는 유지
   */
  private assignmentProjection(row: ProjectionStudent): StudentAssignmentProjection {
    const rawClassNames = [...new Set<string>(row.assignments
      .filter((assignment) => assignment.sourceActive !== false)
      .map((assignment): string => typeof assignment.className === "string" ? assignment.className : ""))]
      .sort(this.classNameOrder);
    const normalizedClassNames = [...new Set(rawClassNames.map((className) => this.normalizedClassName(className)))]
      .sort(this.classNameOrder);
    const representativeClassNames = normalizedClassNames.filter((className) =>
      className !== "" && isRepresentativeStudentClass(className));
    const mathClassNames = representativeClassNames
      .filter((className) => !isScienceStudentClass(className))
      .sort(this.classNameOrder);
    const scienceClassNames = representativeClassNames
      .filter((className) => isScienceStudentClass(className))
      .sort(this.classNameOrder);
    const representative = this.normalizedClassName(row.className);
    const mathClassName = mathClassNames.includes(representative) ? representative : mathClassNames[0] ?? null;
    return {
      rawClassNames,
      representativeClassNames,
      mathClassNames,
      mathClassName,
      scienceClassNames,
      unitName: mathClassName === null
        ? scienceClassNames.length > 0 ? "과학" : null
        : canonicalUnitName(studentClassBaseName(mathClassName)),
    };
  }

  /**
   * 반 이름 정규화. 문자열이 아니면 빈 문자열
   */
  private normalizedClassName(value: unknown): string {
    return typeof value === "string" ? value.normalize("NFKC").trim() : "";
  }

  /**
   * 반 이름 코드 단위 비교. SQL `collate "C"` 정렬과 같은 순서
   */
  private readonly classNameOrder = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;

  /**
   * 대표 반 응답
   *
   * 판정 결과·후보 수와 정규 반으로 선택된 활성 수강 등록 키 반환. 표시 수학 반과 일치하는 등록이 없으면 키는 null
   */
  private representative(row: ProjectionStudent, projection = this.assignmentProjection(row)) {
    const resolution = row.classResolutionStatus === "ONE_REGULAR" ? "REGULAR"
      : row.classResolutionStatus === "SCIENCE_ONLY" ? "SCIENCE_ALIAS"
        : row.classResolutionReason === "MULTIPLE_REGULAR" ? "MULTIPLE_REGULAR"
          : row.classResolutionReason === "FUTURE_TERM_ONLY" ? "FUTURE_TERM_ONLY" : "NO_CLASS";
    const selected = resolution === "REGULAR" ? row.assignments.find((assignment) =>
      assignment.sourceActive !== false
        && isRepresentativeStudentClass(assignment.className)
        && this.normalizedClassName(assignment.className) === projection.mathClassName) : null;
    return {
      resolution,
      displayName: resolution === "REGULAR" ? studentClassBaseName(row.className) : resolution === "SCIENCE_ALIAS" ? "과학" : null,
      // FUTURE_TERM_ONLY는 모호한 상태가 아님. 고를 반이 여럿이 아니라 현재 반이 아직 없다는 확정 사실
      ambiguous: resolution === "MULTIPLE_REGULAR" || resolution === "NO_CLASS",
      regularCandidateCount: projection.mathClassNames.length,
      scienceCandidateCount: projection.scienceClassNames.length,
      selectedSourceAssignmentKey: selected === null || selected === undefined
        ? null : this.assignmentKey(selected.sourceUniqueNo, selected.classRegistrationNo),
    };
  }

  /**
   * 검토 대상 학생의 반 분류 사유 응답. 연락처 제외
   */
  private mapReviewRequired(row: StudentRow) {
    const projection = this.assignmentProjection(row);
    const reasonCodes: StudentReviewReasonCode[] = [];
    const originalClassName = this.normalizedClassName(row.className);
    if (projection.mathClassNames.length > 1
      || (row.classResolutionStatus === "AMBIGUOUS_FALLBACK" && row.classResolutionReason === "MULTIPLE_REGULAR")) {
      reasonCodes.push("MULTIPLE_MATH_CLASS");
    }
    if (projection.representativeClassNames.length === 0) reasonCodes.push("NO_RECOGNIZABLE_CLASS");
    if (projection.unitName === null) reasonCodes.push("UNIT_UNRESOLVED");
    if ((row.classResolutionStatus === "AMBIGUOUS_FALLBACK" && row.classResolutionReason === "NO_CLASS")
      || originalClassName === "" || !isRepresentativeStudentClass(originalClassName)) {
      reasonCodes.push("ABNORMAL_OR_EMPTY_CLASS");
    }
    return {
      studentId: row.publicId,
      sourceStudentNo: row.sourceStudentNo,
      branch: row.branch.code,
      name: row.name,
      originalClassName,
      mathClassName: projection.mathClassName,
      scienceClassNames: projection.scienceClassNames,
      reasonCodes,
      rawClassNames: projection.rawClassNames,
      rawRepresentativeClassNames: projection.representativeClassNames,
    };
  }

  /**
   * 수강 등록 키. 300자를 넘으면 SHA-256 다이제스트
   */
  private assignmentKey(sourceUniqueNo: string, classRegistrationNo: string): string {
    const raw = `${sourceUniqueNo}:${classRegistrationNo}`;
    return raw.length <= 300 ? raw : `sha256:${createHash("sha256").update(raw).digest("base64url")}`;
  }

  /**
   * 대표 반 판정 결과 Prisma 조건
   *
   * @throws {DomainError} 400 STUDENT_RESOLUTION_INVALID
   */
  private resolutionWhere(resolution?: string): Prisma.StudentWhereInput {
    switch (resolution) {
      case undefined: return {};
      case "REGULAR": return { classResolutionStatus: "ONE_REGULAR" };
      case "SCIENCE_ALIAS": return { classResolutionStatus: "SCIENCE_ONLY" };
      case "MULTIPLE_REGULAR": return {
        classResolutionStatus: "AMBIGUOUS_FALLBACK", classResolutionReason: "MULTIPLE_REGULAR",
      };
      case "NO_CLASS": return {
        classResolutionStatus: "AMBIGUOUS_FALLBACK", classResolutionReason: "NO_CLASS",
      };
      case "FUTURE_TERM_ONLY": return {
        classResolutionStatus: "AMBIGUOUS_FALLBACK", classResolutionReason: "FUTURE_TERM_ONLY",
      };
      default: this.fail(400, "STUDENT_RESOLUTION_INVALID");
    }
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> { const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy; }

  /**
   * 학생 조회 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The student operation could not be completed."); }
}
