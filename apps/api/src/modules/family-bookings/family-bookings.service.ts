import { Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { DomainError } from "../../common/errors/domain-error.js";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";
import { type AttendanceParty, seatCountFor } from "./attendance.js";
import { BookingCryptoService } from "./booking-crypto.service.js";
import { OtpProofPort } from "./otp-proof.port.js";
import { SmsOutboxService, type SmsBranch } from "../sms/sms-outbox.service.js";
import type { AppEnvironment } from "../../common/config/environment.js";
import { SheetOutboxService } from "../google-sheets/sheet-outbox.service.js";
import { currentStudentMathHomeroomTeacher } from "../student-sync/student-homeroom-policy.js";
import { QrTokenProtector } from "./qr-token-protector.service.js";

export const GUEST_GRADES = ["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"] as const;
export type GuestGrade = typeof GUEST_GRADES[number];

export interface CreateFamilyBookingRequest {
  readonly sessionId: string;
  readonly bookingProof?: string;
  readonly contact?: string;
  readonly attendanceParty: AttendanceParty;
  readonly participantType: "ENROLLED" | "GUEST";
  readonly studentIds?: readonly string[];
  readonly guest?: {
    readonly name: string;
    readonly branch: SmsBranch;
    readonly schoolName: string;
    readonly grade: string;
  };
  readonly adminOverride?: { readonly actorSubject: string; readonly reason: string; readonly bookingSource: "PHONE" | "TEACHER" | "ON_SITE" };
}

export interface FamilyBookingResult {
  readonly familyBookingId: string;
  readonly sessionId: string;
  readonly attendanceParty: AttendanceParty;
  readonly seatCount: number;
  readonly status: string;
  readonly studentIds: readonly string[];
  readonly qrToken: string | null;
  readonly qrExpiresAt: Date | null;
  readonly replayed: boolean;
}

@Injectable()
export class FamilyBookingsService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly phoneProtector: PhoneProtector,
    private readonly crypto: BookingCryptoService,
    private readonly qrTokenProtector: QrTokenProtector,
    private readonly otpProof: OtpProofPort,
    private readonly smsOutbox: SmsOutboxService,
    private readonly sheetOutbox: SheetOutboxService,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  public async create(request: CreateFamilyBookingRequest, idempotencyKey: string): Promise<FamilyBookingResult> {
    const submittedStudentIds = [...new Set(request.studentIds ?? [])].sort();
    if (request.participantType === "ENROLLED") {
      if (submittedStudentIds.length > 10) this.fail(400, "STUDENT_SELECTION_INVALID");
      if (submittedStudentIds.length !== (request.studentIds?.length ?? 0) || request.guest !== undefined) this.fail(400, "PARTICIPANT_INPUT_INVALID");
    } else if (submittedStudentIds.length !== 0 || request.guest === undefined) {
      this.fail(400, "PARTICIPANT_INPUT_INVALID");
    }
    const submittedGuest = request.guest === undefined ? null : {
      name: request.guest.name.normalize("NFKC").trim(),
      branch: request.guest.branch,
      schoolName: request.guest.schoolName.normalize("NFKC").trim(),
      grade: request.guest.grade.normalize("NFKC").trim(),
    };
    if (submittedGuest !== null && submittedGuest.name.length === 0) this.fail(400, "GUEST_NAME_REQUIRED");
    if (submittedGuest !== null && submittedGuest.schoolName.length === 0) this.fail(400, "GUEST_SCHOOL_REQUIRED");
    if (submittedGuest !== null && submittedGuest.grade.length === 0) this.fail(400, "GUEST_GRADE_REQUIRED");
    if (submittedGuest !== null && !GUEST_GRADES.includes(submittedGuest.grade as GuestGrade)) this.fail(400, "GUEST_GRADE_INVALID");
    const adminContact = request.adminOverride === undefined ? null : this.phoneProtector.protect(request.contact ?? this.fail(400, "CONTACT_REQUIRED"));
    const seats = seatCountFor(request.attendanceParty);
    const keyDigest = this.crypto.digest(idempotencyKey);
    const requestDigest = this.crypto.digest(this.crypto.stableJson({
      sessionId: request.sessionId,
      attendanceParty: request.attendanceParty,
      participantType: request.participantType,
      studentIds: submittedStudentIds,
      guest: submittedGuest,
      bookingProofDigest: request.bookingProof === undefined ? null : this.crypto.digest(request.bookingProof).toString("base64url"),
      contactDigest: adminContact?.digest.toString("base64url") ?? null,
      adminOverride: request.adminOverride,
    }));
    const qr = this.crypto.issueQr();
    const qrCiphertext = this.qrTokenProtector.protect(qr.rawToken);
    const access = this.crypto.issueBookingAccess();

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(${keyDigest.readBigInt64BE()})`;
      const replay = await transaction.idempotencyRecord.findUnique({
        where: { scope_keyDigest: { scope: "FAMILY_BOOKING_CREATE", keyDigest: this.bytes(keyDigest) } },
      });
      if (replay !== null) {
        if (!this.equal(replay.requestDigest, requestDigest)) this.fail(409, "IDEMPOTENCY_KEY_REUSED");
        const stored = replay.responseBody as unknown as Omit<FamilyBookingResult, "qrToken" | "qrExpiresAt" | "replayed">;
        return { ...stored, qrToken: null, qrExpiresAt: null, replayed: true };
      }

      const capacities = await transaction.$queryRaw<Array<{
        session_id: bigint; session_public_id: string; status: string; starts_at: Date;
        ends_at: Date; guest_booking_enabled: boolean; seminar_status: string;
        booking_opens_at: Date | null; booking_closes_at: Date | null; capacity: number; reserved_count: number;
        scope: string; branch_id: bigint | null;
      }>>`select sc.session_id,ss.public_id session_public_id,ss.status,ss.starts_at,ss.ends_at,
                 ss.guest_booking_enabled,se.status seminar_status,ss.booking_opens_at,
                 ss.scope,ss.branch_id,
                 ss.booking_closes_at,sc.capacity,sc.reserved_count
            from session_capacities sc
            join seminar_sessions ss on ss.id=sc.session_id
            join seminars se on se.id=ss.seminar_id
           where ss.public_id=${request.sessionId}::uuid for update of sc`;
      const capacity = capacities[0];
      if (capacity === undefined || capacity.status !== "OPEN"
        || (request.adminOverride === undefined && capacity.seminar_status !== "PUBLISHED")) {
        this.fail(409, "SESSION_NOT_BOOKABLE");
      }
      const now = new Date();
      if ((capacity.booking_opens_at !== null && now < capacity.booking_opens_at)
        || (capacity.booking_closes_at !== null && now > capacity.booking_closes_at)) this.fail(409, "BOOKING_WINDOW_CLOSED");
      if (capacity.reserved_count + seats > capacity.capacity) this.fail(409, "CAPACITY_EXCEEDED");

      const proof = request.adminOverride === undefined
        ? await this.otpProof.consume(transaction, request.bookingProof ?? "", "FAMILY_BOOKING")
        : await transaction.otpProofAudit.create({
            data: {
              purpose: "ADMIN_OVERRIDE", contactDigest: this.bytes(adminContact!.digest),
              contactCiphertext: this.bytes(adminContact!.ciphertext), contactLast4: adminContact!.last4,
              status: "CONSUMED",
              expiresAt: new Date(Date.now() + 60_000), verifiedAt: new Date(), consumedAt: new Date(),
            },
          }).then((audit) => ({
            auditId: audit.id, purpose: "FAMILY_BOOKING" as const, contactDigest: audit.contactDigest,
            contactCiphertext: audit.contactCiphertext, contactLast4: audit.contactLast4,
            selectedBranchCode: null,
            expiresAt: audit.expiresAt,
          }));
      const protectedContact = {
        digest: Buffer.from(proof.contactDigest), ciphertext: Buffer.from(proof.contactCiphertext), last4: proof.contactLast4,
      };
      type StudentRow = {
        id: bigint; public_id: string; source_student_no: string; name: string; class_name: string;
        school_name: string | null; grade: string | null; branch_id: bigint; branch_code: string;
        mother_phone_digest: Uint8Array | null; father_phone_digest: Uint8Array | null;
        teacher_name: string | null; unit_name: string | null;
      };
      let students: StudentRow[] = [];
      let guest = submittedGuest;
      let studentIds = submittedStudentIds;
      if (request.adminOverride !== undefined) {
        if (request.participantType === "ENROLLED") {
          if (studentIds.length === 0) this.fail(400, "STUDENTS_REQUIRED");
          students = await transaction.$queryRaw<StudentRow[]>(Prisma.sql`
            select s.id,s.public_id,s.source_student_no,s.name,s.class_name,s.school_name,s.grade,s.branch_id,
                   b.code branch_code,s.mother_phone_digest,s.father_phone_digest,s.teacher_name,s.unit_name
              from students s join branches b on b.id=s.branch_id
             where s.public_id in (${Prisma.join(studentIds.map((studentId) => Prisma.sql`${studentId}::uuid`))})
               and s.source_active
             order by s.id for update of s`);
          if (students.length !== studentIds.length) this.fail(404, "STUDENT_NOT_FOUND");
        }
      } else {
        const selectedBranch = proof.selectedBranchCode;
        if (selectedBranch === null) this.fail(400, "BOOKING_CAMPUS_REQUIRED");
        const matchingStudents = await transaction.$queryRaw<StudentRow[]>`
          select s.id,s.public_id,s.source_student_no,s.name,s.class_name,s.school_name,s.grade,s.branch_id,
                 b.code branch_code,s.mother_phone_digest,s.father_phone_digest,s.teacher_name,s.unit_name
            from students s join branches b on b.id=s.branch_id
           where s.source_active
             and (s.mother_phone_digest=${this.bytes(protectedContact.digest)}
               or s.father_phone_digest=${this.bytes(protectedContact.digest)})
           order by s.id for update of s`;
        students = matchingStudents.filter((student) => student.branch_code === selectedBranch);
        if (students.length > 10) this.fail(409, "ENROLLED_FAMILY_TOO_LARGE");
        if (request.participantType === "ENROLLED") {
          if (students.length === 0) this.fail(404, "ENROLLED_STUDENT_NOT_FOUND");
          studentIds = students.map((student) => student.public_id);
          guest = null;
        } else {
          if (matchingStudents.length > 0) this.fail(409, "ENROLLED_CONTACT_MUST_USE_ENROLLED_FLOW");
          if (guest === null) this.fail(400, "PARTICIPANT_INPUT_INVALID");
          if (!capacity.guest_booking_enabled) this.fail(409, "GUEST_BOOKING_DISABLED");
          if (guest.branch !== selectedBranch) this.fail(400, "GUEST_CAMPUS_MISMATCH");
          studentIds = [];
        }
      }
      const activeAssignments = students.length === 0 ? [] : await transaction.studentClassAssignment.findMany({
        where: { studentId: { in: students.map((student) => student.id) }, sourceActive: true },
        select: { studentId: true, className: true, sourceActive: true },
      });
      if (students.some((student) => !(
        (student.mother_phone_digest !== null && this.equal(student.mother_phone_digest, protectedContact.digest))
        || (student.father_phone_digest !== null && this.equal(student.father_phone_digest, protectedContact.digest))
      ))) {
        this.fail(403, "STUDENT_CONTACT_OWNERSHIP_MISMATCH");
      }
      const guestBranch = guest === null ? null : await transaction.branch.findUnique({ where: { code: guest.branch } });
      if (guest !== null && (guestBranch === null || !guestBranch.active)) this.fail(400, "GUEST_BRANCH_INVALID");
      if (capacity.scope === "BRANCH" && (capacity.branch_id === null || (guestBranch !== null
        ? guestBranch.id !== capacity.branch_id
        : students.some((student) => student.branch_id !== capacity.branch_id)))) {
        this.fail(409, "SESSION_BRANCH_MISMATCH");
      }
      const activeBooking = await transaction.familyBooking.findFirst({
        where: {
          sessionId: capacity.session_id,
          contactDigest: this.bytes(protectedContact.digest),
          status: { in: ["RESERVED", "CHECKED_IN"] },
        },
        select: { publicId: true },
      });
      if (activeBooking !== null) this.fail(409, "ACTIVE_FAMILY_BOOKING_EXISTS");

      const expiresAt = new Date(Math.max(
        capacity.starts_at.getTime() + 6 * 60 * 60 * 1_000,
        capacity.ends_at.getTime() + 60 * 60 * 1_000,
        Date.now() + 60 * 60 * 1_000,
      ));
      const booking = await transaction.familyBooking.create({
        data: {
          sessionId: capacity.session_id,
          contactDigest: this.bytes(protectedContact.digest),
          contactCiphertext: this.bytes(protectedContact.ciphertext),
          contactLast4: protectedContact.last4,
          attendanceParty: request.attendanceParty,
          seatCount: seats,
          bookingSource: request.adminOverride?.bookingSource ?? "WEB_APP",
          status: "RESERVED",
          otpProofAuditId: proof.auditId,
        },
      });
      const bookingChildren: Array<{
        link: { publicId: string };
        studentPublicId: string;
        sourceStudentNo: string;
        studentName: string;
        branch: SmsBranch;
        unitName: string | null;
        teacherName: string | null;
        schoolName: string | null;
        grade: string | null;
      }> = [];
      for (const student of students) {
        const teacherName = currentStudentMathHomeroomTeacher({
          teacherName: student.teacher_name,
          assignments: activeAssignments.filter((assignment) => assignment.studentId === student.id),
        });
        const link = await transaction.familyBookingStudent.create({ data: {
          familyBookingId: booking.id,
          sessionId: capacity.session_id,
          participantType: "ENROLLED",
          studentId: student.id,
          branchCodeAtBooking: student.branch_code,
          sourceStudentNoSnapshot: student.source_student_no,
          studentNameSnapshot: student.name,
          classNameSnapshot: student.class_name,
          schoolNameSnapshot: student.school_name,
          gradeSnapshot: student.grade,
          unitNameSnapshot: student.unit_name,
          teacherNameSnapshot: teacherName,
        } });
        bookingChildren.push({
          link, studentPublicId: student.public_id, sourceStudentNo: student.source_student_no,
          studentName: student.name, branch: student.branch_code as SmsBranch, unitName: student.unit_name,
          teacherName, schoolName: student.school_name, grade: student.grade,
        });
      }
      if (guest !== null && guestBranch !== null) {
        const sequence = await transaction.$queryRaw<Array<{ value: bigint }>>`
          select nextval('guest_participant_no_seq') value`;
        const sourceStudentNo = `비재원-${sequence[0]!.value.toString().padStart(6, "0")}`;
        const link = await transaction.familyBookingStudent.create({ data: {
          familyBookingId: booking.id,
          sessionId: capacity.session_id,
          participantType: "GUEST",
          studentId: null,
          branchCodeAtBooking: guest.branch,
          sourceStudentNoSnapshot: sourceStudentNo,
          studentNameSnapshot: guest.name,
          classNameSnapshot: "비재원생",
          schoolNameSnapshot: guest.schoolName,
          gradeSnapshot: guest.grade,
          unitNameSnapshot: null,
          teacherNameSnapshot: null,
        } });
        bookingChildren.push({
          link, studentPublicId: link.publicId, sourceStudentNo, studentName: guest.name,
          branch: guest.branch, unitName: null, teacherName: null,
          schoolName: guest.schoolName, grade: guest.grade,
        });
      }
      await transaction.sessionCapacity.update({
        where: { sessionId: capacity.session_id },
        data: { reservedCount: { increment: seats }, version: { increment: 1 }, updatedAt: now },
      });
      await transaction.qrCredential.create({
        data: {
          familyBookingId: booking.id,
          tokenDigest: this.bytes(qr.digest),
          tokenCiphertext: this.bytes(qrCiphertext),
          version: 1,
          status: "ACTIVE",
          expiresAt,
        },
      });
      const accessExpiresAt = new Date(Math.max(
        capacity.ends_at.getTime() + 30 * 24 * 60 * 60_000,
        Date.now() + 30 * 24 * 60 * 60_000,
      ));
      await transaction.bookingAccessCredential.create({
        data: {
          familyBookingId: booking.id,
          tokenDigest: this.bytes(access.digest),
          status: "ACTIVE",
          expiresAt: accessExpiresAt,
        },
      });
      const createdEvent = await transaction.bookingEvent.create({
        data: { familyBookingId: booking.id, eventType: "CREATED", ...(request.adminOverride === undefined ? {} : { actorSubject: request.adminOverride.actorSubject }),
          safeMetadata: { seats, attendanceParty: request.attendanceParty, bookingSource: request.adminOverride?.bookingSource ?? "WEB_APP", ...(request.adminOverride === undefined ? {} : { reason: request.adminOverride.reason }) } },
      });
      await transaction.bookingEvent.create({ data: { familyBookingId: booking.id, eventType: "QR_ISSUED", safeMetadata: { version: 1 } } });
      const bookingUrl = new URL("/booking/access", this.environment.publicBaseUrl ?? "https://invalid.local");
      bookingUrl.hash = `token=${access.rawToken}`;
      await this.smsOutbox.enqueue(transaction, {
        eventKey: `BOOKING_CONFIRMED:${booking.publicId}:1`,
        source: "BOOKING_CONFIRMED",
        branch: bookingChildren[0]!.branch,
        seminarSessionPublicId: capacity.session_public_id,
        familyBookingPublicId: booking.publicId,
        recipientCiphertext: protectedContact.ciphertext,
        recipientDigest: protectedContact.digest,
        recipientLast4: protectedContact.last4,
        message: `[NPR] 설명회 예약이 완료되었습니다. 예약 및 입장 QR 확인: ${bookingUrl.toString()}`,
        actorSubject: request.adminOverride?.actorSubject ?? null,
        safeMetadata: { qrVersion: 1 },
      });
      await this.sheetOutbox.enqueueBookingEvent(transaction, {
        eventId: createdEvent.eventId,
        eventType: "CREATED",
        occurredAt: createdEvent.occurredAt,
        seminarSessionPublicId: capacity.session_public_id,
        familyBookingPublicId: booking.publicId,
        bookingVersion: booking.version,
        bookingCreatedAt: booking.createdAt,
        attendanceParty: request.attendanceParty,
        bookingSource: request.adminOverride?.bookingSource ?? "WEB_APP",
        children: bookingChildren.map((child) => ({
          familyBookingStudentPublicId: child.link.publicId,
          studentPublicId: child.studentPublicId,
          sourceStudentNo: child.sourceStudentNo,
          studentName: child.studentName,
          branch: child.branch,
          unitName: child.unitName,
          teacherName: child.teacherName,
          schoolName: child.schoolName,
          grade: child.grade,
          active: true,
        })),
      });
      const responseWithoutRaw = {
        familyBookingId: booking.publicId,
        sessionId: capacity.session_public_id,
        attendanceParty: request.attendanceParty,
        seatCount: seats,
        status: booking.status,
        studentIds,
      };
      await transaction.idempotencyRecord.create({
        data: {
          scope: "FAMILY_BOOKING_CREATE",
          keyDigest: this.bytes(keyDigest),
          requestDigest: this.bytes(requestDigest),
          resourcePublicId: booking.publicId,
          responseStatus: 201,
          responseBody: responseWithoutRaw,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        },
      });
      return { ...responseWithoutRaw, qrToken: qr.rawToken, qrExpiresAt: expiresAt, replayed: false };
    }, { timeout: 10_000, maxWait: 5_000, isolationLevel: "ReadCommitted" });
  }

  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }

  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The family booking could not be completed.");
  }
}
