import { Inject, Injectable } from "@nestjs/common";
import type { AppEnvironment } from "../../common/config/environment.js";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  bookingOperationalEventLabel,
  OPERATIONAL_BOOKING_EVENT_TYPES,
  type OperationalBookingEventType,
} from "../family-bookings/booking-operational-event.js";
import {
  isRepresentativeStudentClass,
  isScienceStudentClass,
  normalizeStudentClassName,
} from "../student-sync/student-classification.js";
import { currentOrHistoricMathHomeroomTeacher } from "../student-sync/student-homeroom-policy.js";
import {
  GoogleSheetsGateway,
  SHEET_SCHEMA_FINGERPRINT,
  SHEET_SCHEMA_VERSION,
  SHEET_WORKER_VALIDATION_INTERVAL_MS,
  sheetWorkbookExpectation,
  type SheetDispatchPlan,
  type SheetGatewayResult,
} from "./google-sheets.gateway.js";

/**
 * 매핑·대기열 lease를 함께 점유한 시트 작업과 반영에 필요한 식별자
 */
interface ClaimedSheet {
  /**
   * 대기열 행 ID
   */
  readonly id: bigint;

  /**
   * 시트 매핑 ID
   */
  readonly mapping_id: bigint;

  /**
   * 매핑 dispatch lease 소유 토큰. 대기열 행 lease_owner와 같은 값
   */
  readonly mapping_lease_owner: string;

  /**
   * 매핑 회차 공개 ID
   */
  readonly seminar_session_public_id: string;

  /**
   * 스프레드시트 ID
   */
  readonly spreadsheet_id: string;

  /**
   * 매핑 구조 지문
   */
  readonly schema_fingerprint: string;

  /**
   * 매핑 스키마 버전
   */
  readonly schema_version: number;

  /**
   * 예약명단 시트 제목
   */
  readonly reservation_sheet_title: string;

  /**
   * 예약명단 시트 ID
   */
  readonly reservation_sheet_id: number;

  /**
   * 예약 이벤트 ID
   */
  readonly event_id: string;

  /**
   * 예약 이벤트 종류
   */
  readonly event_type: string;

  /**
   * 가족 예약 공개 ID
   */
  readonly family_booking_public_id: string;

  /**
   * 예약 학생 공개 ID
   */
  readonly family_booking_student_public_id: string;

  /**
   * 이번 점유로 증가한 시도 횟수
   */
  readonly attempt_count: number;
}

/**
 * 반영 계획 계산에 필요한 예약 학생·가족 예약·학생 원장 조회 필드
 *
 * 가족 예약의 최신 운영 이벤트 1건 포함
 */
const projectionLinkSelect = {
  id: true,
  publicId: true,
  createdAt: true,
  active: true,
  participantType: true,
  studentId: true,
  branchCodeAtBooking: true,
  sourceStudentNoSnapshot: true,
  studentNameSnapshot: true,
  classNameSnapshot: true,
  schoolNameSnapshot: true,
  gradeSnapshot: true,
  teacherNameSnapshot: true,
  student: {
    select: {
      motherPhoneCiphertext: true,
      fatherPhoneCiphertext: true,
      teacherName: true,
      assignments: { select: { className: true, sourceActive: true } },
    },
  },
  familyBooking: {
    select: {
      id: true,
      publicId: true,
      status: true,
      attendanceParty: true,
      seatCount: true,
      bookingSource: true,
      contactDigest: true,
      contactCiphertext: true,
      createdAt: true,
      checkedInAt: true,
      session: { select: { publicId: true } },
      students: {
        orderBy: [{ id: "asc" as const }],
        select: {
          publicId: true,
          active: true,
          releasedAt: true,
          branchCodeAtBooking: true,
          sourceStudentNoSnapshot: true,
          studentNameSnapshot: true,
        },
      },
      bookingEvents: {
        where: { eventType: { in: [...OPERATIONAL_BOOKING_EVENT_TYPES] } },
        orderBy: [{ occurredAt: "desc" as const }, { id: "desc" as const }],
        take: 1,
        select: { eventType: true, actorSubject: true, occurredAt: true },
      },
    },
  },
} satisfies Prisma.FamilyBookingStudentSelect;

/**
 * projectionLinkSelect 조회 결과 타입
 */
type ProjectionLink = Prisma.FamilyBookingStudentGetPayload<{ select: typeof projectionLinkSelect }>;

/**
 * 참석 보호자
 */
export type SheetAttendanceParty = "MOTHER" | "FATHER" | "BOTH";

/**
 * 시트가 표현하는 예약 상태
 */
export type SheetProjectionStatus = "RESERVED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";

/**
 * 대표 수학·과학 반 열 값
 *
 * 원천 활성 수업에서 대표 반만 골라 정렬하고 과학반과 나머지(수학반)로 나눔
 * 활성 반이 없을 때만 예약 당시 반 사용
 *
 * @param historicClassName 학생 원장이 없을 때 쓰는 예약 당시 반. 없으면 null
 * @returns 쉼표로 연결한 수학반·과학반 목록
 */
export function sheetStudentClassColumns(
  assignments: readonly { readonly className: string; readonly sourceActive: boolean }[],
  historicClassName: string | null,
): { readonly mathClassNames: string; readonly scienceClassNames: string } {
  const activeClasses = [...new Set(assignments
    .filter((assignment) => assignment.sourceActive)
    .map((assignment) => normalizeStudentClassName(assignment.className))
    .filter((className) => className !== "" && isRepresentativeStudentClass(className)))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const fallback = historicClassName === null ? "" : normalizeStudentClassName(historicClassName);
  const classes = activeClasses.length > 0
    ? activeClasses
    : fallback !== "" && isRepresentativeStudentClass(fallback) ? [fallback] : [];
  return {
    mathClassNames: classes.filter((className) => !isScienceStudentClass(className)).join(", "),
    scienceClassNames: classes.filter((className) => isScienceStudentClass(className)).join(", "),
  };
}

/**
 * 예약 상태를 시트가 표현하는 네 상태로 제한
 *
 * @throws {Error} SHEET_BOOKING_STATUS_INVALID 알 수 없는 상태
 */
export function sheetProjectionStatus(value: string): SheetProjectionStatus {
  if (["RESERVED", "CHECKED_IN", "CANCELLED", "NO_SHOW"].includes(value)) {
    return value as SheetProjectionStatus;
  }
  throw new Error("SHEET_BOOKING_STATUS_INVALID");
}

/**
 * 가족 예약 상태. 다른 회차로 옮긴 예약은 기존 회차 시트에서 취소로 표현
 */
export function sheetFamilyProjectionStatus(
  familySessionPublicId: string,
  workbookSessionPublicId: string,
  status: string,
): SheetProjectionStatus {
  return familySessionPublicId === workbookSessionPublicId
    ? sheetProjectionStatus(status)
    : "CANCELLED";
}

/**
 * 비재원생의 검증된 연락처 하나를 참석 보호자 열에 배치
 *
 * BOTH도 모 연락처 열만 채움
 */
export function guestContactColumns(
  attendanceParty: SheetAttendanceParty,
  contact: string,
): { readonly mother: string; readonly father: string } {
  switch (attendanceParty) {
    case "MOTHER": return { mother: contact, father: "" };
    case "FATHER": return { mother: "", father: contact };
    // BOTH 비재원생은 검증된 연락처가 하나뿐이라 의도적으로 모 열에만 기록
    case "BOTH": return { mother: contact, father: "" };
  }
}

/**
 * 예약 상태 표시 문구. `상태 (보호자) · N명`
 */
export function sheetReservationState(
  status: SheetProjectionStatus,
  party: SheetAttendanceParty,
): string {
  const partyLabel = party === "MOTHER" ? "모" : party === "FATHER" ? "부" : "모/부";
  const personCount = party === "BOTH" ? 2 : 1;
  const statusLabel = status === "CHECKED_IN" ? "입장 완료"
    : status === "CANCELLED" ? "예약취소"
      : status === "NO_SHOW" ? "미참석"
        : "예약";
  return `${statusLabel} (${partyLabel}) · ${personCount}명`;
}

/**
 * 예약 당시 지점 코드를 캠퍼스 이름으로 변환
 *
 * @throws {Error} SHEET_BRANCH_CODE_INVALID 미지원 코드
 */
export function sheetCampus(branchCodeAtBooking: string | null): "A" | "B" | "C" {
  switch (branchCodeAtBooking) {
    case "CAMPUS_A": return "A";
    case "CAMPUS_B": return "B";
    case "CAMPUS_C": return "C";
    default: throw new Error("SHEET_BRANCH_CODE_INVALID");
  }
}

/**
 * 시트 반영 워커
 *
 * 예약 이벤트 대기열을 현재 DB 상태로 다시 투영해 Google Sheets에 반영하고 시도 결과 기록
 * 매핑당 동시에 한 작업만 처리하고 매핑별 1초 간격 유지
 */
@Injectable()
export class SheetWorkerService {
  /**
   * 다음 매핑 재검증 시각(epoch 밀리초)
   */
  private nextMappingValidationAt = 0;

  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 워커 DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 연락처 복호화
     */
    private readonly protector: PhoneProtector,

    /**
     * Google Sheets 게이트웨이
     */
    private readonly gateway: GoogleSheetsGateway,

    /**
     * 실행 환경. 시트 사용 여부
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * 한 번의 반복 처리
   *
   * 주기가 됐으면 매핑 재검증, 만료 lease 복구 후 작업 최대 1건 처리
   * 계획 계산 실패는 DEAD, 게이트웨이 예외는 RETRY로 기록
   *
   * @returns 성공 여부가 아니라 점유한 작업 수(0 또는 1)
   */
  public async runOnce(): Promise<number> {
    await this.refreshActiveMappingsIfDue();
    await this.reconcileExpiredLease();
    const row = await this.claim();
    if (row === undefined) return 0;
    let result: SheetGatewayResult;
    let plan: SheetDispatchPlan;
    try {
      plan = await this.plan(row);
    } catch {
      await this.finish(row, { kind: "DEAD", errorCode: "SHEET_PROJECTION_INVALID" });
      return 1;
    }
    try {
      result = await this.gateway.apply(plan);
    } catch {
      result = { kind: "RETRY", errorCode: "SHEETS_ADAPTER_FAILURE" };
    }
    await this.finish(row, result);
    return 1;
  }

  /**
   * 작업 1건 점유
   *
   * 활성·회로 CLOSED·스키마 일치·lease 없음·직전 반영 후 1초 경과·처리할 행이 있는 매핑을 SKIP LOCKED로 잠그고
   * 그 매핑의 가장 이른 PENDING·RETRY 행과 함께 120초 lease 부여, 시도 횟수 증가
   *
   * @returns 점유한 작업. 없으면 undefined
   */
  private async claim(): Promise<ClaimedSheet | undefined> {
    const rows = await this.prisma.$queryRaw<ClaimedSheet[]>`
      with mapping_candidate as (
        select m.id from sheet_mappings m
         where m.enabled and m.circuit_status='CLOSED'
           and m.schema_version=${SHEET_SCHEMA_VERSION}
           and m.schema_fingerprint=${SHEET_SCHEMA_FINGERPRINT}
           and (m.dispatch_lease_expires_at is null or m.dispatch_lease_expires_at < now())
           and (m.last_dispatch_at is null or m.last_dispatch_at <= now()-interval '1 second')
           and exists (
             select 1 from sheet_outbox o where o.mapping_id=m.id
               and o.status in ('PENDING','RETRY') and o.next_attempt_at <= now()
           )
         order by m.id for update of m skip locked limit 1
      ), leased as (
        update sheet_mappings m
           set dispatch_lease_owner=gen_random_uuid(),dispatch_lease_expires_at=now()+interval '120 seconds',updated_at=now()
          from mapping_candidate c where m.id=c.id
        returning m.id,m.dispatch_lease_owner,m.seminar_session_public_id,m.spreadsheet_id,
                  m.schema_fingerprint,m.schema_version,m.reservation_sheet_title,m.reservation_sheet_id
      ), job as (
        select o.id,o.event_id,o.event_type,l.dispatch_lease_owner,l.seminar_session_public_id,l.spreadsheet_id,
               l.schema_fingerprint,l.schema_version,l.reservation_sheet_title,l.reservation_sheet_id
          from sheet_outbox o join leased l on l.id=o.mapping_id
         where o.status in ('PENDING','RETRY') and o.next_attempt_at <= now()
         order by o.next_attempt_at,o.id for update of o skip locked limit 1
      )
      update sheet_outbox o
         set status='CLAIMED',lease_owner=j.dispatch_lease_owner,lease_expires_at=now()+interval '120 seconds',
             attempt_count=o.attempt_count+1,updated_at=now()
        from job j where o.id=j.id
      returning o.id,o.mapping_id,j.dispatch_lease_owner mapping_lease_owner,
                j.seminar_session_public_id,j.spreadsheet_id,j.schema_fingerprint,j.schema_version,
                j.reservation_sheet_title,j.reservation_sheet_id,
                j.event_id,j.event_type,
                o.family_booking_public_id,o.family_booking_student_public_id,o.attempt_count`;
    return rows[0];
  }

  /**
   * 만료 lease 복구
   *
   * 만료된 CLAIMED는 외부 반영 여부를 단정할 수 없어 재조정 필요 RETRY로 옮기고 시도 기록 추가
   * 만료된 매핑 dispatch lease 해제
   */
  private async reconcileExpiredLease(): Promise<void> {
    await this.prisma.$executeRaw`
      with expired as (
        update sheet_outbox
           set status='RETRY',lease_owner=null,lease_expires_at=null,next_attempt_at=now(),
               last_error_code='SHEETS_RECONCILE_REQUIRED',updated_at=now()
         where status='CLAIMED' and lease_expires_at < now()
        returning id,attempt_count
      )
      insert into sheet_attempts(sheet_outbox_id,attempt_no,result,error_code,safe_metadata)
      select id,attempt_count,'RETRY','SHEETS_RECONCILE_REQUIRED','{}'::jsonb from expired
      on conflict(sheet_outbox_id,attempt_no) do nothing`;
    await this.prisma.sheetMapping.updateMany({
      where: { dispatchLeaseExpiresAt: { lt: new Date() } },
      data: { dispatchLeaseOwner: null, dispatchLeaseExpiresAt: null },
    });
  }

  /**
   * 작업 1건의 예약명단·예약집계·로그 반영 계획 생성
   *
   * 대기열 스냅샷 대신 현재 예약·학생·이벤트를 다시 읽어 최신 상태 기준으로 투영
   * DB 원천이 없거나 상태가 유효하지 않으면 예외. runOnce가 DEAD로 기록
   * 복호화한 연락처는 계획의 셀 값에만 담고 로그에 남기지 않음
   *
   * 1. 같은 회차의 같은 학생(비재원생은 연락처·이름) 후보 중 현재 예약 행 선택
   * 2. 반영할 예약 이벤트가 같은 예약·종류인지 확인
   * 3. 학생 행·가족 행·이벤트 행 값 계산
   */
  private async plan(row: ClaimedSheet): Promise<SheetDispatchPlan> {
    const source = await this.prisma.familyBookingStudent.findUnique({
      where: { publicId: row.family_booking_student_public_id },
      select: projectionLinkSelect,
    });
    if (source === null || source.familyBooking.publicId !== row.family_booking_public_id) {
      throw new Error("SHEET_PROJECTION_SOURCE_MISSING");
    }
    const identityCandidates = await this.identityCandidates(source, row.seminar_session_public_id);
    const candidates = identityCandidates.length === 0 ? [source] : identityCandidates;
    const selected = this.selectCurrentProjection(candidates);
    // 예약명단 행의 멱등 키는 현재 선택된 예약 학생 ID
    // 학번은 표시용이며 기존 행을 찾거나 대체하는 데 쓰지 않음
    const marker = selected.publicId;
    const latestEvent = selected.familyBooking.bookingEvents[0];
    if (latestEvent === undefined) throw new Error("SHEET_PROJECTION_EVENT_MISSING");
    const projectedEvent = await this.prisma.bookingEvent.findUnique({
      where: { eventId: row.event_id },
      select: {
        eventId: true,
        eventType: true,
        actorSubject: true,
        occurredAt: true,
        familyBooking: { select: { publicId: true } },
      },
    });
    if (projectedEvent === null
      || projectedEvent.familyBooking.publicId !== row.family_booking_public_id
      || projectedEvent.eventType !== row.event_type
      || !OPERATIONAL_BOOKING_EVENT_TYPES.includes(projectedEvent.eventType as OperationalBookingEventType)) {
      throw new Error("SHEET_PROJECTION_EVENT_SOURCE_MISSING");
    }

    // 학생 행 상태: 회차가 바뀌었거나 해제된 학생은 취소로 표현
    const belongsToWorkbook = selected.familyBooking.session.publicId === row.seminar_session_public_id
      && selected.active;
    const effectiveStatus = belongsToWorkbook
      ? sheetProjectionStatus(selected.familyBooking.status)
      : "CANCELLED";
    const phones = this.projectionPhones(selected);
    const classColumns = selected.participantType === "GUEST"
      ? { mathClassNames: "", scienceClassNames: "" }
      : sheetStudentClassColumns(
        selected.student?.assignments ?? [],
        selected.student === null ? selected.classNameSnapshot : null,
      );
    const eventLabel = bookingOperationalEventLabel(
      latestEvent.eventType as OperationalBookingEventType,
      latestEvent.actorSubject,
    );
    const eventProjectionLabel = bookingOperationalEventLabel(
      projectedEvent.eventType as OperationalBookingEventType,
      projectedEvent.actorSubject,
    );
    // 가족 행: 좌석 수 검증, 활성 학생(없으면 마지막 해제 학생)을 지점·이름·학번 순 정렬
    const family = source.familyBooking;
    const familyStatus = sheetFamilyProjectionStatus(
      family.session.publicId,
      row.seminar_session_public_id,
      family.status,
    );
    const party = family.attendanceParty as SheetAttendanceParty;
    if (family.seatCount !== (party === "BOTH" ? 2 : 1)) throw new Error("SHEET_SEAT_COUNT_INVALID");
    const familyChildren = family.students.some((child) => child.active)
      ? family.students.filter((child) => child.active)
      : this.latestReleasedChildren(family.students);
    const children = [...familyChildren].sort((left, right) => {
      const branchOrder = this.branchOrder(left.branchCodeAtBooking) - this.branchOrder(right.branchCodeAtBooking);
      return branchOrder || left.studentNameSnapshot.localeCompare(right.studentNameSnapshot, "ko-KR")
        || left.sourceStudentNoSnapshot.localeCompare(right.sourceStudentNoSnapshot, "ko-KR");
    });
    const campuses = [...new Set(children.map((child) => sheetCampus(child.branchCodeAtBooking)))].join("/");
    const activeBooking = familyStatus === "RESERVED" || familyStatus === "CHECKED_IN";
    const checkedIn = familyStatus === "CHECKED_IN";
    const eventCounts = this.eventPersonCounts(projectedEvent.eventType, family.seatCount);
    const familyLatestEvent = family.bookingEvents[0];
    if (familyLatestEvent === undefined) throw new Error("SHEET_FAMILY_PROJECTION_EVENT_MISSING");
    const familyLatestLabel = bookingOperationalEventLabel(
      familyLatestEvent.eventType as OperationalBookingEventType,
      familyLatestEvent.actorSubject,
    );

    // 학생 행·가족 행·이벤트 행 계획 조립. 문자열 셀은 수식 해석 방지 처리
    return {
      workbook: sheetWorkbookExpectation({
        spreadsheetId: row.spreadsheet_id,
        schemaFingerprint: row.schema_fingerprint,
        schemaVersion: row.schema_version,
        reservationSheetTitle: row.reservation_sheet_title,
        reservationSheetId: row.reservation_sheet_id,
      }),
      valueInputMode: "RAW",
      hiddenMarkerColumn: "AD",
      sourceStudentNoDisplayColumn: "B",
      rowIdentity: "FAMILY_BOOKING_STUDENT_ID_ONLY",
      postVerify: true,
      row: {
        bookingCreatedAt: this.kst(selected.familyBooking.createdAt),
        sourceStudentNo: this.safe(selected.sourceStudentNoSnapshot),
        campus: sheetCampus(selected.branchCodeAtBooking),
        studentName: this.safe(selected.studentNameSnapshot),
        mathClassNames: this.safe(classColumns.mathClassNames),
        scienceClassNames: this.safe(classColumns.scienceClassNames),
        schoolName: this.safe(selected.schoolNameSnapshot ?? ""),
        grade: this.safe(selected.gradeSnapshot ?? ""),
        primaryTeacher: this.safe((selected.participantType === "GUEST"
          ? null
          : currentOrHistoricMathHomeroomTeacher(selected.student, selected.teacherNameSnapshot)) ?? ""),
        motherPhone: this.safe(phones.mother),
        fatherPhone: this.safe(phones.father),
        reservationState: sheetReservationState(
          effectiveStatus,
          selected.familyBooking.attendanceParty as SheetAttendanceParty,
        ),
        latestOperationalLog: `${eventLabel} ${this.kst(latestEvent.occurredAt)}`,
        marker,
      },
      family: {
        bookingCreatedAt: this.kst(family.createdAt),
        familyBookingId: family.publicId,
        campuses: this.safe(campuses),
        studentNames: this.safe(children.map((child) => child.studentNameSnapshot).join(", ")),
        attendanceParty: this.attendancePartyLabel(party),
        activeBookingCount: activeBooking ? 1 : 0,
        activeReservationPersonCount: activeBooking ? family.seatCount : 0,
        checkedInBookingCount: checkedIn ? 1 : 0,
        checkedInPersonCount: checkedIn ? family.seatCount : 0,
        reservationState: sheetReservationState(familyStatus, party),
        bookingSource: this.bookingSourceLabel(family.bookingSource),
        checkedInAt: family.checkedInAt === null ? "" : this.kst(family.checkedInAt),
        latestOperationalLog: `${familyLatestLabel} ${this.kst(familyLatestEvent.occurredAt)}`,
        marker: family.publicId,
      },
      event: {
        occurredAt: this.kst(projectedEvent.occurredAt),
        eventLabel: eventProjectionLabel,
        familyBookingId: family.publicId,
        campuses: this.safe(campuses),
        studentCount: children.length,
        studentNames: this.safe(children.map((child) => child.studentNameSnapshot).join(", ")),
        attendanceParty: this.attendancePartyLabel(party),
        activeReservationPersonCount: eventCounts.reservationPeople,
        checkedInPersonCount: eventCounts.checkedInPeople,
        reservationState: this.eventReservationState(projectedEvent.eventType, party),
        bookingSource: this.bookingSourceLabel(family.bookingSource),
        actor: this.eventActor(projectedEvent.eventType, projectedEvent.actorSubject),
        operationalLog: `${eventProjectionLabel} ${this.kst(projectedEvent.occurredAt)}`,
        marker: projectedEvent.eventId,
      },
    };
  }

  /**
   * 같은 회차의 현재 행 후보
   *
   * 재원생은 학생 원장 ID, 비재원생은 지점·연락처 다이제스트·정규화 이름이 같은 예약 학생
   *
   * @throws {Error} 재원생 원장 누락·참여 유형 오류
   */
  private async identityCandidates(source: ProjectionLink, sessionPublicId: string): Promise<ProjectionLink[]> {
    if (source.participantType === "ENROLLED") {
      if (source.studentId === null) throw new Error("SHEET_ENROLLED_STUDENT_MISSING");
      return this.prisma.familyBookingStudent.findMany({
        where: {
          studentId: source.studentId,
          participantType: "ENROLLED",
          session: { publicId: sessionPublicId },
        },
        select: projectionLinkSelect,
      });
    }
    if (source.participantType !== "GUEST") throw new Error("SHEET_PARTICIPANT_TYPE_INVALID");
    const possible = await this.prisma.familyBookingStudent.findMany({
      where: {
        participantType: "GUEST",
        branchCodeAtBooking: source.branchCodeAtBooking,
        session: { publicId: sessionPublicId },
        familyBooking: { contactDigest: source.familyBooking.contactDigest },
      },
      select: projectionLinkSelect,
    });
    const sourceName = this.identityText(source.studentNameSnapshot);
    return possible.filter((candidate) => this.identityText(candidate.studentNameSnapshot) === sourceName);
  }

  /**
   * 후보 중 현재 반영할 행 선택
   *
   * 활성·미취소 예약 우선, 이후 예약 생성 시각·예약 ID·행 ID 내림차순
   *
   * @throws {Error} SHEET_PROJECTION_CANDIDATE_MISSING 후보 없음
   */
  private selectCurrentProjection(candidates: readonly ProjectionLink[]): ProjectionLink {
    const sorted = [...candidates].sort((left, right) => {
      const leftCurrent = left.active && left.familyBooking.status !== "CANCELLED" ? 1 : 0;
      const rightCurrent = right.active && right.familyBooking.status !== "CANCELLED" ? 1 : 0;
      return rightCurrent - leftCurrent
        || right.familyBooking.createdAt.getTime() - left.familyBooking.createdAt.getTime()
        || (right.familyBooking.id > left.familyBooking.id ? 1 : right.familyBooking.id < left.familyBooking.id ? -1 : 0)
        || (right.id > left.id ? 1 : right.id < left.id ? -1 : 0);
    });
    const selected = sorted[0];
    if (selected === undefined) throw new Error("SHEET_PROJECTION_CANDIDATE_MISSING");
    return selected;
  }

  /**
   * 시트에 쓸 모·부 연락처를 메모리에서만 복호화
   *
   * 재원생은 원장의 모·부 번호, 비재원생은 예약 연락처를 참석 보호자 열에 배치
   */
  private projectionPhones(link: ProjectionLink): { readonly mother: string; readonly father: string } {
    if (link.participantType === "ENROLLED") {
      return {
        mother: this.revealOptional(link.student?.motherPhoneCiphertext ?? null),
        father: this.revealOptional(link.student?.fatherPhoneCiphertext ?? null),
      };
    }
    const contact = this.formatPhone(this.protector.reveal(link.familyBooking.contactCiphertext));
    return guestContactColumns(link.familyBooking.attendanceParty as SheetAttendanceParty, contact);
  }

  /**
   * 선택 연락처 복호화와 표시 형식. 없으면 빈 문자열
   */
  private revealOptional(ciphertext: Uint8Array | null): string {
    return ciphertext === null ? "" : this.formatPhone(this.protector.reveal(ciphertext));
  }

  /**
   * 참석 보호자 표시 문구
   */
  private attendancePartyLabel(party: SheetAttendanceParty): "모" | "부" | "모/부" {
    return party === "MOTHER" ? "모" : party === "FATHER" ? "부" : "모/부";
  }

  /**
   * 예약 경로 표시 문구
   *
   * @throws {Error} SHEET_BOOKING_SOURCE_INVALID 알 수 없는 경로
   */
  private bookingSourceLabel(source: string): "웹앱" | "전화" | "선생님" | "현장" {
    switch (source) {
      case "WEB_APP": return "웹앱";
      case "PHONE": return "전화";
      case "TEACHER": return "선생님";
      case "ON_SITE": return "현장";
      default: throw new Error("SHEET_BOOKING_SOURCE_INVALID");
    }
  }

  /**
   * 이벤트 시점 예약·입장 인원
   *
   * 입장은 둘 다 좌석 수, 생성·변경은 예약 인원만, 취소·미참석은 0
   */
  private eventPersonCounts(eventType: string, seatCount: number): {
    readonly reservationPeople: number;
    readonly checkedInPeople: number;
  } {
    if (eventType === "CHECKED_IN") return { reservationPeople: seatCount, checkedInPeople: seatCount };
    if (eventType === "CREATED" || eventType === "UPDATED") {
      return { reservationPeople: seatCount, checkedInPeople: 0 };
    }
    return { reservationPeople: 0, checkedInPeople: 0 };
  }

  /**
   * 이벤트 종류별 예약 상태 표시 문구
   */
  private eventReservationState(eventType: string, party: SheetAttendanceParty): string {
    if (eventType === "CHECKED_IN") return sheetReservationState("CHECKED_IN", party);
    if (eventType === "CANCELLED") return sheetReservationState("CANCELLED", party);
    if (eventType === "MARKED_NO_SHOW") return sheetReservationState("NO_SHOW", party);
    return sheetReservationState("RESERVED", party);
  }

  /**
   * 이벤트 처리자 표시
   *
   * 입장은 QR 스캐너, 주체 없음은 웹앱, UUID 주체는 관리자, 그 외는 시스템
   */
  private eventActor(eventType: string, actorSubject: string | null): "웹앱" | "관리자" | "QR 스캐너" | "시스템" {
    if (eventType === "CHECKED_IN") return "QR 스캐너";
    if (actorSubject === null) return "웹앱";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(actorSubject)) {
      return "관리자";
    }
    return "시스템";
  }

  /**
   * 지점 정렬 순서. A·B·C
   *
   * @throws {Error} SHEET_BRANCH_CODE_INVALID 미지원 코드
   */
  private branchOrder(value: string): number {
    switch (value) {
      case "CAMPUS_A": return 0;
      case "CAMPUS_B": return 1;
      case "CAMPUS_C": return 2;
      default: throw new Error("SHEET_BRANCH_CODE_INVALID");
    }
  }

  /**
   * 마지막 해제 시각에 해제된 학생들
   */
  private latestReleasedChildren<T extends { readonly releasedAt: Date | null }>(children: readonly T[]): T[] {
    const latest = Math.max(...children.map((child) => child.releasedAt?.getTime() ?? -1));
    return children.filter((child) => (child.releasedAt?.getTime() ?? -1) === latest);
  }

  /**
   * 검증 주기가 지났을 때 활성 매핑 재검증
   *
   * 1. 스키마 버전·지문이 현재 코드와 다른 활성 매핑 차단
   * 2. 시트 사용이 꺼져 있으면 활성 매핑 전체 차단
   * 3. 남은 매핑의 외부 공유·구조 검증. 성공은 검증 시각 갱신, BLOCKED·DEAD는 차단, RETRY는 그대로 둠
   */
  private async refreshActiveMappingsIfDue(): Promise<void> {
    const now = Date.now();
    if (now < this.nextMappingValidationAt) return;
    this.nextMappingValidationAt = now + SHEET_WORKER_VALIDATION_INTERVAL_MS;
    await this.prisma.sheetMapping.updateMany({
      where: {
        enabled: true,
        OR: [
          { schemaVersion: { not: SHEET_SCHEMA_VERSION } },
          { schemaFingerprint: { not: SHEET_SCHEMA_FINGERPRINT } },
        ],
      },
      data: {
        enabled: false,
        circuitStatus: "BLOCKED",
        blockReasonCode: "GOOGLE_SHEETS_SCHEMA_FINGERPRINT_MISMATCH",
        dispatchLeaseOwner: null,
        dispatchLeaseExpiresAt: null,
      },
    });
    const mappings = await this.prisma.sheetMapping.findMany({
      where: {
        enabled: true,
        circuitStatus: "CLOSED",
        schemaVersion: SHEET_SCHEMA_VERSION,
        schemaFingerprint: SHEET_SCHEMA_FINGERPRINT,
      },
    });
    if (mappings.length === 0) return;
    if (!this.environment.googleSheetsEnabled) {
      await this.prisma.sheetMapping.updateMany({
        where: { id: { in: mappings.map((mapping) => mapping.id) }, enabled: true, circuitStatus: "CLOSED" },
        data: {
          enabled: false,
          circuitStatus: "BLOCKED",
          blockReasonCode: "GOOGLE_SHEETS_DISABLED",
          dispatchLeaseOwner: null,
          dispatchLeaseExpiresAt: null,
        },
      });
      return;
    }
    for (const mapping of mappings) {
      const result = await this.gateway.validate(sheetWorkbookExpectation(mapping));
      if (result.kind === "SUCCEEDED") {
        await this.prisma.sheetMapping.updateMany({
          where: { id: mapping.id, enabled: true, circuitStatus: "CLOSED" },
          data: { lastValidatedAt: new Date() },
        });
      } else if (result.kind === "BLOCKED" || result.kind === "DEAD") {
        await this.prisma.sheetMapping.updateMany({
          where: { id: mapping.id },
          data: {
            enabled: false,
            circuitStatus: "BLOCKED",
            blockReasonCode: result.errorCode,
            dispatchLeaseOwner: null,
            dispatchLeaseExpiresAt: null,
          },
        });
      }
    }
  }

  /**
   * 작업 결과 확정
   *
   * 현재 lease 소유자일 때만 결과·시도 기록·매핑 lease 해제를 한 트랜잭션으로 커밋
   * GoogleSheetsGateway.apply는 이 커밋 전에 끝남
   * RETRY는 지수 지연(5초×2^시도+0~4초 지터, 최대 300초), 총 8회 도달 시 DEAD
   * 차단 결과의 openCircuit 표식이 있으면 매핑 비활성화
   */
  private async finish(row: ClaimedSheet, result: SheetGatewayResult): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.sheetOutbox.findFirst({ where: { id: row.id, status: "CLAIMED", leaseOwner: row.mapping_lease_owner }, select: { id: true } });
      if (current === null) return;
      const exhausted = result.kind === "RETRY" && row.attempt_count >= 8;
      const status = exhausted ? "DEAD" : result.kind;
      const errorCode = exhausted ? "SHEETS_RETRY_EXHAUSTED" : result.kind === "SUCCEEDED" ? null : result.errorCode;
      await transaction.sheetAttempt.create({
        data: { sheetOutboxId: row.id, attemptNo: row.attempt_count, result: status, errorCode, safeMetadata: {} },
      });
      await transaction.sheetOutbox.update({
        where: { id: row.id },
        data: {
          status, leaseOwner: null, leaseExpiresAt: null, lastErrorCode: errorCode,
          ...(status === "SUCCEEDED" ? { completedAt: new Date() } : {}),
          ...(status === "RETRY" ? { nextAttemptAt: new Date(Date.now() + Math.min(300, 2 ** row.attempt_count * 5 + Math.floor(Math.random() * 5)) * 1_000) } : {}),
        },
      });
      await transaction.sheetMapping.updateMany({
        where: { id: row.mapping_id, dispatchLeaseOwner: row.mapping_lease_owner },
        data: {
          dispatchLeaseOwner: null, dispatchLeaseExpiresAt: null, lastDispatchAt: new Date(),
          ...(result.kind === "BLOCKED" && result.openCircuit ? { enabled: false, circuitStatus: "BLOCKED", blockReasonCode: result.errorCode } : {}),
        },
      });
    });
  }

  /**
   * 비재원생 이름 비교용 정규화. NFKC·공백 제거·소문자
   */
  private identityText(value: string): string {
    return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  }

  /**
   * 시트 셀 값 정규화
   *
   * `= + - @`로 시작하면 수식으로 해석되지 않도록 앞에 작은따옴표를 붙임
   */
  private safe(value: string): string {
    const normalized = value.normalize("NFKC");
    return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  }

  /**
   * 전화번호 표시 형식. 10·11자리는 하이픈 구분, 그 외는 그대로
   */
  private formatPhone(digits: string): string {
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return digits;
  }

  /**
   * 서울 시간 `YYYY-MM-DD HH:mm:ss` 표기
   */
  private kst(date: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
  }
}
