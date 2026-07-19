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
}

interface StatisticsRow {
  readonly unit_group: StatisticsUnitGroup;
  readonly eligible_student_count: bigint;
  readonly reserved_booking_count: bigint;
  readonly checked_in_booking_count: bigint;
  readonly active_booking_count: bigint;
  readonly summary_eligible_student_count: bigint;
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
  readonly manual_reserved_booking_count: bigint;
  readonly manual_checked_in_booking_count: bigint;
  readonly manual_active_booking_count: bigint;
  readonly manual_cancelled_booking_count: bigint;
  readonly manual_no_show_booking_count: bigint;
  readonly survey_average_rating: number | null;
  readonly survey_response_count: bigint;
}

const EMPTY_OPERATIONS_SUMMARY: OperationsSummaryRow = {
  active_booking_count: 0n,
  checked_in_booking_count: 0n,
  unchecked_booking_count: 0n,
  cancelled_booking_count: 0n,
  no_show_booking_count: 0n,
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
             count(*) filter (where status='NO_SHOW')::bigint no_show_booking_count
        from family_bookings
       where session_id=${session.id}`);
    const row = rows[0] ?? EMPTY_OPERATIONS_SUMMARY;
    return {
      activeBookingCount: Number(row.active_booking_count),
      checkedInBookingCount: Number(row.checked_in_booking_count),
      uncheckedBookingCount: Number(row.unchecked_booking_count),
      cancelledBookingCount: Number(row.cancelled_booking_count),
      noShowBookingCount: Number(row.no_show_booking_count),
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
      eligible_unit_membership as (
        select id,'ALL'::text unit_group from eligible_students
        union all
        select id,
               case
                 when unit_name='초등' then 'ELEMENTARY'
                 when unit_name='중등1' then 'MIDDLE_1'
                 when unit_name='중등2' then 'MIDDLE_2'
                 when unit_name='중등3' then 'MIDDLE_3'
                 when unit_name in ('특목','예중1','예고1') then 'SPECIAL_PURPOSE'
                 when unit_name='고등' then 'HIGH'
                 when unit_name='과학' then 'SCIENCE'
                 else null
               end unit_group
          from eligible_students
      ),
      population as (
        select unit_group,count(distinct id)::bigint eligible_student_count
          from eligible_unit_membership
         where unit_group is not null
         group by unit_group
      ),
      scoped_bookings as (
        select fb.id,fb.status,fb.booking_source
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
        select booking.id,booking.status,'ALL'::text unit_group
          from scoped_bookings booking
        union all
        select distinct booking.id,booking.status,
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
      survey_statistics as (
        select avg(rating)::double precision survey_average_rating,
               count(*)::bigint survey_response_count
          from survey_responses
         where session_id=${session.id}
      )
      select groups.unit_group,
             coalesce(population.eligible_student_count,0)::bigint eligible_student_count,
             coalesce(units.reserved_booking_count,0)::bigint reserved_booking_count,
             coalesce(units.checked_in_booking_count,0)::bigint checked_in_booking_count,
             coalesce(units.active_booking_count,0)::bigint active_booking_count,
             (select count(*)::bigint from eligible_students) summary_eligible_student_count,
             summary.reserved_booking_count summary_reserved_booking_count,
             summary.checked_in_booking_count summary_checked_in_booking_count,
             summary.active_booking_count summary_active_booking_count,
             summary.cancelled_booking_count summary_cancelled_booking_count,
             summary.no_show_booking_count summary_no_show_booking_count,
             channels.*,
             survey.survey_average_rating,survey.survey_response_count
        from unit_groups groups
        left join population on population.unit_group=groups.unit_group
        left join unit_statistics units on units.unit_group=groups.unit_group
        cross join booking_summary summary
        cross join channel_statistics channels
        cross join survey_statistics survey
       order by groups.sort_order`);

    const first = rows[0];
    if (first === undefined) this.fail(500, "SESSION_STATISTICS_UNAVAILABLE");
    return {
      branch,
      summary: {
        eligibleCurrentStudentCount: Number(first.summary_eligible_student_count),
        activeBookingCount: Number(first.summary_active_booking_count),
        reservedBookingCount: Number(first.summary_reserved_booking_count),
        checkedInBookingCount: Number(first.summary_checked_in_booking_count),
        cancelledBookingCount: Number(first.summary_cancelled_booking_count),
        noShowBookingCount: Number(first.summary_no_show_booking_count),
      },
      units: rows.map((row) => ({
        unitGroup: row.unit_group,
        eligibleStudentCount: Number(row.eligible_student_count),
        activeBookingCount: Number(row.active_booking_count),
        reservedBookingCount: Number(row.reserved_booking_count),
        checkedInBookingCount: Number(row.checked_in_booking_count),
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
        },
        {
          channel: "MANUAL" as const,
          bookingSources: ["PHONE", "TEACHER", "ON_SITE"] as const,
          activeBookingCount: Number(first.manual_active_booking_count),
          reservedBookingCount: Number(first.manual_reserved_booking_count),
          checkedInBookingCount: Number(first.manual_checked_in_booking_count),
          cancelledBookingCount: Number(first.manual_cancelled_booking_count),
          noShowBookingCount: Number(first.manual_no_show_booking_count),
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
