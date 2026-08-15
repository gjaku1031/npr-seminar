import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";

type StatisticsUnitGroup =
  | "ALL"
  | "ELEMENTARY"
  | "MIDDLE_1"
  | "MIDDLE_2"
  | "MIDDLE_3"
  | "SPECIAL_PURPOSE"
  | "HIGH"
  | "SCIENCE";

interface OperationsSummaryRow {
  readonly active_booking_count: bigint;
  readonly checked_in_booking_count: bigint;
  readonly unchecked_booking_count: bigint;
  readonly cancelled_booking_count: bigint;
  readonly no_show_booking_count: bigint;
  readonly attendee_count: bigint;
}

interface StatisticsRow {
  readonly unit_group: StatisticsUnitGroup;
  readonly reserved_booking_count: bigint;
  readonly checked_in_booking_count: bigint;
  readonly active_booking_count: bigint;
  readonly linked_student_count: bigint;
  readonly family_booking_count: bigint;
  readonly attendee_count: bigint;
  readonly summary_linked_student_count: bigint;
  readonly summary_family_booking_count: bigint;
  readonly summary_attendee_count: bigint;
  readonly summary_reserved_booking_count: bigint;
  readonly summary_checked_in_booking_count: bigint;
  readonly summary_active_booking_count: bigint;
  readonly summary_cancelled_booking_count: bigint;
  readonly summary_no_show_booking_count: bigint;
  readonly mobile_reserved_booking_count: bigint;
  readonly mobile_checked_in_booking_count: bigint;
  readonly mobile_active_booking_count: bigint;
  readonly mobile_cancelled_booking_count: bigint;
  readonly mobile_no_show_booking_count: bigint;
  readonly mobile_linked_student_count: bigint;
  readonly mobile_family_booking_count: bigint;
  readonly mobile_attendee_count: bigint;
  readonly manual_reserved_booking_count: bigint;
  readonly manual_checked_in_booking_count: bigint;
  readonly manual_active_booking_count: bigint;
  readonly manual_cancelled_booking_count: bigint;
  readonly manual_no_show_booking_count: bigint;
  readonly manual_linked_student_count: bigint;
  readonly manual_family_booking_count: bigint;
  readonly manual_attendee_count: bigint;
  readonly survey_average_rating: number | null;
  readonly survey_response_count: bigint;
}

const EMPTY_OPERATIONS_SUMMARY: OperationsSummaryRow = {
  active_booking_count: 0n,
  checked_in_booking_count: 0n,
  unchecked_booking_count: 0n,
  cancelled_booking_count: 0n,
  no_show_booking_count: 0n,
  attendee_count: 0n,
};

@Injectable()
export class SessionStatisticsService {
  public constructor(private readonly prisma: PrismaService) {}

  public async operationsSummary(sessionPublicId: string) {
    const session = await this.session(sessionPublicId);
    const rows = await this.prisma.$queryRaw<OperationsSummaryRow[]>(Prisma.sql`
      select count(*) filter (where status in ('RESERVED','CHECKED_IN'))::bigint active_booking_count,
             count(*) filter (where status='CHECKED_IN')::bigint checked_in_booking_count,
             count(*) filter (where status='RESERVED')::bigint unchecked_booking_count,
             count(*) filter (where status='CANCELLED')::bigint cancelled_booking_count,
             count(*) filter (where status='NO_SHOW')::bigint no_show_booking_count,
             coalesce(sum(case when status in ('RESERVED','CHECKED_IN')
               then case attendance_party when 'BOTH' then 2 else 1 end else 0 end),0)::bigint attendee_count
        from family_bookings
       where session_id=${session.id}`);
    const row = rows[0] ?? EMPTY_OPERATIONS_SUMMARY;
    return {
      activeBookingCount: Number(row.active_booking_count),
      checkedInBookingCount: Number(row.checked_in_booking_count),
      uncheckedBookingCount: Number(row.unchecked_booking_count),
      cancelledBookingCount: Number(row.cancelled_booking_count),
      noShowBookingCount: Number(row.no_show_booking_count),
      attendeeCount: Number(row.attendee_count),
    };
  }

  public async statistics(sessionPublicId: string, requestedBranch?: string) {
    const session = await this.session(sessionPublicId);
    const sessionBranch = session.scope === "BRANCH" ? session.branch?.code ?? null : null;
    if (session.scope === "BRANCH" && sessionBranch === null) this.fail(409, "SESSION_BRANCH_MISSING");
    const scopeMatches = sessionBranch === null || requestedBranch === undefined || requestedBranch === sessionBranch;
    const branch = sessionBranch ?? requestedBranch ?? null;
    const rows = await this.prisma.$queryRaw<StatisticsRow[]>(Prisma.sql`
      with unit_groups(unit_group,sort_order) as (values
        ('ALL'::text,0),('ELEMENTARY',1),('MIDDLE_1',2),('MIDDLE_2',3),('MIDDLE_3',4),
        ('SPECIAL_PURPOSE',5),('HIGH',6),('SCIENCE',7)
      ),
      eligible_students as (
        select s.id,
               case
                 when cardinality(classes.math_class_names)>0
                   then npr_canonical_unit_name(classes.math_class_names[1])
                 when cardinality(classes.science_class_names)>0 then '과학'
                 else null
               end unit_name
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
          ) classes on true
         where s.source_active
           and ${scopeMatches}
           and (${branch}::text is null or b.code=${branch})
           and cardinality(classes.math_class_names)+cardinality(classes.science_class_names)>0
      ),
      scoped_bookings as (
        select fb.id,fb.status,fb.booking_source,fb.attendance_party,
               fb.contact_digest,fb.created_at
          from family_bookings fb
         where fb.session_id=${session.id}
           and ${scopeMatches}
           and (${branch}::text is null or exists (
             select 1 from family_booking_students scoped_child
              where scoped_child.family_booking_id=fb.id
                and scoped_child.session_id=fb.session_id
                and scoped_child.branch_code_at_booking=${branch}
           ))
      ),
      booking_units as (
        select booking.id,booking.status,booking.attendance_party,'ALL'::text unit_group
          from scoped_bookings booking
        union all
        select distinct booking.id,booking.status,booking.attendance_party,
               case
                 when student.unit_name='초등' then 'ELEMENTARY'
                 when student.unit_name='중등1' then 'MIDDLE_1'
                 when student.unit_name='중등2' then 'MIDDLE_2'
                 when student.unit_name='중등3' then 'MIDDLE_3'
                 when student.unit_name in ('특목','예중1','예고1') then 'SPECIAL_PURPOSE'
                 when student.unit_name='고등' then 'HIGH'
                 when student.unit_name='과학' then 'SCIENCE'
                 else null
               end unit_group
          from scoped_bookings booking
          join family_booking_students child
            on child.family_booking_id=booking.id and child.session_id=${session.id}
          join eligible_students student on student.id=child.student_id
         where child.participant_type='ENROLLED'
      ),
      monitoring_candidates as (
        select 'E:'||child.student_id::text identity_key,booking.id family_booking_id,
               booking.status,booking.attendance_party,booking.booking_source,
               case
                 when npr_canonical_unit_name(student.class_name)='초등' then 'ELEMENTARY'
                 when npr_canonical_unit_name(student.class_name)='중등1' then 'MIDDLE_1'
                 when npr_canonical_unit_name(student.class_name)='중등2' then 'MIDDLE_2'
                 when npr_canonical_unit_name(student.class_name)='중등3' then 'MIDDLE_3'
                 when npr_canonical_unit_name(student.class_name) in ('특목','예중1','예고1') then 'SPECIAL_PURPOSE'
                 when npr_canonical_unit_name(student.class_name)='고등' then 'HIGH'
                 when npr_canonical_unit_name(student.class_name)='과학' then 'SCIENCE'
                 else null
               end unit_group,
               row_number() over (
                 partition by child.student_id
                 order by case when booking.status in ('RESERVED','CHECKED_IN') then 0 else 1 end,
                          booking.created_at desc,child.id desc
               ) selection_rank
          from scoped_bookings booking
          join family_booking_students child
            on child.family_booking_id=booking.id and child.session_id=${session.id}
          join students student on student.id=child.student_id
         where child.participant_type='ENROLLED'
           and (${branch}::text is null or child.branch_code_at_booking=${branch})
        union all
        select 'G:'||encode(booking.contact_digest,'hex')||':'||
               lower(btrim(normalize(child.student_name_snapshot,NFKC)))||':'||
               child.branch_code_at_booking identity_key,
               booking.id family_booking_id,booking.status,booking.attendance_party,
               booking.booking_source,null::text unit_group,
               row_number() over (
                 partition by booking.contact_digest,
                              lower(btrim(normalize(child.student_name_snapshot,NFKC))),
                              child.branch_code_at_booking
                 order by case when booking.status in ('RESERVED','CHECKED_IN') then 0 else 1 end,
                          booking.created_at desc,child.id desc
               ) selection_rank
          from scoped_bookings booking
          join family_booking_students child
            on child.family_booking_id=booking.id and child.session_id=${session.id}
         where child.participant_type='GUEST'
           and (${branch}::text is null or child.branch_code_at_booking=${branch})
      ),
      monitoring_roster as (
        select identity_key,family_booking_id,status,attendance_party,booking_source,unit_group
          from monitoring_candidates
         where selection_rank=1 and status in ('RESERVED','CHECKED_IN')
      ),
      monitoring_unit_rows as (
        select identity_key,family_booking_id,status,attendance_party,'ALL'::text unit_group
          from monitoring_roster
        union all
        select identity_key,family_booking_id,status,attendance_party,unit_group
          from monitoring_roster
         where unit_group is not null
      ),
      monitoring_unit_students as (
        select unit_group,count(distinct identity_key)::bigint linked_student_count
          from monitoring_unit_rows
         group by unit_group
      ),
      monitoring_unit_families as (
        select unit_group,count(*)::bigint family_booking_count,
               coalesce(sum(case when status in ('RESERVED','CHECKED_IN')
                 then case attendance_party when 'BOTH' then 2 else 1 end else 0 end),0)::bigint attendee_count
          from (
            select distinct unit_group,family_booking_id,status,attendance_party
              from monitoring_unit_rows
          ) families
         group by unit_group
      ),
      unit_statistics as (
        select unit_group,
               count(distinct id) filter (where status='RESERVED')::bigint reserved_booking_count,
               count(distinct id) filter (where status='CHECKED_IN')::bigint checked_in_booking_count,
               count(distinct id) filter (where status in ('RESERVED','CHECKED_IN'))::bigint active_booking_count
          from booking_units
         where unit_group is not null
         group by unit_group
      ),
      booking_summary as (
        select count(*) filter (where status='RESERVED')::bigint reserved_booking_count,
               count(*) filter (where status='CHECKED_IN')::bigint checked_in_booking_count,
               count(*) filter (where status in ('RESERVED','CHECKED_IN'))::bigint active_booking_count,
               count(*) filter (where status='CANCELLED')::bigint cancelled_booking_count,
               count(*) filter (where status='NO_SHOW')::bigint no_show_booking_count
          from scoped_bookings
      ),
      channel_statistics as (
        select count(*) filter (where booking_source='WEB_APP' and status='RESERVED')::bigint mobile_reserved_booking_count,
               count(*) filter (where booking_source='WEB_APP' and status='CHECKED_IN')::bigint mobile_checked_in_booking_count,
               count(*) filter (where booking_source='WEB_APP' and status in ('RESERVED','CHECKED_IN'))::bigint mobile_active_booking_count,
               count(*) filter (where booking_source='WEB_APP' and status='CANCELLED')::bigint mobile_cancelled_booking_count,
               count(*) filter (where booking_source='WEB_APP' and status='NO_SHOW')::bigint mobile_no_show_booking_count,
               count(*) filter (where booking_source in ('PHONE','TEACHER','ON_SITE') and status='RESERVED')::bigint manual_reserved_booking_count,
               count(*) filter (where booking_source in ('PHONE','TEACHER','ON_SITE') and status='CHECKED_IN')::bigint manual_checked_in_booking_count,
               count(*) filter (where booking_source in ('PHONE','TEACHER','ON_SITE') and status in ('RESERVED','CHECKED_IN'))::bigint manual_active_booking_count,
               count(*) filter (where booking_source in ('PHONE','TEACHER','ON_SITE') and status='CANCELLED')::bigint manual_cancelled_booking_count,
               count(*) filter (where booking_source in ('PHONE','TEACHER','ON_SITE') and status='NO_SHOW')::bigint manual_no_show_booking_count
          from scoped_bookings
      ),
      monitoring_channel_statistics as (
        select count(distinct identity_key) filter (where booking_source='WEB_APP')::bigint mobile_linked_student_count,
               count(distinct identity_key) filter (where booking_source in ('PHONE','TEACHER','ON_SITE'))::bigint manual_linked_student_count
          from monitoring_roster
      ),
      monitoring_channel_families as (
        select count(*) filter (where booking_source='WEB_APP')::bigint mobile_family_booking_count,
               coalesce(sum(case when booking_source='WEB_APP' and status in ('RESERVED','CHECKED_IN')
                 then case attendance_party when 'BOTH' then 2 else 1 end else 0 end),0)::bigint mobile_attendee_count,
               count(*) filter (where booking_source in ('PHONE','TEACHER','ON_SITE'))::bigint manual_family_booking_count,
               coalesce(sum(case when booking_source in ('PHONE','TEACHER','ON_SITE') and status in ('RESERVED','CHECKED_IN')
                 then case attendance_party when 'BOTH' then 2 else 1 end else 0 end),0)::bigint manual_attendee_count
          from (
            select distinct family_booking_id,status,attendance_party,booking_source
              from monitoring_roster
          ) families
      ),
      survey_statistics as (
        select avg(rating)::double precision survey_average_rating,
               count(*)::bigint survey_response_count
          from survey_responses
         where session_id=${session.id}
      )
      select groups.unit_group,
             coalesce(units.reserved_booking_count,0)::bigint reserved_booking_count,
             coalesce(units.checked_in_booking_count,0)::bigint checked_in_booking_count,
             coalesce(units.active_booking_count,0)::bigint active_booking_count,
             coalesce(monitoring_students.linked_student_count,0)::bigint linked_student_count,
             coalesce(monitoring_families.family_booking_count,0)::bigint family_booking_count,
             coalesce(monitoring_families.attendee_count,0)::bigint attendee_count,
             coalesce(all_monitoring_students.linked_student_count,0)::bigint summary_linked_student_count,
             coalesce(all_monitoring_families.family_booking_count,0)::bigint summary_family_booking_count,
             coalesce(all_monitoring_families.attendee_count,0)::bigint summary_attendee_count,
             summary.reserved_booking_count summary_reserved_booking_count,
             summary.checked_in_booking_count summary_checked_in_booking_count,
             summary.active_booking_count summary_active_booking_count,
             summary.cancelled_booking_count summary_cancelled_booking_count,
             summary.no_show_booking_count summary_no_show_booking_count,
             channels.*,
             monitoring_channels.*,
             monitoring_channel_families.*,
             survey.survey_average_rating,survey.survey_response_count
        from unit_groups groups
        left join unit_statistics units on units.unit_group=groups.unit_group
        left join monitoring_unit_students monitoring_students on monitoring_students.unit_group=groups.unit_group
        left join monitoring_unit_families monitoring_families on monitoring_families.unit_group=groups.unit_group
        left join monitoring_unit_students all_monitoring_students on all_monitoring_students.unit_group='ALL'
        left join monitoring_unit_families all_monitoring_families on all_monitoring_families.unit_group='ALL'
        cross join booking_summary summary
        cross join channel_statistics channels
        cross join monitoring_channel_statistics monitoring_channels
        cross join monitoring_channel_families
        cross join survey_statistics survey
       order by groups.sort_order`);

    const first = rows[0];
    if (first === undefined) this.fail(500, "SESSION_STATISTICS_UNAVAILABLE");
    return {
      branch,
      summary: {
        activeBookingCount: Number(first.summary_active_booking_count),
        reservedBookingCount: Number(first.summary_reserved_booking_count),
        checkedInBookingCount: Number(first.summary_checked_in_booking_count),
        cancelledBookingCount: Number(first.summary_cancelled_booking_count),
        noShowBookingCount: Number(first.summary_no_show_booking_count),
        monitoring: {
          studentCount: Number(first.summary_linked_student_count),
          familyBookingCount: Number(first.summary_family_booking_count),
          attendeeCount: Number(first.summary_attendee_count),
        },
      },
      units: rows.map((row) => ({
        unitGroup: row.unit_group,
        activeBookingCount: Number(row.active_booking_count),
        reservedBookingCount: Number(row.reserved_booking_count),
        checkedInBookingCount: Number(row.checked_in_booking_count),
        monitoring: {
          studentCount: Number(row.linked_student_count),
          familyBookingCount: Number(row.family_booking_count),
          attendeeCount: Number(row.attendee_count),
        },
      })),
      channels: [
        {
          channel: "MOBILE" as const,
          bookingSources: ["WEB_APP"] as const,
          activeBookingCount: Number(first.mobile_active_booking_count),
          reservedBookingCount: Number(first.mobile_reserved_booking_count),
          checkedInBookingCount: Number(first.mobile_checked_in_booking_count),
          cancelledBookingCount: Number(first.mobile_cancelled_booking_count),
          noShowBookingCount: Number(first.mobile_no_show_booking_count),
          monitoring: {
            studentCount: Number(first.mobile_linked_student_count),
            familyBookingCount: Number(first.mobile_family_booking_count),
            attendeeCount: Number(first.mobile_attendee_count),
          },
        },
        {
          channel: "MANUAL" as const,
          bookingSources: ["PHONE", "TEACHER", "ON_SITE"] as const,
          activeBookingCount: Number(first.manual_active_booking_count),
          reservedBookingCount: Number(first.manual_reserved_booking_count),
          checkedInBookingCount: Number(first.manual_checked_in_booking_count),
          cancelledBookingCount: Number(first.manual_cancelled_booking_count),
          noShowBookingCount: Number(first.manual_no_show_booking_count),
          monitoring: {
            studentCount: Number(first.manual_linked_student_count),
            familyBookingCount: Number(first.manual_family_booking_count),
            attendeeCount: Number(first.manual_attendee_count),
          },
        },
      ],
      survey: {
        averageRating: first.survey_average_rating,
        responseCount: Number(first.survey_response_count),
        scope: "SESSION" as const,
      },
    };
  }

  private async session(publicId: string) {
    const session = await this.prisma.seminarSession.findUnique({
      where: { publicId },
      select: { id: true, scope: true, branch: { select: { code: true } } },
    });
    if (session === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
    return session;
  }

  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The session statistics could not be loaded.");
  }
}
