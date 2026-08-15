import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";
import { canonicalUnitName, primaryTeacher } from "../student-sync/student-display-normalizer.js";
import type { StudentUnitGroup } from "../student-sync/student-unit-group.js";
import {
  bookingOperationalEventLabel,
  OPERATIONAL_BOOKING_EVENT_TYPES,
  type OperationalBookingEventType,
} from "./booking-operational-event.js";

export type RosterUnitGroup = StudentUnitGroup;

interface RosterFilters {
  readonly branch?: string;
  readonly unitGroup: RosterUnitGroup;
  readonly teacherName?: string;
  readonly query?: string;
  readonly page: number;
  readonly pageSize: number;
}

interface RosterDatabaseRow {
  readonly roster_entry_id: string;
  readonly participant_type: "ENROLLED" | "GUEST";
  readonly student_id: string | null;
  readonly family_booking_student_id: string | null;
  readonly student_internal_id: bigint | null;
  readonly guest_child_internal_id: bigint | null;
  readonly guest_child_internal_ids: bigint[];
  readonly source_student_no: string;
  readonly name: string;
  readonly branch: string;
  readonly class_name: string;
  readonly math_class_name: string | null;
  readonly science_class_names: string[];
  readonly school_name: string | null;
  readonly grade: string | null;
  readonly unit_name: string | null;
  readonly primary_teacher: string | null;
  readonly mother_phone_ciphertext: Uint8Array | null;
  readonly father_phone_ciphertext: Uint8Array | null;
  readonly guest_contact_ciphertext: Uint8Array | null;
}

interface RosterFacetRow { readonly teachers: string[]; readonly unmatched_unit_count: number; }
interface RosterMonitoringRow {
  readonly roster_row_count: bigint;
  readonly student_count: bigint;
  readonly family_booking_count: bigint;
  readonly attendee_count: bigint;
}

const CURRENT_BOOKING_STATUSES = new Set(["RESERVED", "CHECKED_IN"]);

export function neutralizeSpreadsheetText(value: string | null | undefined): string {
  const text = value ?? "";
  return /^[\s\u0000-\u001f\u007f-\u009f]*[=+@-]/u.test(text) ? `'${text}` : text;
}

@Injectable()
export class SessionRosterService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly phoneProtector: PhoneProtector,
  ) {}

  public async list(sessionId: string, filters: RosterFilters) {
    const session = await this.prisma.seminarSession.findUnique({
      where: { publicId: sessionId },
      select: { id: true, scope: true, branch: { select: { code: true } } },
    });
    if (session === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
    const sessionBranch = session.scope === "BRANCH" ? session.branch?.code ?? null : null;
    if (session.scope === "BRANCH" && sessionBranch === null) this.fail(409, "SESSION_BRANCH_MISSING");
    if (sessionBranch !== null && filters.branch !== undefined && filters.branch !== sessionBranch) {
      return this.empty(filters.page, filters.pageSize);
    }
    const effectiveBranch = sessionBranch ?? filters.branch ?? null;
    const teacherName = filters.teacherName === undefined ? null : primaryTeacher(filters.teacherName);
    const query = filters.query?.normalize("NFKC").trim() || null;
    const contactLast4 = query !== null && /^\d{4}$/u.test(query) ? query : null;
    const base = this.rosterBase(session.id, effectiveBranch);
    const filtered = this.filteredRoster(base, filters.unitGroup, teacherName, query, contactLast4);
    const offset = (filters.page - 1) * filters.pageSize;
    const [rows, monitoringRows, facetRows] = await Promise.all([
      this.rosterRows(filtered, { offset, limit: filters.pageSize }),
      this.rosterMonitoring(session.id, filtered),
      this.prisma.$queryRaw<RosterFacetRow[]>(Prisma.sql`
        ${base},
        enrolled as (
          select primary_teacher,unit_name
            from roster_base
           where participant_type='ENROLLED'
        )
        select coalesce(array_agg(distinct primary_teacher order by primary_teacher)
                 filter (where primary_teacher is not null),'{}'::text[]) teachers,
               count(*) filter (where unit_name is null)::integer unmatched_unit_count
          from enrolled`),
    ]);
    const items = await this.mapRows(session.id, rows);
    const monitoring = monitoringRows[0] ?? {
      roster_row_count: 0n,
      student_count: 0n,
      family_booking_count: 0n,
      attendee_count: 0n,
    };
    const totalItems = Number(monitoring.roster_row_count);
    const facets = facetRows[0] ?? { teachers: [], unmatched_unit_count: 0 };
    return {
      items,
      page: {
        page: filters.page,
        pageSize: filters.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / filters.pageSize),
      },
      facets: {
        teachers: [...new Set(facets.teachers.map(primaryTeacher).filter((value): value is string => value !== null))]
          .sort((left, right) => left.localeCompare(right, "ko")),
        unmatchedUnitCount: facets.unmatched_unit_count,
      },
      monitoring: {
        studentCount: Number(monitoring.student_count),
        familyBookingCount: Number(monitoring.family_booking_count),
        attendeeCount: Number(monitoring.attendee_count),
      },
    };
  }

  public async exportXlsx(sessionId: string, filters: Omit<RosterFilters, "page" | "pageSize">): Promise<Buffer> {
    const session = await this.prisma.seminarSession.findUnique({
      where: { publicId: sessionId },
      select: { id: true, scope: true, branch: { select: { code: true } } },
    });
    if (session === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
    const sessionBranch = session.scope === "BRANCH" ? session.branch?.code ?? null : null;
    if (session.scope === "BRANCH" && sessionBranch === null) this.fail(409, "SESSION_BRANCH_MISSING");
    const branchMismatch = sessionBranch !== null
      && filters.branch !== undefined
      && filters.branch !== sessionBranch;
    let items: Awaited<ReturnType<SessionRosterService["mapRows"]>> = [];
    if (!branchMismatch) {
      const effectiveBranch = sessionBranch ?? filters.branch ?? null;
      const teacherName = filters.teacherName === undefined ? null : primaryTeacher(filters.teacherName);
      const query = filters.query?.normalize("NFKC").trim() || null;
      const contactLast4 = query !== null && /^\d{4}$/u.test(query) ? query : null;
      const filtered = this.filteredRoster(
        this.rosterBase(session.id, effectiveBranch),
        filters.unitGroup,
        teacherName,
        query,
        contactLast4,
      );
      items = await this.mapRows(session.id, await this.rosterRows(filtered));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "NPR Seminar";
    workbook.created = new Date();
    workbook.modified = new Date();
    const worksheet = workbook.addWorksheet("예약명단", {
      views: [{ state: "frozen", ySplit: 1 }],
      properties: { defaultRowHeight: 20 },
    });
    worksheet.columns = [
      { header: "예약일시", key: "bookingCreatedAt", width: 22 },
      { header: "예약번호", key: "familyBookingId", width: 38 },
      { header: "참여유형", key: "participantType", width: 12 },
      { header: "학번", key: "sourceStudentNo", width: 20 },
      { header: "캠퍼스", key: "campus", width: 12 },
      { header: "학생명", key: "studentName", width: 16 },
      { header: "대표반", key: "representativeClassName", width: 24 },
      { header: "수학반", key: "mathClassName", width: 24 },
      { header: "과학반", key: "scienceClassNames", width: 32 },
      { header: "단위", key: "unitName", width: 12 },
      { header: "학교", key: "schoolName", width: 24 },
      { header: "학년", key: "grade", width: 10 },
      { header: "담임", key: "primaryTeacher", width: 16 },
      { header: "학부모HP (모)", key: "motherPhone", width: 18 },
      { header: "학부모HP (부)", key: "fatherPhone", width: 18 },
      { header: "예약경로", key: "bookingSource", width: 12 },
      { header: "참석자", key: "attendanceParty", width: 10 },
      { header: "예약인원", key: "seatCount", width: 10 },
      { header: "예약상태", key: "reservationStatus", width: 14 },
      { header: "체크인상태", key: "checkInStatus", width: 14 },
      { header: "체크인일시", key: "checkedInAt", width: 22 },
      { header: "최근이벤트", key: "latestEventLabel", width: 20 },
      { header: "최근이벤트코드", key: "latestEventType", width: 24 },
      { header: "최근이벤트일시", key: "latestEventAt", width: 22 },
    ];
    for (const item of items) {
      const currentHistory = item.bookingHistory.find((entry) => entry.current);
      const guestContact = item.participantType === "GUEST" ? item.guestContact : null;
      const guestMother = item.booking.attendanceParty === "MOTHER" || item.booking.attendanceParty === "BOTH"
        ? guestContact
        : null;
      const guestFather = item.booking.attendanceParty === "FATHER" ? guestContact : null;
      worksheet.addRow({
        bookingCreatedAt: neutralizeSpreadsheetText(this.formatSeoulDate(currentHistory?.createdAt ?? null)),
        familyBookingId: neutralizeSpreadsheetText(item.booking.familyBookingId),
        participantType: neutralizeSpreadsheetText(this.participantTypeLabel(item.participantType)),
        sourceStudentNo: neutralizeSpreadsheetText(item.sourceStudentNo),
        campus: neutralizeSpreadsheetText(this.campusName(item.branch)),
        studentName: neutralizeSpreadsheetText(item.name),
        representativeClassName: neutralizeSpreadsheetText(item.representativeClassName),
        mathClassName: neutralizeSpreadsheetText(item.mathClassName),
        scienceClassNames: neutralizeSpreadsheetText(item.scienceClassNames.join(", ")),
        unitName: neutralizeSpreadsheetText(item.unitName),
        schoolName: neutralizeSpreadsheetText(item.schoolName),
        grade: neutralizeSpreadsheetText(item.grade),
        primaryTeacher: neutralizeSpreadsheetText(item.primaryTeacher),
        motherPhone: neutralizeSpreadsheetText(item.motherPhone ?? guestMother),
        fatherPhone: neutralizeSpreadsheetText(item.fatherPhone ?? guestFather),
        bookingSource: neutralizeSpreadsheetText(this.bookingSourceLabel(item.booking.bookingSource)),
        attendanceParty: neutralizeSpreadsheetText(this.attendancePartyLabel(item.booking.attendanceParty)),
        seatCount: item.booking.seatCount,
        reservationStatus: neutralizeSpreadsheetText(this.reservationStatus(item.booking.status)),
        checkInStatus: neutralizeSpreadsheetText(this.checkInStatus(item.booking.status)),
        checkedInAt: neutralizeSpreadsheetText(this.formatSeoulDate(item.booking.checkedInAt)),
        latestEventLabel: neutralizeSpreadsheetText(item.latestOperationalEvent?.label),
        latestEventType: neutralizeSpreadsheetText(item.latestOperationalEvent?.type),
        latestEventAt: neutralizeSpreadsheetText(this.formatSeoulDate(item.latestOperationalEvent?.occurredAt ?? null)),
      });
    }
    worksheet.autoFilter = { from: "A1", to: "X1" };
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    header.alignment = { vertical: "middle", horizontal: "center" };
    header.height = 24;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.alignment = { vertical: "middle" };
    });
    const output = await workbook.xlsx.writeBuffer();
    return Buffer.from(output);
  }

  private async mapRows(sessionInternalId: bigint, rows: readonly RosterDatabaseRow[]) {
    const links = await this.bookingLinks(sessionInternalId, rows);
    const byRosterEntry = new Map<string, typeof links>();
    const guestKeys = new Map<string, string>();
    for (const row of rows) {
      if (row.participant_type !== "GUEST") continue;
      for (const id of row.guest_child_internal_ids) guestKeys.set(id.toString(), this.rowKey(row));
    }
    for (const link of links) {
      const key = link.studentId === null ? guestKeys.get(link.id.toString()) : `E:${link.studentId.toString()}`;
      if (key === undefined) continue;
      const existing = byRosterEntry.get(key) ?? [];
      existing.push(link);
      byRosterEntry.set(key, existing);
    }
    return rows.map((row) => this.mapRow(row, byRosterEntry.get(this.rowKey(row)) ?? []));
  }

  private rosterBase(sessionInternalId: bigint, branch: string | null) {
    return Prisma.sql`
      with guest_ranked as (
        select first_value(fbs.public_id) over identity_window roster_entry_id,
               fbs.public_id family_booking_student_id,fbs.id guest_child_internal_id,
               array_agg(fbs.id) over identity_window guest_child_internal_ids,
               fbs.source_student_no_snapshot source_student_no,fbs.student_name_snapshot name,
               fbs.branch_code_at_booking branch,fbs.class_name_snapshot class_name,
               fbs.school_name_snapshot school_name,fbs.grade_snapshot grade,
               fb.contact_ciphertext guest_contact_ciphertext,fb.contact_last4 guest_contact_last4,
               row_number() over (
                 partition by fb.contact_digest,lower(btrim(normalize(fbs.student_name_snapshot,NFKC))),fbs.branch_code_at_booking
                 order by case when fb.status in ('RESERVED','CHECKED_IN') then 0 else 1 end,
                          fb.created_at desc,fb.id desc,fbs.id desc
               ) selection_rank
          from family_booking_students fbs
          join family_bookings fb on fb.id=fbs.family_booking_id and fb.session_id=fbs.session_id
         where fbs.session_id=${sessionInternalId} and fbs.participant_type='GUEST'
           and (${branch}::text is null or fbs.branch_code_at_booking=${branch})
        window identity_window as (
          partition by fb.contact_digest,lower(btrim(normalize(fbs.student_name_snapshot,NFKC))),fbs.branch_code_at_booking
          order by fb.created_at,fbs.id rows between unbounded preceding and unbounded following
        )
      ),
      roster_base as (
        select s.public_id roster_entry_id,'ENROLLED'::text participant_type,s.public_id student_id,
               null::uuid family_booking_student_id,s.id student_internal_id,null::bigint guest_child_internal_id,
               array[]::bigint[] guest_child_internal_ids,
               s.source_student_no,s.name,b.code branch,s.class_name,
               assignment_projection.math_class_names[1] math_class_name,
               assignment_projection.science_class_names,
               s.school_name,s.grade,
               npr_canonical_unit_name(s.class_name) unit_name,
               case when cardinality(assignment_projection.math_class_names)>0
                 then npr_primary_teacher(s.teacher_name)
                 else null
               end primary_teacher,
               s.mother_phone_ciphertext,s.father_phone_ciphertext,null::bytea guest_contact_ciphertext,
               s.mother_phone_last4,s.father_phone_last4,null::text guest_contact_last4
          from students s
          join branches b on b.id=s.branch_id
          left join lateral (
            select coalesce(
                     array_agg(candidate.class_name order by
                       case when candidate.class_name=btrim(normalize(s.class_name,NFKC)) then 0 else 1 end,
                       candidate.class_name collate "C"
                     ) filter (where not candidate.is_science),
                     '{}'::text[]
                   ) math_class_names,
                   coalesce(
                     array_agg(candidate.class_name order by candidate.class_name collate "C")
                       filter (where candidate.is_science),
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
              ) candidate
          ) assignment_projection on true
         where (${branch}::text is null or b.code=${branch})
           and exists (
             select 1
               from family_booking_students enrolled_fbs
              where enrolled_fbs.session_id=${sessionInternalId}
                and enrolled_fbs.participant_type='ENROLLED'
                and enrolled_fbs.student_id=s.id
           )
        union all
        select roster_entry_id,'GUEST'::text,null::uuid,family_booking_student_id,null::bigint,
               guest_child_internal_id,guest_child_internal_ids,source_student_no,name,branch,class_name,
               null::text,'{}'::text[],
               school_name,grade,null::text,null::text,null::bytea,null::bytea,
               guest_contact_ciphertext,null::text,null::text,guest_contact_last4
          from guest_ranked where selection_rank=1
      )`;
  }

  private filteredRoster(
    base: Prisma.Sql,
    unitGroup: RosterUnitGroup,
    teacherName: string | null,
    query: string | null,
    contactLast4: string | null,
  ) {
    return Prisma.sql`
      ${base},
      roster_filtered as (
        select * from roster_base
         where (
           ${unitGroup}='ALL'
           or (${unitGroup}='GUEST' and participant_type='GUEST')
           or (participant_type='ENROLLED' and (
             (${unitGroup}='ELEMENTARY' and unit_name='초등')
             or (${unitGroup}='MIDDLE_1' and unit_name='중등1')
             or (${unitGroup}='MIDDLE_2' and unit_name='중등2')
             or (${unitGroup}='MIDDLE_3' and unit_name='중등3')
             or (${unitGroup}='SPECIAL_PURPOSE' and unit_name in ('특목','예중1','예고1'))
             or (${unitGroup}='HIGH' and unit_name='고등')
             or (${unitGroup}='SCIENCE' and unit_name='과학')
           ))
         )
         and (${teacherName}::text is null or (participant_type='ENROLLED' and primary_teacher=${teacherName}))
         and (${query}::text is null or name ilike '%'||${query}||'%'
              or coalesce(school_name,'') ilike '%'||${query}||'%'
              or source_student_no ilike '%'||${query}||'%'
              or (${contactLast4}::text is not null and ${contactLast4}::text in (
                mother_phone_last4::text,father_phone_last4::text,guest_contact_last4::text
              )))
      )`;
  }

  private rosterRows(filtered: Prisma.Sql, pagination?: { readonly offset: number; readonly limit: number }) {
    const page = pagination === undefined
      ? Prisma.empty
      : Prisma.sql`offset ${pagination.offset} limit ${pagination.limit}`;
    return this.prisma.$queryRaw<RosterDatabaseRow[]>(Prisma.sql`
      ${filtered}
      select roster_entry_id,participant_type,student_id,family_booking_student_id,
             student_internal_id,guest_child_internal_id,guest_child_internal_ids,source_student_no,name,branch,class_name,
             math_class_name,science_class_names,school_name,grade,unit_name,primary_teacher,mother_phone_ciphertext,
             father_phone_ciphertext,guest_contact_ciphertext
        from roster_filtered
       order by case branch
                  when 'SONGPA' then 1
                  when 'WIRYE' then 2
                  when 'GWANGJIN' then 3
                  else 4
                end,
                case
                  when participant_type='GUEST' then 8
                  when unit_name='초등' then 1
                  when unit_name='중등1' then 2
                  when unit_name='중등2' then 3
                  when unit_name='중등3' then 4
                  when unit_name in ('특목','예중1','예고1') then 5
                  when unit_name='고등' then 6
                  when unit_name='과학' then 7
                  else 9
                end,
                case
                  when math_class_name is not null then math_class_name
                  when cardinality(science_class_names)>0 then science_class_names[1]
                  else class_name
                end collate "C",
                btrim(normalize(name,NFKC)) collate "C",
                source_student_no collate "C",roster_entry_id
       ${page}`);
  }

  private rosterMonitoring(sessionInternalId: bigint, filtered: Prisma.Sql) {
    return this.prisma.$queryRaw<RosterMonitoringRow[]>(Prisma.sql`
      ${filtered},
      roster_booking_candidates as (
        select roster.roster_entry_id,booking.id family_booking_id,booking.status,
               booking.attendance_party,booking.created_at,child.id child_id,
               row_number() over (
                 partition by roster.roster_entry_id
                 order by case when booking.status in ('RESERVED','CHECKED_IN') then 0 else 1 end,
                          booking.created_at desc,child.id desc
               ) selection_rank
          from roster_filtered roster
          join family_booking_students child
            on child.session_id=${sessionInternalId}
           and (
             (roster.participant_type='ENROLLED' and child.student_id=roster.student_internal_id)
             or (roster.participant_type='GUEST' and child.id=any(roster.guest_child_internal_ids))
           )
          join family_bookings booking
            on booking.id=child.family_booking_id and booking.session_id=child.session_id
      ),
      selected_roster_bookings as (
        select family_booking_id,status,attendance_party
          from roster_booking_candidates
         where selection_rank=1 and status in ('RESERVED','CHECKED_IN')
      ),
      selected_families as (
        select distinct family_booking_id,status,attendance_party
          from selected_roster_bookings
      )
      select (select count(*)::bigint from roster_filtered) roster_row_count,
             (select count(*)::bigint from selected_roster_bookings) student_count,
             count(*)::bigint family_booking_count,
             coalesce(sum(case attendance_party when 'BOTH' then 2 else 1 end),0)::bigint attendee_count
        from selected_families`);
  }

  private async bookingLinks(sessionInternalId: bigint, rows: readonly RosterDatabaseRow[]) {
    const studentIds = rows.flatMap((row) => row.student_internal_id === null ? [] : [row.student_internal_id]);
    const guestIds = rows.flatMap((row) => row.guest_child_internal_ids);
    if (studentIds.length === 0 && guestIds.length === 0) return [];
    return this.prisma.familyBookingStudent.findMany({
      where: {
        sessionId: sessionInternalId,
        OR: [
          ...(studentIds.length === 0 ? [] : [{ studentId: { in: studentIds } }]),
          ...(guestIds.length === 0 ? [] : [{ id: { in: guestIds } }]),
        ],
      },
      select: {
        id: true,
        publicId: true,
        studentId: true,
        familyBooking: { select: {
          publicId: true,
          status: true,
          attendanceParty: true,
          bookingSource: true,
          seatCount: true,
          checkedInAt: true,
          cancelledAt: true,
          createdAt: true,
          version: true,
          bookingEvents: {
            where: { eventType: { in: [...OPERATIONAL_BOOKING_EVENT_TYPES] } },
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { eventId: true, eventType: true, actorSubject: true, occurredAt: true },
          },
        } },
      },
    });
  }

  private mapRow(row: RosterDatabaseRow, links: Awaited<ReturnType<SessionRosterService["bookingLinks"]>>) {
    const sorted = [...links].sort((left, right) => {
      const leftCurrent = CURRENT_BOOKING_STATUSES.has(left.familyBooking.status) ? 1 : 0;
      const rightCurrent = CURRENT_BOOKING_STATUSES.has(right.familyBooking.status) ? 1 : 0;
      return rightCurrent - leftCurrent
        || right.familyBooking.createdAt.getTime() - left.familyBooking.createdAt.getTime()
        || (right.id > left.id ? 1 : right.id < left.id ? -1 : 0);
    });
    const selected = sorted[0] ?? null;
    if (selected === null) this.fail(500, "SESSION_ROSTER_BOOKING_LINK_MISSING");
    const events = sorted.flatMap((link) => link.familyBooking.bookingEvents.map((event) => ({ event, link })));
    const latest = events.sort((left, right) => right.event.occurredAt.getTime() - left.event.occurredAt.getTime())[0];
    return {
      rosterEntryId: row.roster_entry_id,
      participantType: row.participant_type,
      studentId: row.student_id,
      familyBookingStudentId: selected.publicId,
      sourceStudentNo: row.source_student_no,
      name: row.name,
      branch: row.branch,
      representativeClassName: row.class_name,
      mathClassName: row.math_class_name,
      scienceClassNames: row.science_class_names,
      schoolName: row.school_name,
      grade: row.grade,
      unitName: canonicalUnitName(row.class_name),
      primaryTeacher: primaryTeacher(row.primary_teacher),
      motherPhone: row.mother_phone_ciphertext === null ? null : this.phoneProtector.reveal(row.mother_phone_ciphertext),
      fatherPhone: row.father_phone_ciphertext === null ? null : this.phoneProtector.reveal(row.father_phone_ciphertext),
      guestContact: row.guest_contact_ciphertext === null ? null : this.phoneProtector.reveal(row.guest_contact_ciphertext),
      booking: this.bookingProjection(selected),
      latestOperationalEvent: latest === undefined ? null : {
        eventId: latest.event.eventId,
        type: latest.event.eventType,
        actorType: this.eventActorType(latest.event.eventType, latest.event.actorSubject),
        label: bookingOperationalEventLabel(latest.event.eventType as OperationalBookingEventType, latest.event.actorSubject),
        occurredAt: latest.event.occurredAt,
      },
      bookingHistory: sorted.map((link) => ({
        familyBookingId: link.familyBooking.publicId,
        status: link.familyBooking.status,
        current: link === selected,
        eventsPath: `/api/v1/admin/family-bookings/${link.familyBooking.publicId}/events`,
        createdAt: link.familyBooking.createdAt,
        cancelledAt: link.familyBooking.cancelledAt,
      })),
    };
  }

  private bookingProjection(link: Awaited<ReturnType<SessionRosterService["bookingLinks"]>>[number]) {
    return {
      familyBookingId: link.familyBooking.publicId,
      familyBookingStudentId: link.publicId,
      status: link.familyBooking.status,
      attendanceParty: link.familyBooking.attendanceParty,
      bookingSource: link.familyBooking.bookingSource,
      seatCount: link.familyBooking.seatCount,
      checkedInAt: link.familyBooking.checkedInAt,
      cancelledAt: link.familyBooking.cancelledAt,
      version: Number(link.familyBooking.version),
    };
  }

  private eventActorType(eventType: string, actorSubject: string | null): "ADMIN" | "SCANNER" | "PUBLIC_PROOF" | "SYSTEM" {
    if (actorSubject === null) return "PUBLIC_PROOF";
    if (eventType === "CHECKED_IN") return "SCANNER";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(actorSubject)
      ? "ADMIN"
      : "SYSTEM";
  }

  private reservationStatus(status: string): string {
    if (status === "CANCELLED") return "예약취소";
    if (status === "NO_SHOW") return "미참석";
    return "예약";
  }

  private checkInStatus(status: string): string {
    if (status === "CHECKED_IN") return "입장 완료";
    if (status === "RESERVED") return "미입장";
    if (status === "NO_SHOW") return "미참석";
    return "해당 없음";
  }

  private participantTypeLabel(participantType: "ENROLLED" | "GUEST"): string {
    return participantType === "ENROLLED" ? "재원생" : "비재원생";
  }

  private bookingSourceLabel(bookingSource: string): string {
    switch (bookingSource) {
      case "WEB_APP": return "웹앱";
      case "PHONE": return "전화";
      case "TEACHER": return "교사";
      case "ON_SITE": return "현장";
      default: this.fail(500, "SESSION_ROSTER_BOOKING_SOURCE_INVALID");
    }
  }

  private attendancePartyLabel(attendanceParty: string): string {
    switch (attendanceParty) {
      case "MOTHER": return "모";
      case "FATHER": return "부";
      case "BOTH": return "모/부";
      default: this.fail(500, "SESSION_ROSTER_ATTENDANCE_PARTY_INVALID");
    }
  }

  private formatSeoulDate(value: Date | null): string {
    if (value === null) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
  }

  private campusName(branch: string): string {
    switch (branch) {
      case "SONGPA": return "송파";
      case "WIRYE": return "위례";
      case "GWANGJIN": return "광진";
      default: this.fail(500, "SESSION_ROSTER_BRANCH_INVALID");
    }
  }

  private rowKey(row: RosterDatabaseRow): string {
    return row.student_internal_id === null
      ? `G:${row.roster_entry_id}`
      : `E:${row.student_internal_id.toString()}`;
  }

  private empty(page: number, pageSize: number) {
    return {
      items: [],
      page: { page, pageSize, totalItems: 0, totalPages: 0 },
      facets: { teachers: [], unmatchedUnitCount: 0 },
      monitoring: { studentCount: 0, familyBookingCount: 0, attendeeCount: 0 },
    };
  }

  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The session roster could not be loaded.");
  }
}
