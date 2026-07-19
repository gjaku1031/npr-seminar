import { Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { BookingCryptoService } from "../family-bookings/booking-crypto.service.js";
import type { AttendanceParty } from "../family-bookings/attendance.js";
import { SheetOutboxService } from "../google-sheets/sheet-outbox.service.js";
import { currentOrHistoricMathHomeroomTeacher } from "../student-sync/student-homeroom-policy.js";

type CheckInSource = "QR" | "MANUAL";
type CheckInResult = "CHECKED_IN" | "ALREADY_CHECKED_IN" | "CANCELLED" | "SESSION_MISMATCH"
  | "EXPIRED_QR" | "REVOKED_QR" | "INVALID_QR" | "RESERVATION_NOT_FOUND" | "NOT_AUTHORIZED";

interface ScannerContext {
  readonly id: bigint;
  readonly publicId: string;
  readonly branchCode: string;
  readonly gateCode: string;
  readonly sessionId: bigint;
  readonly sessionPublicId: string;
}

export interface CheckInOutcome {
  readonly eventId: string;
  readonly result: CheckInResult;
  readonly replayed: boolean;
  readonly familyBookingId: string | null;
  readonly familySeatCount: number | null;
  readonly attendanceParty: AttendanceParty | null;
  readonly representativeStudentName: string | null;
  readonly seminarSessionId: string;
  readonly deviceId: string;
  readonly branch: string;
  readonly gateCode: string;
  readonly occurredAt: Date;
  readonly representativeStudent: {
    readonly participantType: string;
    readonly sourceStudentNo: string;
    readonly studentName: string;
    readonly branch: string;
    readonly className: string;
    readonly schoolName: string | null;
    readonly grade: string | null;
    readonly unitName: string | null;
  } | null;
}

interface RepresentativeCandidate {
  readonly participantType: string;
  readonly sourceStudentNoSnapshot: string;
  readonly studentNameSnapshot: string;
  readonly branchCodeAtBooking: string;
  readonly classNameSnapshot: string;
  readonly schoolNameSnapshot: string | null;
  readonly gradeSnapshot: string | null;
  readonly unitNameSnapshot: string | null;
}

export function selectCheckInRepresentativeStudent(students: readonly RepresentativeCandidate[]) {
  const representative = [...students].sort((left, right) => {
    const byGrade = checkInGradeRank(right.gradeSnapshot, right.unitNameSnapshot, right.schoolNameSnapshot)
      - checkInGradeRank(left.gradeSnapshot, left.unitNameSnapshot, left.schoolNameSnapshot);
    if (byGrade !== 0) return byGrade;
    const byBranch = checkInBranchRank(left.branchCodeAtBooking) - checkInBranchRank(right.branchCodeAtBooking);
    if (byBranch !== 0) return byBranch;
    const byUnit = (left.unitNameSnapshot ?? "").localeCompare(right.unitNameSnapshot ?? "", "ko");
    if (byUnit !== 0) return byUnit;
    const byClass = left.classNameSnapshot.localeCompare(right.classNameSnapshot, "ko");
    if (byClass !== 0) return byClass;
    const byName = left.studentNameSnapshot.localeCompare(right.studentNameSnapshot, "ko");
    return byName !== 0 ? byName : left.sourceStudentNoSnapshot.localeCompare(right.sourceStudentNoSnapshot);
  })[0];
  if (representative === undefined) return null;
  return {
    participantType: representative.participantType,
    sourceStudentNo: representative.sourceStudentNoSnapshot,
    studentName: representative.studentNameSnapshot,
    branch: representative.branchCodeAtBooking,
    className: representative.classNameSnapshot,
    schoolName: representative.schoolNameSnapshot,
    grade: representative.gradeSnapshot,
    unitName: representative.unitNameSnapshot,
  };
}

function checkInGradeRank(grade: string | null, unitName: string | null, schoolName: string | null): number {
  const normalizedGrade = grade?.normalize("NFKC").replaceAll(" ", "") ?? "";
  const explicit = normalizedGrade.match(/([초중고])([1-6])/u);
  if (explicit !== null) return checkInSchoolLevelRank(explicit[1]!, Number(explicit[2]));
  const year = Number(normalizedGrade.match(/([1-6])학년/u)?.[1] ?? 0);
  const unitLevel = checkInUnitSchoolLevel(unitName);
  if (unitLevel !== null) return checkInSchoolLevelRank(unitLevel, year);
  const schoolLevel = checkInSchoolNameLevel(schoolName);
  if (schoolLevel !== null) return checkInSchoolLevelRank(schoolLevel, year);
  return year;
}

function checkInUnitSchoolLevel(unitName: string | null): "초" | "중" | "고" | null {
  const normalized = unitName?.normalize("NFKC").replaceAll(" ", "") ?? "";
  if (/^(?:고등|고[1-3]|예고|과고)/u.test(normalized)) return "고";
  if (/^(?:중등|중[1-3]|예중)/u.test(normalized)) return "중";
  if (/^(?:초등|초[1-6])/u.test(normalized)) return "초";
  return null;
}

function checkInSchoolNameLevel(schoolName: string | null): "초" | "중" | "고" | null {
  const normalized = schoolName?.normalize("NFKC").replaceAll(" ", "") ?? "";
  if (/(?:고등학교|고)$/u.test(normalized)) return "고";
  if (/(?:중학교|중)$/u.test(normalized)) return "중";
  if (/(?:초등학교|초)$/u.test(normalized)) return "초";
  return null;
}

function checkInSchoolLevelRank(level: string, year: number): number {
  const base = level === "고" ? 300 : level === "중" ? 200 : level === "초" ? 100 : 0;
  return base + year;
}

function checkInBranchRank(branch: string): number {
  return ({ SONGPA: 0, WIRYE: 1, GWANGJIN: 2 } as Record<string, number>)[branch] ?? 99;
}

@Injectable()
export class CheckInsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BookingCryptoService,
    private readonly sheetOutbox: SheetOutboxService,
  ) {}

  public async listEligibleSessions(actor: AuthenticatedActor) {
    const device = await this.device(actor);
    const sessions = await this.prisma.seminarSession.findMany({
      where: {
        status: "OPEN",
        OR: [{ scope: "ALL" }, { scope: "BRANCH", branchId: device.branchId }],
      },
      select: {
        publicId: true, scope: true, startsAt: true, endsAt: true, place: true,
        branch: { select: { code: true } }, seminar: { select: { publicId: true, title: true } },
        capacity: { select: { capacity: true, reservedCount: true } },
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    return {
      items: sessions.map((session) => ({
        seminarId: session.seminar.publicId,
        seminarSessionId: session.publicId,
        seminarTitle: session.seminar.title,
        scope: session.scope,
        branch: session.branch?.code ?? null,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        location: session.place,
        remainingCapacity: Math.max(0, (session.capacity?.capacity ?? 0) - (session.capacity?.reservedCount ?? 0)),
      })),
      currentSessionId: device.selectedSession?.publicId ?? null,
    };
  }

  public async manualCandidates(actor: AuthenticatedActor, phoneLast4: string) {
    if (!/^\d{4}$/.test(phoneLast4)) this.fail(400, "PHONE_LAST4_INVALID");
    const scanner = await this.context(actor);
    const bookings = await this.prisma.familyBooking.findMany({
      where: { sessionId: scanner.sessionId, contactLast4: phoneLast4, status: { in: ["RESERVED", "CHECKED_IN"] } },
      select: {
        publicId: true, contactLast4: true, attendanceParty: true, seatCount: true, status: true,
        students: {
          where: { active: true },
          select: {
            studentNameSnapshot: true, classNameSnapshot: true, schoolNameSnapshot: true,
            gradeSnapshot: true, branchCodeAtBooking: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    return {
      items: bookings.map((booking) => ({
        familyBookingId: booking.publicId,
        maskedContact: `***-****-${booking.contactLast4}`,
        attendanceParty: booking.attendanceParty,
        seatCount: booking.seatCount,
        status: booking.status,
        students: booking.students.map((student) => ({
          name: student.studentNameSnapshot,
          className: student.classNameSnapshot,
          schoolName: student.schoolNameSnapshot,
          grade: student.gradeSnapshot,
          branch: student.branchCodeAtBooking,
        })),
      })),
    };
  }

  public async byQr(actor: AuthenticatedActor, qrToken: string, idempotencyKey: string): Promise<CheckInOutcome> {
    if (qrToken.length < 43 || qrToken.length > 512 || !/^[A-Za-z0-9_-]+$/.test(qrToken)) {
      return this.perform(actor, "QR", null, null, idempotencyKey, "INVALID_QR");
    }
    return this.perform(actor, "QR", this.crypto.digest(qrToken), null, idempotencyKey);
  }

  public byManual(actor: AuthenticatedActor, familyBookingId: string, idempotencyKey: string): Promise<CheckInOutcome> {
    return this.perform(actor, "MANUAL", null, familyBookingId, idempotencyKey);
  }

  public async listEvents(filters: {
    familyBookingId?: string; sessionId?: string; deviceId?: string; result?: string;
    afterSequence?: string; limit?: number;
  }) {
    const after = filters.afterSequence === undefined ? 0n : BigInt(filters.afterSequence);
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const rows = await this.prisma.checkInEvent.findMany({
      where: {
        id: { gt: after },
        ...(filters.result === undefined ? {} : { result: filters.result }),
        ...(filters.familyBookingId === undefined ? {} : { familyBooking: { publicId: filters.familyBookingId } }),
        ...(filters.sessionId === undefined ? {} : { session: { publicId: filters.sessionId } }),
        ...(filters.deviceId === undefined ? {} : { scannerDevice: { publicId: filters.deviceId } }),
      },
      select: {
        id: true, eventId: true, source: true, result: true, seatCount: true, gateCode: true,
        actorSubject: true, safeMetadata: true, occurredAt: true,
        familyBooking: { select: { publicId: true } },
        session: { select: { publicId: true } },
        scannerDevice: { select: { publicId: true } },
      },
      orderBy: { id: "asc" }, take: limit + 1,
    });
    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map((row) => ({
        sequence: row.id.toString(), eventId: row.eventId, source: row.source, result: row.result,
        familyBookingId: row.familyBooking?.publicId ?? null, seminarSessionId: row.session.publicId,
        deviceId: row.scannerDevice?.publicId ?? null, seatCount: row.seatCount, gateCode: row.gateCode,
        actorSubject: row.actorSubject, safeMetadata: row.safeMetadata, occurredAt: row.occurredAt,
      })),
      page: { nextAfterSequence: hasMore ? rows[limit - 1]!.id.toString() : null, hasMore },
    };
  }

  private async perform(
    actor: AuthenticatedActor,
    source: CheckInSource,
    tokenDigest: Buffer | null,
    familyBookingId: string | null,
    idempotencyKey: string,
    forcedResult?: CheckInResult,
  ): Promise<CheckInOutcome> {
    if (idempotencyKey.trim().length < 8 || idempotencyKey.length > 200) this.fail(400, "IDEMPOTENCY_KEY_INVALID");
    const keyDigest = this.crypto.digest(idempotencyKey);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(${keyDigest.readBigInt64BE()})`;
      const scanner = await this.contextForUpdate(transaction, actor);
      const requestDigest = this.crypto.digest(this.crypto.stableJson({
        source,
        tokenDigest: tokenDigest?.toString("base64url") ?? null,
        familyBookingId,
        scannerSessionId: scanner.sessionPublicId,
        scannerDeviceId: scanner.publicId,
      }));
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_keyDigest: { scope: "SCANNER_CHECK_IN", keyDigest: this.bytes(keyDigest) } },
      });
      if (existing !== null) {
        if (!this.equal(existing.requestDigest, requestDigest)) this.fail(409, "IDEMPOTENCY_KEY_REUSED");
        return { ...(existing.responseBody as unknown as CheckInOutcome), replayed: true };
      }

      let booking: {
        id: bigint; public_id: string; session_id: bigint; status: string; seat_count: number;
        attendance_party: AttendanceParty; checked_in_at: Date | null;
      } | undefined;
      let credential: { id: bigint; status: string; expires_at: Date } | undefined;
      let located: { bookingId: bigint; sessionId: bigint; credentialId: bigint | null } | undefined;
      if (source === "QR" && tokenDigest !== null) {
        const matches = await transaction.$queryRaw<Array<{ credential_id: bigint; booking_id: bigint; session_id: bigint }>>`
            select q.id credential_id,fb.id booking_id,fb.session_id
              from qr_credentials q join family_bookings fb on fb.id=q.family_booking_id
             where q.token_digest=${this.bytes(tokenDigest)}`;
        const match = matches[0];
        if (match !== undefined) located = { bookingId: match.booking_id, sessionId: match.session_id, credentialId: match.credential_id };
      } else if (source === "MANUAL" && familyBookingId !== null) {
        const matches = await transaction.$queryRaw<Array<{ id: bigint; session_id: bigint }>>`
          select id,session_id from family_bookings where public_id=${familyBookingId}::uuid`;
        const match = matches[0];
        if (match !== undefined) located = { bookingId: match.id, sessionId: match.session_id, credentialId: null };
      }
      if (located !== undefined) {
        // Global domain lock order: scanner -> session capacity -> booking -> QR credential.
        await transaction.$executeRaw`select session_id from session_capacities where session_id=${located.sessionId} for update`;
        const bookings = await transaction.$queryRaw<Array<{
          id: bigint; public_id: string; session_id: bigint; status: string; seat_count: number;
          attendance_party: AttendanceParty; checked_in_at: Date | null;
        }>>`select id,public_id,session_id,status,seat_count,attendance_party,checked_in_at from family_bookings
             where id=${located.bookingId} for update`;
        booking = bookings[0];
        if (booking !== undefined && located.credentialId !== null && tokenDigest !== null) {
          const credentials = await transaction.$queryRaw<Array<{ id: bigint; status: string; expires_at: Date }>>`
            select id,status,expires_at from qr_credentials
             where id=${located.credentialId} and family_booking_id=${booking.id}
               and token_digest=${this.bytes(tokenDigest)} for update`;
          credential = credentials[0];
          if (credential === undefined) booking = undefined;
        }
      }

      let result = forcedResult ?? this.resultFor(source, scanner, booking, credential);
      if (result === "CHECKED_IN" && booking !== undefined) {
        const updated = await transaction.familyBooking.updateMany({
          where: { id: booking.id, status: "RESERVED", checkedInAt: null },
          data: { status: "CHECKED_IN", checkedInAt: new Date(), version: { increment: 1 }, updatedAt: new Date() },
        });
        if (updated.count !== 1) result = "ALREADY_CHECKED_IN";
        else {
          await transaction.sessionCapacity.update({
            where: { sessionId: scanner.sessionId },
            data: { checkedInCount: { increment: booking.seat_count }, version: { increment: 1 }, updatedAt: new Date() },
          });
          const bookingEvent = await transaction.bookingEvent.create({
            data: { familyBookingId: booking.id, eventType: "CHECKED_IN", actorSubject: actor.subject, safeMetadata: { source } },
          });
          const delivery = await transaction.familyBooking.findUniqueOrThrow({
            where: { id: booking.id },
            select: {
              publicId: true, contactCiphertext: true, contactDigest: true, contactLast4: true,
              version: true, createdAt: true, attendanceParty: true, bookingSource: true,
              session: { select: { publicId: true } },
              students: { where: { active: true }, orderBy: { id: "asc" }, select: {
                publicId: true, participantType: true, branchCodeAtBooking: true, sourceStudentNoSnapshot: true,
                studentNameSnapshot: true, unitNameSnapshot: true, teacherNameSnapshot: true,
                schoolNameSnapshot: true, gradeSnapshot: true, student: { select: {
                  publicId: true,
                  teacherName: true,
                  assignments: { select: { className: true, sourceActive: true } },
                } },
              } },
            },
          });
          await this.sheetOutbox.enqueueBookingEvent(transaction, {
            eventId: bookingEvent.eventId, eventType: "CHECKED_IN", occurredAt: bookingEvent.occurredAt,
            seminarSessionPublicId: delivery.session.publicId, familyBookingPublicId: delivery.publicId,
            bookingVersion: delivery.version, bookingCreatedAt: delivery.createdAt,
            attendanceParty: delivery.attendanceParty as "MOTHER" | "FATHER" | "BOTH",
            bookingSource: delivery.bookingSource as "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE",
            children: delivery.students.map((link) => ({
              familyBookingStudentPublicId: link.publicId, studentPublicId: link.student?.publicId ?? link.publicId,
              sourceStudentNo: link.sourceStudentNoSnapshot, studentName: link.studentNameSnapshot,
              branch: link.branchCodeAtBooking as "SONGPA" | "WIRYE" | "GWANGJIN",
              unitName: link.unitNameSnapshot,
              teacherName: link.participantType === "GUEST"
                ? null
                : currentOrHistoricMathHomeroomTeacher(link.student, link.teacherNameSnapshot),
              schoolName: link.schoolNameSnapshot, grade: link.gradeSnapshot, active: true,
            })),
          });
        }
      }
      const event = await transaction.checkInEvent.create({
        data: {
          familyBookingId: booking?.id ?? null,
          qrCredentialId: credential?.id ?? null,
          sessionId: scanner.sessionId,
          source,
          result,
          seatCount: booking?.seat_count ?? 0,
          scannerDeviceId: scanner.id,
          gateCode: scanner.gateCode,
          actorSubject: actor.subject,
          idempotencyKeyDigest: this.bytes(keyDigest),
          safeMetadata: {},
        },
      });
      const representativeStudent = booking === undefined
        ? null
        : await this.representativeStudent(transaction, booking.id);
      const outcome: CheckInOutcome = {
        eventId: event.eventId,
        result,
        replayed: false,
        familyBookingId: booking?.public_id ?? null,
        familySeatCount: booking?.seat_count ?? null,
        attendanceParty: booking?.attendance_party ?? null,
        representativeStudentName: representativeStudent?.studentName ?? null,
        seminarSessionId: scanner.sessionPublicId,
        deviceId: scanner.publicId,
        branch: scanner.branchCode,
        gateCode: scanner.gateCode,
        occurredAt: event.occurredAt,
        representativeStudent,
      };
      await transaction.idempotencyRecord.create({
        data: {
          scope: "SCANNER_CHECK_IN", keyDigest: this.bytes(keyDigest), requestDigest: this.bytes(requestDigest),
          resourcePublicId: booking?.public_id ?? null, responseStatus: 200,
          responseBody: outcome as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        },
      });
      return outcome;
    }, { isolationLevel: "ReadCommitted", timeout: 10_000, maxWait: 5_000 });
  }

  private resultFor(
    source: CheckInSource,
    scanner: ScannerContext,
    booking: { session_id: bigint; status: string; checked_in_at: Date | null } | undefined,
    credential: { status: string; expires_at: Date } | undefined,
  ): CheckInResult {
    if (booking === undefined) return source === "QR" ? "INVALID_QR" : "RESERVATION_NOT_FOUND";
    if (booking.session_id !== scanner.sessionId) return "SESSION_MISMATCH";
    if (booking.status === "CANCELLED") return "CANCELLED";
    if (credential?.status === "REVOKED") return "REVOKED_QR";
    if (credential !== undefined && (credential.status === "EXPIRED" || credential.expires_at <= new Date())) return "EXPIRED_QR";
    if (booking.status === "CHECKED_IN" || booking.checked_in_at !== null) return "ALREADY_CHECKED_IN";
    return "CHECKED_IN";
  }

  private async representativeStudent(transaction: Prisma.TransactionClient, familyBookingId: bigint) {
    const students = await transaction.familyBookingStudent.findMany({
      where: { familyBookingId, active: true },
      select: {
        participantType: true,
        sourceStudentNoSnapshot: true,
        studentNameSnapshot: true,
        branchCodeAtBooking: true,
        classNameSnapshot: true,
        schoolNameSnapshot: true,
        gradeSnapshot: true,
        unitNameSnapshot: true,
      },
    });
    return selectCheckInRepresentativeStudent(students);
  }

  private async context(actor: AuthenticatedActor): Promise<ScannerContext> {
    const device = await this.device(actor);
    if (device.selectedSession === null) this.fail(409, "SCANNER_SHIFT_REQUIRED");
    return {
      id: device.id,
      publicId: device.publicId,
      branchCode: device.branch.code,
      gateCode: device.gateCode,
      sessionId: device.selectedSession.id,
      sessionPublicId: device.selectedSession.publicId,
    };
  }

  private async contextForUpdate(transaction: Prisma.TransactionClient, actor: AuthenticatedActor): Promise<ScannerContext> {
    if (actor.role !== "SCANNER" || actor.scannerDeviceId === undefined) this.fail(403, "SCANNER_ROLE_REQUIRED");
    const rows = await transaction.$queryRaw<Array<{
      id: bigint; public_id: string; branch_code: string; gate_code: string;
      selected_session_id: bigint | null; session_public_id: string | null;
    }>>`select d.id,d.public_id,b.code branch_code,d.gate_code,d.selected_session_id,
               ss.public_id session_public_id
          from scanner_devices d join branches b on b.id=d.branch_id
          left join seminar_sessions ss on ss.id=d.selected_session_id
         where d.public_id=${actor.scannerDeviceId}::uuid and d.status='ACTIVE'
         for update of d`;
    const device = rows[0];
    if (device === undefined) this.fail(401, "SCANNER_DEVICE_REVOKED");
    if (device.selected_session_id === null || device.session_public_id === null) this.fail(409, "SCANNER_SHIFT_REQUIRED");
    return {
      id: device.id,
      publicId: device.public_id,
      branchCode: device.branch_code,
      gateCode: device.gate_code,
      sessionId: device.selected_session_id,
      sessionPublicId: device.session_public_id,
    };
  }

  private async device(actor: AuthenticatedActor) {
    if (actor.role !== "SCANNER" || actor.scannerDeviceId === undefined) this.fail(403, "SCANNER_ROLE_REQUIRED");
    const device = await this.prisma.scannerDevice.findFirst({
      where: { publicId: actor.scannerDeviceId, status: "ACTIVE" },
      select: {
        id: true, publicId: true, branchId: true, gateCode: true,
        branch: { select: { code: true } },
        selectedSession: { select: { id: true, publicId: true } },
      },
    });
    if (device === null) this.fail(401, "SCANNER_DEVICE_REVOKED");
    return device;
  }

  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }

  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The check-in operation could not be completed.");
  }
}
