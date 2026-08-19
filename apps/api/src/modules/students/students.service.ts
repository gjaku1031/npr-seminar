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

interface StudentFilters {
  readonly branch?: string;
  readonly query?: string;
  /** @deprecated Use unitGroup. */
  readonly grade?: string;
  readonly unitGroup?: StudentUnitGroup;
  readonly representativeClass?: string;
  readonly teacherName?: string;
  readonly unitName?: string;
  readonly resolution?: string;
  readonly sourceActive?: boolean;
  readonly categorizedOnly?: boolean;
  readonly seminarSessionId?: string;
  readonly page: number;
  readonly pageSize: number;
}

interface StudentReviewFilters {
  readonly branch?: string;
  readonly page: number;
  readonly pageSize: number;
}

interface StudentSummaryRow {
  readonly unique_student_count: bigint;
  readonly multi_assignment_student_count: bigint;
  readonly regular_representative_count: bigint;
  readonly science_alias_representative_count: bigint;
  readonly multiple_regular_ambiguous_count: bigint;
  readonly no_class_ambiguous_count: bigint;
  readonly math_regular_student_count: bigint;
  readonly science_regular_student_count: bigint;
  readonly eligible_unique_student_count: bigint;
  readonly math_student_count: bigint;
  readonly science_only_student_count: bigint;
}

interface StudentCountRow {
  readonly count: bigint;
}

interface StudentTeacherFacetRow {
  readonly teachers: string[];
}

interface StudentBookingProjectionRow {
  readonly student_id: bigint;
  readonly family_booking_id: string;
  readonly status: string;
  readonly attendance_party: string;
  readonly booking_source: string;
  readonly latest_event_at: Date | null;
}

interface StudentAssignmentProjection {
  readonly rawClassNames: string[];
  readonly representativeClassNames: string[];
  readonly mathClassNames: string[];
  readonly mathClassName: string | null;
  readonly scienceClassNames: string[];
  readonly unitName: ReturnType<typeof canonicalUnitName>;
}

type StudentReviewReasonCode =
  | "MULTIPLE_MATH_CLASS"
  | "NO_RECOGNIZABLE_CLASS"
  | "UNIT_UNRESOLVED"
  | "ABNORMAL_OR_EMPTY_CLASS";

@Injectable()
export class StudentsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly bookingProof: BookingProofService,
    private readonly phoneProtector: PhoneProtector,
  ) {}

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
    const positions = new Map(pageIds.map((row, index) => [row.id.toString(), index]));
    const [rows, bookingRows]: [any[], StudentBookingProjectionRow[]] = pageIds.length === 0
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

  public async get(studentId: string) {
    const row = await this.prisma.student.findUnique({ where: { publicId: studentId }, include: this.include() });
    if (row === null) this.fail(404, "STUDENT_NOT_FOUND");
    return this.map(row);
  }

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
      items: rows.map((row) => ({
        studentId: row.publicId, sourceStudentNo: row.sourceStudentNo, name: row.name, branch: row.branch.code,
        schoolName: row.schoolName, grade: row.grade, representativeClass: this.representative(row),
      })),
      page: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages: Math.ceil(totalItems / filters.pageSize) },
    };
  }

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

  private summarySqlWhere(filters: Pick<StudentFilters, "branch" | "unitGroup">): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`s.source_active=true`, this.unitGroupSql(filters.unitGroup)];
    if (filters.branch !== undefined) conditions.push(Prisma.sql`b.code=${filters.branch}`);
    return Prisma.sql`${Prisma.join(conditions, " and ")}`;
  }

  private unitGroupWhere(unitGroup?: StudentUnitGroup): Prisma.StudentWhereInput | null {
    if (unitGroup === undefined || unitGroup === "ALL") return null;
    if (unitGroup === "GUEST") return { id: { lt: 0n } };
    return { unitName: { in: [...UNIT_NAMES_BY_GROUP[unitGroup]] } };
  }

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

  private projectedClassSql(): Prisma.Sql {
    return Prisma.sql`coalesce(
      assignment_projection.math_class_names[1],
      assignment_projection.science_class_names[1],
      btrim(normalize(s.class_name,NFKC))
    )`;
  }

  private projectedUnitSql(): Prisma.Sql {
    return Prisma.sql`case
      when cardinality(assignment_projection.math_class_names)>0
        then npr_canonical_unit_name(assignment_projection.math_class_names[1])
      when cardinality(assignment_projection.science_class_names)>0 then '과학'
      else null
    end`;
  }

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
    };
  }

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
    };
  }

  private map(row: any, booking?: StudentBookingProjectionRow) {
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
      assignments: row.assignments.map((assignment: any) => ({
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

  private assignmentProjection(row: any): StudentAssignmentProjection {
    const rawClassNames = [...new Set<string>((row.assignments as any[])
      .filter((assignment: any) => assignment.sourceActive !== false)
      .map((assignment: any): string => typeof assignment.className === "string" ? assignment.className : ""))]
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

  private normalizedClassName(value: unknown): string {
    return typeof value === "string" ? value.normalize("NFKC").trim() : "";
  }

  private readonly classNameOrder = (left: string, right: string): number =>
    left < right ? -1 : left > right ? 1 : 0;

  private representative(row: any, projection = this.assignmentProjection(row)) {
    const resolution = row.classResolutionStatus === "ONE_REGULAR" ? "REGULAR"
      : row.classResolutionStatus === "SCIENCE_ONLY" ? "SCIENCE_ALIAS"
        : row.classResolutionReason === "MULTIPLE_REGULAR" ? "MULTIPLE_REGULAR"
          : row.classResolutionReason === "FUTURE_TERM_ONLY" ? "FUTURE_TERM_ONLY" : "NO_CLASS";
    const selected = resolution === "REGULAR" ? row.assignments.find((assignment: any) =>
      assignment.sourceActive !== false
        && isRepresentativeStudentClass(assignment.className)
        && this.normalizedClassName(assignment.className) === projection.mathClassName) : null;
    return {
      resolution,
      displayName: resolution === "REGULAR" ? studentClassBaseName(row.className) : resolution === "SCIENCE_ALIAS" ? "과학" : null,
      // FUTURE_TERM_ONLY 는 모호가 아니다 — 고를 반이 여럿이라 못 정한 것이 아니라
      // 지금 다니는 반이 아직 없다는 확정된 사실이다.
      ambiguous: resolution === "MULTIPLE_REGULAR" || resolution === "NO_CLASS",
      regularCandidateCount: projection.mathClassNames.length,
      scienceCandidateCount: projection.scienceClassNames.length,
      selectedSourceAssignmentKey: selected === null || selected === undefined
        ? null : this.assignmentKey(selected.sourceUniqueNo, selected.classRegistrationNo),
    };
  }

  private mapReviewRequired(row: any) {
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

  private assignmentKey(sourceUniqueNo: string, classRegistrationNo: string): string {
    const raw = `${sourceUniqueNo}:${classRegistrationNo}`;
    return raw.length <= 300 ? raw : `sha256:${createHash("sha256").update(raw).digest("base64url")}`;
  }

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

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> { const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy; }

  private fail(status: number, code: string): never { throw new DomainError(status, code, "The student operation could not be completed."); }
}
