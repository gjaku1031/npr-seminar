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

interface ClaimedSheet {
  readonly id: bigint;
  readonly mapping_id: bigint;
  readonly mapping_lease_owner: string;
  readonly seminar_session_public_id: string;
  readonly spreadsheet_id: string;
  readonly schema_fingerprint: string;
  readonly schema_version: number;
  readonly reservation_sheet_title: string;
  readonly reservation_sheet_id: number;
  readonly event_id: string;
  readonly event_type: string;
  readonly family_booking_public_id: string;
  readonly family_booking_student_public_id: string;
  readonly attempt_count: number;
}

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

type ProjectionLink = Prisma.FamilyBookingStudentGetPayload<{ select: typeof projectionLinkSelect }>;
export type SheetAttendanceParty = "MOTHER" | "FATHER" | "BOTH";
export type SheetProjectionStatus = "RESERVED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";

export function sheetProjectionStatus(value: string): SheetProjectionStatus {
  if (["RESERVED", "CHECKED_IN", "CANCELLED", "NO_SHOW"].includes(value)) {
    return value as SheetProjectionStatus;
  }
  throw new Error("SHEET_BOOKING_STATUS_INVALID");
}

export function sheetFamilyProjectionStatus(
  familySessionPublicId: string,
  workbookSessionPublicId: string,
  status: string,
): SheetProjectionStatus {
  return familySessionPublicId === workbookSessionPublicId
    ? sheetProjectionStatus(status)
    : "CANCELLED";
}

export function guestContactColumns(
  attendanceParty: SheetAttendanceParty,
  contact: string,
): { readonly mother: string; readonly father: string } {
  switch (attendanceParty) {
    case "MOTHER": return { mother: contact, father: "" };
    case "FATHER": return { mother: "", father: contact };
    // A BOTH guest has one verified contact, so it is intentionally written to the mother column only.
    case "BOTH": return { mother: contact, father: "" };
  }
}

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

export function sheetCampus(branchCodeAtBooking: string | null): "A" | "B" | "C" {
  switch (branchCodeAtBooking) {
    case "CAMPUS_A": return "A";
    case "CAMPUS_B": return "B";
    case "CAMPUS_C": return "C";
    default: throw new Error("SHEET_BRANCH_CODE_INVALID");
  }
}

@Injectable()
export class SheetWorkerService {
  private nextMappingValidationAt = 0;

  public constructor(
    private readonly prisma: PrismaService,
    private readonly protector: PhoneProtector,
    private readonly gateway: GoogleSheetsGateway,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

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
    // The V4 student-row idempotency key is the currently selected
    // familyBookingStudentId. The gateway's source-student fallback updates the
    // existing single row when a cancelled family rebooks, then replaces this
    // marker with the new authoritative link ID.
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

    const belongsToWorkbook = selected.familyBooking.session.publicId === row.seminar_session_public_id
      && selected.active;
    const effectiveStatus = belongsToWorkbook
      ? sheetProjectionStatus(selected.familyBooking.status)
      : "CANCELLED";
    const phones = this.projectionPhones(selected);
    const eventLabel = bookingOperationalEventLabel(
      latestEvent.eventType as OperationalBookingEventType,
      latestEvent.actorSubject,
    );
    const eventProjectionLabel = bookingOperationalEventLabel(
      projectedEvent.eventType as OperationalBookingEventType,
      projectedEvent.actorSubject,
    );
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
      studentKeyColumn: "B",
      postVerify: true,
      row: {
        bookingCreatedAt: this.kst(selected.familyBooking.createdAt),
        sourceStudentNo: this.safe(selected.sourceStudentNoSnapshot),
        campus: sheetCampus(selected.branchCodeAtBooking),
        studentName: this.safe(selected.studentNameSnapshot),
        className: this.safe(selected.classNameSnapshot),
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

  private revealOptional(ciphertext: Uint8Array | null): string {
    return ciphertext === null ? "" : this.formatPhone(this.protector.reveal(ciphertext));
  }

  private attendancePartyLabel(party: SheetAttendanceParty): "모" | "부" | "모/부" {
    return party === "MOTHER" ? "모" : party === "FATHER" ? "부" : "모/부";
  }

  private bookingSourceLabel(source: string): "웹앱" | "전화" | "선생님" | "현장" {
    switch (source) {
      case "WEB_APP": return "웹앱";
      case "PHONE": return "전화";
      case "TEACHER": return "선생님";
      case "ON_SITE": return "현장";
      default: throw new Error("SHEET_BOOKING_SOURCE_INVALID");
    }
  }

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

  private eventReservationState(eventType: string, party: SheetAttendanceParty): string {
    if (eventType === "CHECKED_IN") return sheetReservationState("CHECKED_IN", party);
    if (eventType === "CANCELLED") return sheetReservationState("CANCELLED", party);
    if (eventType === "MARKED_NO_SHOW") return sheetReservationState("NO_SHOW", party);
    return sheetReservationState("RESERVED", party);
  }

  private eventActor(eventType: string, actorSubject: string | null): "웹앱" | "관리자" | "QR 스캐너" | "시스템" {
    if (eventType === "CHECKED_IN") return "QR 스캐너";
    if (actorSubject === null) return "웹앱";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(actorSubject)) {
      return "관리자";
    }
    return "시스템";
  }

  private branchOrder(value: string): number {
    switch (value) {
      case "CAMPUS_A": return 0;
      case "CAMPUS_B": return 1;
      case "CAMPUS_C": return 2;
      default: throw new Error("SHEET_BRANCH_CODE_INVALID");
    }
  }

  private latestReleasedChildren<T extends { readonly releasedAt: Date | null }>(children: readonly T[]): T[] {
    const latest = Math.max(...children.map((child) => child.releasedAt?.getTime() ?? -1));
    return children.filter((child) => (child.releasedAt?.getTime() ?? -1) === latest);
  }

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

  private identityText(value: string): string {
    return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  }

  private safe(value: string): string {
    const normalized = value.normalize("NFKC");
    return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  }

  private formatPhone(digits: string): string {
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return digits;
  }

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
