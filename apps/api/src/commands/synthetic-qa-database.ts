import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
import { PhoneProtector, type ProtectedPhone } from "../common/crypto/phone-protector.service.js";
import type { AppEnvironment } from "../common/config/environment.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { QrTokenProtector } from "../modules/family-bookings/qr-token-protector.service.js";
import { scannerCheckInMetadata } from "../modules/check-ins/check-ins.service.js";
import {
  EXPECTED_QA_COUNTS,
  QA_BRANCH_STUDENT_COUNTS,
  buildSyntheticQaPlan,
  stableQaDigest,
  stableQaUuid,
  type QaBookingDraft,
  type QaBranchCode,
  type QaStudentDraft,
} from "./synthetic-qa-data.js";
import { requireCanonicalKey } from "./synthetic-qa-safety.js";

const BATCH_SIZE = 400;

interface SyntheticScannerSnapshot {
  readonly name: string;
  readonly location: string;
  readonly gateCode: string;
  readonly branchCode: QaBranchCode;
}

export function syntheticQaCheckInMetadata(scanner: SyntheticScannerSnapshot) {
  return scannerCheckInMetadata(scanner);
}

export interface SyntheticQaResult {
  readonly students: number;
  readonly assignments: number;
  readonly bookings: number;
  readonly scanners: number;
  readonly smsOutbox: 0;
  readonly sheetOutbox: 0;
}

export function createSyntheticQaPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

export async function resetSyntheticQaDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await resetWithinTransaction(transaction);
    await transaction.branch.createMany({
      data: [
        branchRow("CAMPUS_A", "A", "SE8A"),
        branchRow("CAMPUS_B", "B", "KG5M"),
        branchRow("CAMPUS_C", "C", "SE9P"),
      ],
    });
    await restoreNonQaTemplateDefaults(transaction);
  }, { maxWait: 30_000, timeout: 120_000 });
}

export async function seedSyntheticQaDatabase(
  prisma: PrismaClient,
  environment: NodeJS.ProcessEnv,
): Promise<SyntheticQaResult> {
  const plan = buildSyntheticQaPlan();
  const cryptoEnvironment = qaCryptoEnvironment(environment);
  const phoneProtector = new PhoneProtector(cryptoEnvironment);
  const qrProtector = new QrTokenProtector(cryptoEnvironment);
  const seededAt = new Date();

  const result = await prisma.$transaction(async (transaction) => {
    await resetWithinTransaction(transaction);
    const branches = await transaction.branch.createManyAndReturn({
      data: [
        branchRow("CAMPUS_A", "A", "SE8A"),
        branchRow("CAMPUS_B", "B", "KG5M"),
        branchRow("CAMPUS_C", "C", "SE9P"),
      ],
      select: { id: true, code: true },
    });
    const branchIds = new Map(branches.map((branch) => [branch.code as QaBranchCode, branch.id]));
    const syncRun = await transaction.syncRun.create({
      data: {
        publicId: stableQaUuid("sync-run", "published-v1"), runType: "MANUAL", status: "PUBLISHED",
        initiatedBy: "system:synthetic-qa-seed", snapshotId: "synthetic-qa-v1",
        snapshotHash: stableQaDigest("sync-snapshot"), stagingHash: stableQaDigest("sync-staging"),
        publishable: true, loginAttempted: false, ambiguityCount: 17,
        rawRowCount: EXPECTED_QA_COUNTS.assignments,
        includedAssignmentCount: EXPECTED_QA_COUNTS.assignments,
        uniqueStudentCount: EXPECTED_QA_COUNTS.students, excludedCount: 0,
        startedAt: seededAt, finishedAt: seededAt, publishedAt: seededAt,
        publishedBy: "system:synthetic-qa-seed",
        metrics: { fixture: "synthetic-qa-v1", externalLogin: false },
      },
    });

    const protectedPhones = new Map<string, ProtectedPhone>();
    const protect = (phone: string): ProtectedPhone => {
      const cached = protectedPhones.get(phone);
      if (cached !== undefined) return cached;
      const value = phoneProtector.protect(phone);
      protectedPhones.set(phone, value);
      return value;
    };

    const studentIdByPublicId = new Map<string, bigint>();
    for (const batch of chunks(plan.students, BATCH_SIZE)) {
      const inserted = await transaction.student.createManyAndReturn({
        data: batch.map((student) => {
          const mother = protect(student.motherPhone);
          const father = protect(student.fatherPhone);
          return {
            publicId: student.publicId, sourceStudentNo: student.sourceStudentNo,
            branchId: required(branchIds, student.branchCode), name: student.name,
            className: student.className, schoolName: student.schoolName, grade: student.grade,
            teacherName: student.teacherName, unitName: student.unitName,
            motherPhoneCiphertext: prismaBytes(mother.ciphertext), motherPhoneDigest: prismaBytes(mother.digest), motherPhoneLast4: mother.last4,
            fatherPhoneCiphertext: prismaBytes(father.ciphertext), fatherPhoneDigest: prismaBytes(father.digest), fatherPhoneLast4: father.last4,
            sourceStatus: "재원생", sourceActive: true,
            sourceHash: stableQaDigest(`student:${student.key}`),
            classResolutionStatus: student.classResolutionStatus,
            classResolutionReason: student.classResolutionReason,
            firstSeenRunId: syncRun.id, lastSeenRunId: syncRun.id,
            createdAt: seededAt, updatedAt: seededAt,
          };
        }),
        select: { id: true, publicId: true },
      });
      for (const student of inserted) studentIdByPublicId.set(student.publicId, student.id);
    }

    const studentByKey = new Map(plan.students.map((student) => [student.key, student]));
    for (const batch of chunks(plan.students.flatMap((student) => student.assignments.map((assignment) => ({ student, assignment }))), BATCH_SIZE)) {
      await transaction.studentClassAssignment.createMany({
        data: batch.map(({ student, assignment }) => ({
          publicId: stableQaUuid("assignment", assignment.key),
          studentId: required(studentIdByPublicId, student.publicId),
          sourceUniqueNo: `SRC-${student.key}`,
          classRegistrationNo: `REG-${assignment.key}`,
          className: assignment.className, teacherName: assignment.teacherName,
          unitName: assignment.unitName, schoolName: student.schoolName, grade: student.grade,
          sourceHash: stableQaDigest(`assignment:${assignment.key}`), sourceActive: true,
          firstSeenRunId: syncRun.id, lastSeenRunId: syncRun.id,
          createdAt: seededAt, updatedAt: seededAt,
        })),
      });
    }

    for (const [index, branchCode] of (["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"] as const).entries()) {
      const branchStudents = plan.students.filter((student) => student.branchCode === branchCode);
      const assignmentCount = branchStudents.reduce((sum, student) => sum + student.assignments.length, 0);
      await transaction.syncBranchRun.create({ data: {
        publicId: stableQaUuid("sync-branch-run", branchCode), syncRunId: syncRun.id,
        branchId: required(branchIds, branchCode), sequenceNo: index + 1, status: "PROMOTED",
        fetchedCount: assignmentCount, stagedCount: assignmentCount, includedCount: assignmentCount,
        excludedCount: 0, insertedCount: branchStudents.length, updatedCount: 0, inactivatedCount: 0,
        snapshotHash: stableQaDigest(`sync-branch:${branchCode}`), startedAt: seededAt, finishedAt: seededAt,
      } });
    }
    await transaction.syncAuditEvent.create({ data: {
      eventId: stableQaUuid("sync-audit", "published"), syncRunId: syncRun.id,
      eventType: "RUN_PUBLISHED", actorSubject: "system:synthetic-qa-seed",
      counts: { students: EXPECTED_QA_COUNTS.students, assignments: EXPECTED_QA_COUNTS.assignments },
      safeMetadata: { fixture: "synthetic-qa-v1" }, occurredAt: seededAt,
    } });

    const seminarIdByKey = new Map<string, bigint>();
    for (const seminar of await transaction.seminar.createManyAndReturn({
      data: plan.seminars.map((row) => ({
        publicId: row.publicId, title: row.title, description: "합성 QA 전용 설명회",
        status: row.status, createdAt: seededAt, updatedAt: seededAt,
      })),
      select: { id: true, publicId: true },
    })) {
      const draft = plan.seminars.find((row) => row.publicId === seminar.publicId)!;
      seminarIdByKey.set(draft.key, seminar.id);
    }

    const sessionIdByKey = new Map<string, bigint>();
    const sessionPublicIdByKey = new Map<string, string>();
    for (const session of await transaction.seminarSession.createManyAndReturn({
      data: plan.sessions.map((row) => ({
        publicId: row.publicId, seminarId: required(seminarIdByKey, row.seminarKey),
        scope: row.scope, branchId: row.branchCode === null ? null : required(branchIds, row.branchCode),
        title: row.title, place: row.place, startsAt: row.startsAt, endsAt: row.endsAt,
        bookingOpensAt: row.bookingOpensAt, bookingClosesAt: row.bookingClosesAt,
        guestBookingEnabled: row.guestBookingEnabled, status: row.status,
        createdAt: seededAt, updatedAt: seededAt,
      })),
      select: { id: true, publicId: true },
    })) {
      const draft = plan.sessions.find((row) => row.publicId === session.publicId)!;
      sessionIdByKey.set(draft.key, session.id);
      sessionPublicIdByKey.set(draft.key, session.publicId);
    }

    const otpIdByBookingKey = new Map<string, bigint>();
    for (const batch of chunks(plan.bookings, BATCH_SIZE)) {
      const inserted = await transaction.otpProofAudit.createManyAndReturn({
        data: batch.map((booking) => {
          const contact = protect(booking.contactPhone);
          return {
            publicId: stableQaUuid("otp-proof", booking.key), proofDigest: stableQaDigest(`proof:${booking.key}`),
            purpose: "FAMILY_BOOKING", contactDigest: prismaBytes(contact.digest), contactCiphertext: prismaBytes(contact.ciphertext),
            contactLast4: contact.last4, selectedBranchCode: bookingBranch(booking, studentByKey),
            status: "CONSUMED", expiresAt: new Date(booking.createdAt.getTime() + 10 * 60_000),
            verifiedAt: booking.createdAt, consumedAt: booking.createdAt, createdAt: booking.createdAt,
          };
        }),
        select: { id: true, publicId: true },
      });
      for (const proof of inserted) {
        const booking = batch.find((row) => stableQaUuid("otp-proof", row.key) === proof.publicId)!;
        otpIdByBookingKey.set(booking.key, proof.id);
      }
    }

    const bookingIdByKey = new Map<string, bigint>();
    for (const batch of chunks(plan.bookings, BATCH_SIZE)) {
      const inserted = await transaction.familyBooking.createManyAndReturn({
        data: batch.map((booking) => {
          const contact = protect(booking.contactPhone);
          const stateAt = new Date(booking.createdAt.getTime() + 2 * 60 * 60_000);
          return {
            publicId: booking.publicId, sessionId: required(sessionIdByKey, booking.sessionKey),
            contactDigest: prismaBytes(contact.digest), contactCiphertext: prismaBytes(contact.ciphertext), contactLast4: contact.last4,
            attendanceParty: booking.attendanceParty, seatCount: booking.seatCount,
            status: booking.status, bookingSource: booking.bookingSource,
            otpProofAuditId: required(otpIdByBookingKey, booking.key),
            checkedInAt: booking.status === "CHECKED_IN" ? stateAt : null,
            cancelledAt: booking.status === "CANCELLED" ? stateAt : null,
            createdAt: booking.createdAt, updatedAt: stateAt,
          };
        }),
        select: { id: true, publicId: true },
      });
      for (const row of inserted) {
        const draft = batch.find((booking) => booking.publicId === row.publicId)!;
        bookingIdByKey.set(draft.key, row.id);
      }
    }

    const participantRows: Prisma.FamilyBookingStudentCreateManyInput[] = [];
    for (const booking of plan.bookings) {
      if (booking.guest !== null) {
        participantRows.push({
          publicId: stableQaUuid("booking-student", `${booking.key}:guest`),
          familyBookingId: required(bookingIdByKey, booking.key), sessionId: required(sessionIdByKey, booking.sessionKey),
          participantType: "GUEST", studentId: null, active: booking.status !== "CANCELLED",
          releasedAt: booking.status === "CANCELLED" ? new Date(booking.createdAt.getTime() + 2 * 60 * 60_000) : null,
          branchCodeAtBooking: booking.guest.branchCode,
          sourceStudentNoSnapshot: `QA-GUEST-${String(booking.guest.ordinal).padStart(4, "0")}`,
          studentNameSnapshot: `QA비재원${booking.guest.ordinal}`,
          classNameSnapshot: "비재원생", schoolNameSnapshot: "QA비재원학교",
          gradeSnapshot: "중1", unitNameSnapshot: "비재원생", teacherNameSnapshot: null,
          createdAt: booking.createdAt,
        });
      }
      for (const studentKey of booking.studentKeys) {
        const student = required(studentByKey, studentKey);
        participantRows.push({
          publicId: stableQaUuid("booking-student", `${booking.key}:${student.key}`),
          familyBookingId: required(bookingIdByKey, booking.key), sessionId: required(sessionIdByKey, booking.sessionKey),
          participantType: "ENROLLED", studentId: required(studentIdByPublicId, student.publicId),
          active: booking.status !== "CANCELLED",
          releasedAt: booking.status === "CANCELLED" ? new Date(booking.createdAt.getTime() + 2 * 60 * 60_000) : null,
          branchCodeAtBooking: student.branchCode, sourceStudentNoSnapshot: student.sourceStudentNo,
          studentNameSnapshot: student.name, classNameSnapshot: student.className,
          schoolNameSnapshot: student.schoolName, gradeSnapshot: student.grade,
          unitNameSnapshot: student.unitName, teacherNameSnapshot: student.teacherName,
          createdAt: booking.createdAt,
        });
      }
    }
    for (const batch of chunks(participantRows, BATCH_SIZE)) {
      await transaction.familyBookingStudent.createMany({ data: batch });
    }

    const credentialIdByBookingKey = new Map<string, bigint>();
    for (const batch of chunks(plan.bookings, BATCH_SIZE)) {
      const inserted = await transaction.qrCredential.createManyAndReturn({
        data: batch.map((booking) => {
          const rawToken = deterministicToken("qr", booking.key);
          const revoked = booking.status === "CANCELLED" || booking.status === "NO_SHOW";
          return {
            publicId: stableQaUuid("qr", booking.key), familyBookingId: required(bookingIdByKey, booking.key),
            tokenDigest: prismaBytes(createHash("sha256").update(rawToken).digest()), tokenCiphertext: prismaBytes(qrProtector.protect(rawToken)),
            version: 1, status: booking.status === "NO_SHOW" ? "EXPIRED" : revoked ? "REVOKED" : "ACTIVE",
            issuedAt: booking.createdAt,
            expiresAt: new Date(required(plan.sessions.find((row) => row.key === booking.sessionKey), booking.sessionKey).endsAt.getTime() + 86_400_000),
            revokedAt: revoked ? new Date(booking.createdAt.getTime() + 2 * 60 * 60_000) : null,
          };
        }),
        select: { id: true, publicId: true },
      });
      for (const row of inserted) {
        const draft = batch.find((booking) => stableQaUuid("qr", booking.key) === row.publicId)!;
        credentialIdByBookingKey.set(draft.key, row.id);
      }
      await transaction.bookingAccessCredential.createMany({
        data: batch.map((booking) => {
          const revoked = booking.status === "CANCELLED";
          return {
            publicId: stableQaUuid("booking-access", booking.key),
            familyBookingId: required(bookingIdByKey, booking.key),
            tokenDigest: stableQaDigest(`booking-access:${booking.key}`),
            status: booking.status === "NO_SHOW" ? "EXPIRED" : revoked ? "REVOKED" : "ACTIVE",
            issuedAt: booking.createdAt,
            expiresAt: new Date(booking.createdAt.getTime() + 30 * 86_400_000),
            revokedAt: revoked ? new Date(booking.createdAt.getTime() + 2 * 60 * 60_000) : null,
            createdAt: booking.createdAt,
          };
        }),
      });
    }

    const scannerIdByIndex = new Map<number, bigint>();
    const scannerSnapshotByIndex = new Map<number, SyntheticScannerSnapshot>();
    const heartbeatOffsets: readonly (number | null)[] = [15, 30, 45, 90, 300, null];
    const scanners = await transaction.scannerDevice.createManyAndReturn({
      data: heartbeatOffsets.map((seconds, index) => {
        const branchCode = (["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"] as const)[index % 3]!;
        const gateCode = `QA-GATE-${index + 1}`;
        const scannerSnapshot = {
          name: `QA iPad 스캐너 ${index + 1}`,
          location: `${branchCode} QA 입구`,
          gateCode,
          branchCode,
        } satisfies SyntheticScannerSnapshot;
        scannerSnapshotByIndex.set(index, scannerSnapshot);
        return {
          publicId: stableQaUuid("scanner", String(index + 1)), branchId: required(branchIds, branchCode),
          name: scannerSnapshot.name, model: "iPad Safari", location: scannerSnapshot.location,
          gateCode, batteryPercent: null, batteryIsCharging: null, batteryReportedAt: null,
          status: "ACTIVE", pairedBy: "system:synthetic-qa-seed",
          pairedAt: new Date(seededAt.getTime() - 3_600_000),
          lastHeartbeatAt: seconds === null ? null : new Date(seededAt.getTime() - seconds * 1_000),
          selectedSessionId: required(sessionIdByKey, "POC"), scanModeLockedAt: seededAt, createdAt: seededAt,
        };
      }),
      select: { id: true, publicId: true },
    });
    for (const [index, scanner] of scanners.entries()) scannerIdByIndex.set(index, scanner.id);
    await transaction.scannerPairingAudit.createMany({ data: scanners.map((scanner, index) => ({
      eventId: stableQaUuid("scanner-audit", String(index + 1)), scannerDeviceId: scanner.id,
      eventType: "PAIRED", actorSubject: "system:synthetic-qa-seed", resultCode: "PAIRED",
      safeMetadata: { fixture: true }, occurredAt: seededAt,
    })) });

    const checkedIn = plan.bookings.filter((booking) => booking.status === "CHECKED_IN");
    const scannerIndexByBookingKey = new Map(checkedIn.map((booking, index) => [
      booking.key,
      index % EXPECTED_QA_COUNTS.scanners,
    ]));
    const eventRows: Prisma.BookingEventCreateManyInput[] = [];
    for (const booking of plan.bookings) {
      const bookingId = required(bookingIdByKey, booking.key);
      const baseEvents: Array<{ type: string; offset: number }> = [
        { type: "CREATED", offset: 0 }, { type: "QR_ISSUED", offset: 1 }, { type: "UPDATED", offset: 2 },
      ];
      if (booking.sessionKey === "LOAD" && Number(booking.key.slice(5)) <= 900) {
        baseEvents.push({ type: "UPDATED", offset: 3 });
      }
      if (booking.status === "CHECKED_IN") baseEvents.push({ type: "CHECKED_IN", offset: 10 });
      if (booking.status === "CANCELLED") baseEvents.push({ type: "CANCELLED", offset: 10 });
      if (booking.status === "NO_SHOW") baseEvents.push({ type: "MARKED_NO_SHOW", offset: 10 });
      for (const [sequence, event] of baseEvents.entries()) {
        eventRows.push({
          eventId: stableQaUuid("booking-event", `${booking.key}:${sequence}`), familyBookingId: bookingId,
          eventType: event.type, actorSubject: "system:synthetic-qa-seed",
          cancellationType: event.type === "CANCELLED" ? "OTHER" : null,
          safeMetadata: event.type === "CHECKED_IN"
            ? { source: "QR", ...syntheticQaCheckInMetadata(required(
              scannerSnapshotByIndex,
              required(scannerIndexByBookingKey, booking.key),
            )) }
            : { fixture: true, sequence },
          occurredAt: new Date(booking.createdAt.getTime() + event.offset * 60_000),
        });
      }
    }
    for (const batch of chunks(eventRows, BATCH_SIZE)) await transaction.bookingEvent.createMany({ data: batch });

    for (const batch of chunks(checkedIn, BATCH_SIZE)) {
      await transaction.checkInEvent.createMany({ data: batch.map((booking, index) => {
        const globalIndex = checkedIn.indexOf(booking);
        const scannerIndex = globalIndex % EXPECTED_QA_COUNTS.scanners;
        return {
          eventId: stableQaUuid("check-in", booking.key), familyBookingId: required(bookingIdByKey, booking.key),
          qrCredentialId: required(credentialIdByBookingKey, booking.key),
          sessionId: required(sessionIdByKey, booking.sessionKey), source: "QR", result: "CHECKED_IN",
          seatCount: booking.seatCount, scannerDeviceId: required(scannerIdByIndex, scannerIndex),
          gateCode: required(scannerSnapshotByIndex, scannerIndex).gateCode, actorSubject: "scanner:synthetic-qa",
          idempotencyKeyDigest: stableQaDigest(`check-in:${booking.key}`),
          safeMetadata: syntheticQaCheckInMetadata(required(scannerSnapshotByIndex, scannerIndex)),
          occurredAt: new Date(booking.createdAt.getTime() + (120 + index) * 60_000),
        };
      }) });
    }

    await seedQaTemplates(transaction, seededAt);
    return verifyDatabase(transaction);
  }, { maxWait: 30_000, timeout: 600_000 });
  await prisma.$executeRawUnsafe("select analyze_student_import()");
  return result;
}

async function resetWithinTransaction(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$executeRawUnsafe(`
    truncate table
      public.branches,
      public.sync_runs,
      public.seminars,
      public.otp_proof_audits,
      public.sms_outbox,
      public.sheet_mappings,
      public.idempotency_records,
      public.sync_leases
    restart identity cascade
  `);
  await transaction.$executeRawUnsafe("alter sequence if exists public.guest_participant_no_seq restart with 1");
  await transaction.smsTemplate.deleteMany({ where: { key: { startsWith: "QA_" } } });
  await transaction.tongAuthCircuit.create({ data: { singletonId: 1, status: "CLOSED", version: 0n } });
  await transaction.syncLease.create({ data: { lockName: "tongtontong-student-sync" } });
}

async function seedQaTemplates(transaction: Prisma.TransactionClient, seededAt: Date): Promise<void> {
  await transaction.smsTemplate.updateMany({ data: { isDefault: false } });
  const templates: Prisma.SmsTemplateCreateManyInput[] = [
    {
      publicId: stableQaUuid("sms-template", "QA_DEFAULT_OTP"), key: "QA_DEFAULT_OTP",
      name: "QA 인증번호", purpose: "OTP",
      body: "[QA] 인증번호는 {인증번호}입니다. 5분 이내 입력해 주세요.",
      active: true, isDefault: true, version: 1n,
      createdBy: "system:synthetic-qa-seed", updatedBy: "system:synthetic-qa-seed",
      createdAt: seededAt, updatedAt: seededAt,
    },
    {
      publicId: stableQaUuid("sms-template", "QA_DEFAULT_BOOKING_CONFIRMED"), key: "QA_DEFAULT_BOOKING_CONFIRMED",
      name: "QA 예약 확정", purpose: "BOOKING_CONFIRMED",
      body: "[QA] {학생명} 학부모님, {설명회명} 예약이 확정되었습니다. {일시} {장소} 예약 및 입장 QR 확인: {예약확인링크}",
      active: true, isDefault: true, version: 1n,
      createdBy: "system:synthetic-qa-seed", updatedBy: "system:synthetic-qa-seed",
      createdAt: seededAt, updatedAt: seededAt,
    },
    {
      publicId: stableQaUuid("sms-template", "QA_DEFAULT_BOOKING_UPDATED"), key: "QA_DEFAULT_BOOKING_UPDATED",
      name: "QA 예약 변경", purpose: "BOOKING_UPDATED",
      body: "[QA] {학생명} 학부모님, {설명회명} 예약이 변경되었습니다. {일시} {장소} 확인: {예약확인링크}",
      active: true, isDefault: true, version: 1n,
      createdBy: "system:synthetic-qa-seed", updatedBy: "system:synthetic-qa-seed",
      createdAt: seededAt, updatedAt: seededAt,
    },
    {
      publicId: stableQaUuid("sms-template", "QA_DEFAULT_BOOKING_CANCELLED"), key: "QA_DEFAULT_BOOKING_CANCELLED",
      name: "QA 예약 취소", purpose: "BOOKING_CANCELLED",
      body: "[QA] {학생명} 학부모님, {설명회명} 예약이 취소되었습니다. 문의: {문의전화}",
      active: true, isDefault: true, version: 1n,
      createdBy: "system:synthetic-qa-seed", updatedBy: "system:synthetic-qa-seed",
      createdAt: seededAt, updatedAt: seededAt,
    },
    {
      publicId: stableQaUuid("sms-template", "QA_DEFAULT_ADMIN_GROUP"), key: "QA_DEFAULT_ADMIN_GROUP",
      name: "QA 단체 안내", purpose: "ADMIN_GROUP",
      body: "[QA] {학생명} 학부모님, {설명회명} 안내입니다. {일시} {장소} 확인: {예약확인링크} 문의: {문의전화}",
      active: true, isDefault: true, version: 1n,
      createdBy: "system:synthetic-qa-seed", updatedBy: "system:synthetic-qa-seed",
      createdAt: seededAt, updatedAt: seededAt,
    },
  ];
  await transaction.smsTemplate.createMany({ data: templates });
}

async function restoreNonQaTemplateDefaults(transaction: Prisma.TransactionClient): Promise<void> {
  await transaction.$executeRawUnsafe(`
    with ranked as (
      select id, row_number() over (partition by purpose order by id) as position
        from public.sms_templates
       where active = true and key not like 'QA\\_%' escape '\\'
    )
    update public.sms_templates as template
       set is_default = (ranked.position = 1)
      from ranked
     where ranked.id = template.id
  `);
}

async function verifyDatabase(transaction: Prisma.TransactionClient): Promise<SyntheticQaResult> {
  const [students, assignments, bookings, scanners, smsOutbox, sheetOutbox, mappings] = await Promise.all([
    transaction.student.count({ where: { sourceActive: true } }),
    transaction.studentClassAssignment.count({ where: { sourceActive: true } }),
    transaction.familyBooking.count(), transaction.scannerDevice.count(),
    transaction.smsOutbox.count(), transaction.sheetOutbox.count(), transaction.sheetMapping.count(),
  ]);
  const expected = {
    students: EXPECTED_QA_COUNTS.students, assignments: EXPECTED_QA_COUNTS.assignments,
    bookings: EXPECTED_QA_COUNTS.pocBookings + EXPECTED_QA_COUNTS.loadBookings,
    scanners: EXPECTED_QA_COUNTS.scanners,
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = { students, assignments, bookings, scanners }[key as keyof typeof expected];
    if (actual !== value) throw new Error(`QA database ${key} mismatch: expected ${value}, received ${actual}`);
  }
  if (smsOutbox !== 0 || sheetOutbox !== 0 || mappings !== 0) {
    throw new Error("Synthetic QA seed must not create SMS/Sheets delivery work");
  }
  const branchCounts = await transaction.student.groupBy({ by: ["branchId"], where: { sourceActive: true }, _count: { _all: true } });
  const branches = await transaction.branch.findMany({ select: { id: true, code: true } });
  for (const branch of branches) {
    const count = branchCounts.find((row) => row.branchId === branch.id)?._count._all ?? 0;
    if (count !== QA_BRANCH_STUDENT_COUNTS[branch.code as QaBranchCode]) {
      throw new Error(`QA branch count mismatch for ${branch.code}: ${count}`);
    }
  }
  const multiRows = await transaction.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    select count(*)::bigint count from (
      select student_id from student_class_assignments where source_active group by student_id having count(*)>1
    ) multi_students`);
  if (Number(multiRows[0]?.count ?? 0n) !== EXPECTED_QA_COUNTS.multiAssignmentStudents) {
    throw new Error("QA multi-assignment student count mismatch");
  }
  return { students, assignments, bookings, scanners, smsOutbox: 0, sheetOutbox: 0 };
}

function branchRow(code: QaBranchCode, displayName: string, sourceCode: string) {
  return { publicId: stableQaUuid("branch", code), code, displayName, sourceCode, active: true };
}

function bookingBranch(booking: QaBookingDraft, students: ReadonlyMap<string, QaStudentDraft>): QaBranchCode {
  if (booking.guest !== null) return booking.guest.branchCode;
  const first = students.get(booking.studentKeys[0] ?? "");
  if (first === undefined) throw new Error(`Booking ${booking.key} has no participant branch`);
  return first.branchCode;
}

function deterministicToken(kind: string, key: string): string {
  return createHash("sha256").update(`npr:synthetic-qa:v1:${kind}:${key}`).digest("base64url");
}

function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}

function qaCryptoEnvironment(environment: NodeJS.ProcessEnv): AppEnvironment {
  return {
    appEnv: "staging", processRole: "api", port: 4100,
    phoneEncryptionKey: requireCanonicalKey(environment, "PHONE_ENCRYPTION_KEY"),
    phoneHmacKey: requireCanonicalKey(environment, "PHONE_HMAC_KEY"),
    qrEncryptionKey: requireCanonicalKey(environment, "QR_ENCRYPTION_KEY"),
    smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
    smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined },
    smsAligoTestMode: true, googleSheetsEnabled: false,
    trustProxy: 0, tongSyncEnabled: false, sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
  };
}

function chunks<T>(rows: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

function required<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key): Value;
function required<Value>(value: Value | undefined, label: string): Value;
function required<Key, Value>(mapOrValue: ReadonlyMap<Key, Value> | Value | undefined, keyOrLabel: Key | string): Value {
  const value = mapOrValue instanceof Map ? mapOrValue.get(keyOrLabel as Key) : mapOrValue;
  if (value === undefined) throw new Error(`Missing synthetic QA relation: ${String(keyOrLabel)}`);
  return value;
}
