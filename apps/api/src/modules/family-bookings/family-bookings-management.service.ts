import { Inject, Injectable } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { BookingCryptoService } from "./booking-crypto.service.js";
import { seatCountFor, type AttendanceParty } from "./attendance.js";
import type { BookingCancellationType } from "./booking-cancellation-type.js";
import { SmsOutboxService, type SmsBranch } from "../sms/sms-outbox.service.js";
import { SmsTemplateCatalog } from "../sms/sms-template-catalog.service.js";
import { SheetOutboxService, type SheetBookingChildSnapshot } from "../google-sheets/sheet-outbox.service.js";
import { BookingProofService } from "./otp-proof.port.js";
import { createHash } from "node:crypto";
import { canonicalUnitName } from "../student-sync/student-display-normalizer.js";
import {
  currentOrHistoricMathHomeroomTeacher,
  currentStudentMathHomeroomTeacher,
} from "../student-sync/student-homeroom-policy.js";
import type { Request } from "express";
import { BookingAccessService } from "./booking-access.service.js";
import { QrTokenProtector } from "./qr-token-protector.service.js";
import type { AppEnvironment } from "../../common/config/environment.js";
import {
  mapMaskedFamilyBookingCore,
  mapMaskedFamilyBookingRow,
  type PublicMaskedFamilyBooking,
} from "./public-masked-family-booking.js";

interface UpdateInput { readonly seminarSessionId?: string; readonly attendanceParty?: AttendanceParty; readonly studentIds?: readonly string[]; readonly expectedVersion: number; readonly reason: string; }

@Injectable()
export class FamilyBookingsManagementService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly crypto: BookingCryptoService,
    private readonly smsOutbox: SmsOutboxService,
    private readonly smsTemplates: SmsTemplateCatalog,
    private readonly sheetOutbox: SheetOutboxService,
    private readonly bookingProof: BookingProofService,
    private readonly phoneProtector: PhoneProtector,
    private readonly bookingAccess: BookingAccessService,
    private readonly qrTokenProtector: QrTokenProtector,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  public async list(filters: { sessionId?: string; branch?: string; status?: string; query?: string; page: number; pageSize: number }) {
    const query = filters.query?.normalize("NFKC").trim();
    const where: Prisma.FamilyBookingWhereInput = {
      ...(filters.sessionId === undefined ? {} : { session: { publicId: filters.sessionId } }),
      ...(filters.branch === undefined ? {} : { students: { some: { active: true, branchCodeAtBooking: filters.branch } } }),
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(query === undefined ? {} : { OR: [
        ...(/^\d{4}$/.test(query) ? [{ contactLast4: query }] : []),
        { students: { some: { active: true, OR: [
          { studentNameSnapshot: { contains: query, mode: "insensitive" } },
          { sourceStudentNoSnapshot: { contains: query, mode: "insensitive" } },
        ] } } },
      ] }),
    };
    const [rows, totalItems] = await Promise.all([
      this.prisma.familyBooking.findMany({ where, include: this.include(), orderBy: { createdAt: "desc" }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }),
      this.prisma.familyBooking.count({ where }),
    ]);
    return { items: rows.map((row) => this.map(row)), page: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages: Math.ceil(totalItems / filters.pageSize) } };
  }

  public async get(id: string) {
    const row = await this.prisma.familyBooking.findUnique({ where: { publicId: id }, include: this.include() });
    if (row === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
    return this.map(row);
  }

  public async getAuthorized(id: string, proofValue: string, request?: Request) {
    const row = await this.prisma.familyBooking.findUnique({ where: { publicId: id }, include: this.include() });
    if (row === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
    if (proofValue.trim().length > 0) {
      const proof = await this.bookingProof.authorize(proofValue, "BOOKING_MANAGE");
      if (!Buffer.from(row.contactDigest).equals(Buffer.from(proof.contactDigest))) this.fail(403, "BOOKING_PROOF_CONTACT_MISMATCH");
    } else {
      if (request === undefined) this.fail(401, "BOOKING_MANAGEMENT_SESSION_REQUIRED");
      await this.bookingAccess.authorize(request, id);
    }
    return mapMaskedFamilyBookingRow(row, this.phoneProtector.reveal(row.contactCiphertext));
  }

  public async listAuthorized(proofValue: string) {
    const proof = await this.bookingProof.authorize(proofValue, "BOOKING_MANAGE");
    const rows = await this.prisma.familyBooking.findMany({
      where: { contactDigest: this.bytes(proof.contactDigest) },
      include: this.include(),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return {
      items: rows.map((row) => mapMaskedFamilyBookingRow(
        row,
        this.phoneProtector.reveal(row.contactCiphertext),
      )),
    };
  }

  public update(id: string, input: UpdateInput, actorSubject: null, key: string, proofValue: string, request?: Request): Promise<PublicMaskedFamilyBooking>;
  public update(id: string, input: UpdateInput, actorSubject: string, key: string, proofValue?: string, request?: Request): Promise<any>;
  public async update(id: string, input: UpdateInput, actorSubject: string | null, key: string, proofValue?: string, _request?: Request) {
    if (actorSubject === null && (proofValue === undefined || proofValue.trim().length === 0)) {
      this.fail(401, "BOOKING_PROOF_INVALID");
    }
    const proofDigest = actorSubject === null
      ? createHash("sha256").update(proofValue!).digest("base64url")
      : null;
    const response = await this.idempotency.execute("FAMILY_BOOKING_UPDATE", key, {
      id, ...input, proofDigest,
    }, async (transaction) => {
      const snapshot = await transaction.familyBooking.findUnique({
        where: { publicId: id },
        select: { id: true, publicId: true, sessionId: true, createdAt: true, bookingSource: true, session: { select: { publicId: true } } },
      });
      if (snapshot === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
      const targetSession = input.seminarSessionId === undefined
        ? { id: snapshot.sessionId }
        : await transaction.seminarSession.findUnique({ where: { publicId: input.seminarSessionId }, select: { id: true } });
      if (targetSession === null) this.fail(404, "SEMINAR_SESSION_NOT_FOUND");
      const sessionIds = [...new Set([snapshot.sessionId, targetSession.id])].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
      const sessionRows = await transaction.$queryRaw<Array<{
        session_id: bigint; session_public_id: string;
        scope: string; branch_id: bigint | null; status: string; seminar_status: string;
        booking_opens_at: Date | null; booking_closes_at: Date | null;
        starts_at: Date; ends_at: Date; guest_booking_enabled: boolean;
        seminar_title: string; place: string;
      }>>`select ss.id session_id,ss.public_id session_public_id,
                 ss.scope,ss.branch_id,ss.status,se.status seminar_status,ss.booking_opens_at,ss.booking_closes_at,
                 ss.starts_at,ss.ends_at,ss.guest_booking_enabled,se.title seminar_title,ss.place
            from seminar_sessions ss
            join seminars se on se.id=ss.seminar_id
           where ss.id=any(${sessionIds}::bigint[])
           order by ss.id for update of ss`;
      const sourceSession = sessionRows.find((row) => row.session_id === snapshot.sessionId);
      const targetSessionState = sessionRows.find((row) => row.session_id === targetSession.id);
      if (sourceSession === undefined || targetSessionState === undefined) this.fail(409, "SEMINAR_SESSION_NOT_FOUND");
      const lockedRows = await transaction.$queryRaw<Array<{
        id: bigint; session_id: bigint; status: string; version: bigint; attendance_party: string; seat_count: number;
        contact_digest: Uint8Array; contact_ciphertext: Uint8Array; contact_last4: string;
      }>>`select id,session_id,status,version,attendance_party,seat_count,contact_digest,contact_ciphertext,contact_last4
             from family_bookings where id=${snapshot.id} for update`;
      const booking = lockedRows[0]!;
      if (booking.session_id !== snapshot.sessionId) this.fail(409, "FAMILY_BOOKING_VERSION_CONFLICT");
      if (actorSubject === null) {
        const proof = await this.bookingProof.consume(transaction, proofValue!, "BOOKING_MANAGE");
        if (!Buffer.from(booking.contact_digest).equals(Buffer.from(proof.contactDigest))) this.fail(403, "BOOKING_PROOF_CONTACT_MISMATCH");
      }
      if (booking.version !== BigInt(input.expectedVersion)) this.fail(409, "FAMILY_BOOKING_VERSION_CONFLICT");
      if (booking.status !== "RESERVED") this.fail(409, "FAMILY_BOOKING_NOT_EDITABLE");
      const party = input.attendanceParty ?? booking.attendance_party as AttendanceParty;
      const seats = seatCountFor(party);
      const moved = targetSession.id !== snapshot.sessionId;
      const now = new Date();
      if (moved && (targetSessionState.status !== "OPEN" || targetSessionState.seminar_status !== "PUBLISHED")) this.fail(409, "SESSION_NOT_BOOKABLE");
      if (moved && ((targetSessionState.booking_opens_at !== null && now < targetSessionState.booking_opens_at)
        || (targetSessionState.booking_closes_at !== null && now > targetSessionState.booking_closes_at))) this.fail(409, "BOOKING_WINDOW_CLOSED");
      if (moved) {
        const submittedSurvey = await transaction.surveyResponse.findUnique({ where: { familyBookingId: booking.id }, select: { id: true } });
        if (submittedSurvey !== null) this.fail(409, "SURVEYED_BOOKING_CANNOT_MOVE");
        const duplicate = await transaction.familyBooking.findFirst({
          where: {
            id: { not: booking.id }, sessionId: targetSession.id,
            contactDigest: this.bytes(booking.contact_digest), status: { in: ["RESERVED", "CHECKED_IN"] },
          },
          select: { id: true },
        });
        if (duplicate !== null) this.fail(409, "ACTIVE_FAMILY_BOOKING_EXISTS");
      }
      const beforeChildren = await this.sheetChildren(transaction, booking.id, true);
      if (input.studentIds !== undefined) {
        const guestParticipant = await transaction.familyBookingStudent.findFirst({
          where: { familyBookingId: booking.id, active: true, participantType: "GUEST" }, select: { id: true },
        });
        if (guestParticipant !== null) this.fail(409, "GUEST_PARTICIPANT_IMMUTABLE");
        await this.replaceStudents(transaction, booking.id, targetSession.id, input.studentIds, booking.contact_digest, targetSessionState.scope, targetSessionState.branch_id);
      } else if (moved) {
        const participants = await transaction.$queryRaw<Array<{
          participant_type: string; branch_code_at_booking: string; source_active: boolean | null;
          mother_phone_digest: Uint8Array | null; father_phone_digest: Uint8Array | null;
        }>>`select fbs.participant_type,fbs.branch_code_at_booking,s.source_active,
                   s.mother_phone_digest,s.father_phone_digest
              from family_booking_students fbs left join students s on s.id=fbs.student_id
             where fbs.family_booking_id=${booking.id} and fbs.active order by fbs.id for update of fbs`;
        if (participants.length === 0) this.fail(409, "BOOKING_PARTICIPANTS_MISSING");
        if (participants.some((participant) => participant.participant_type === "ENROLLED" && (
          participant.source_active !== true || !(
            (participant.mother_phone_digest !== null && Buffer.from(participant.mother_phone_digest).equals(Buffer.from(booking.contact_digest)))
            || (participant.father_phone_digest !== null && Buffer.from(participant.father_phone_digest).equals(Buffer.from(booking.contact_digest)))
          )
        ))) this.fail(403, "STUDENT_CONTACT_OWNERSHIP_MISMATCH");
        if (actorSubject === null && !targetSessionState.guest_booking_enabled
          && participants.some((participant) => participant.participant_type === "GUEST")) {
          this.fail(409, "GUEST_BOOKING_DISABLED");
        }
        if (targetSessionState.scope === "BRANCH") {
          const branch = await transaction.branch.findUnique({ where: { id: targetSessionState.branch_id ?? -1n }, select: { code: true } });
          if (branch === null || participants.some((participant) => participant.branch_code_at_booking !== branch.code)) this.fail(409, "SESSION_BRANCH_MISMATCH");
        }
      }
      if (moved) {
        await transaction.$executeRawUnsafe("set constraints family_booking_students_family_session_fk deferred");
      }
      const updatedBooking = await transaction.familyBooking.update({
        where: { id: booking.id }, data: { sessionId: targetSession.id, attendanceParty: party, seatCount: seats, version: { increment: 1 }, updatedAt: now },
      });
      if (moved) {
        await transaction.familyBookingStudent.updateMany({ where: { familyBookingId: booking.id }, data: { sessionId: targetSession.id } });
        const targetQrExpiresAt = new Date(Math.max(
          targetSessionState.starts_at.getTime() + 6 * 60 * 60 * 1_000,
          targetSessionState.ends_at.getTime() + 60 * 60 * 1_000,
          now.getTime() + 60 * 60 * 1_000,
        ));
        await transaction.qrCredential.updateMany({
          where: { familyBookingId: booking.id, status: "ACTIVE", expiresAt: { lt: targetQrExpiresAt } },
          data: { expiresAt: targetQrExpiresAt },
        });
        const targetAccessExpiresAt = new Date(Math.max(
          targetSessionState.ends_at.getTime() + 30 * 24 * 60 * 60_000,
          now.getTime() + 30 * 24 * 60 * 60_000,
        ));
        await transaction.bookingAccessCredential.updateMany({
          where: { familyBookingId: booking.id, status: "ACTIVE", expiresAt: { lt: targetAccessExpiresAt } },
          data: { expiresAt: targetAccessExpiresAt },
        });
      }
      const event = await transaction.bookingEvent.create({ data: {
        familyBookingId: booking.id, eventType: "UPDATED", actorSubject,
        safeMetadata: { reason: input.reason, fromSessionId: snapshot.session.publicId, toSessionId: targetSessionState.session_public_id },
      } });
      const afterChildren = await this.sheetChildren(transaction, booking.id, true);
      const projection = {
        eventId: event.eventId, eventType: "UPDATED" as const, occurredAt: event.occurredAt,
        familyBookingPublicId: snapshot.publicId, bookingVersion: updatedBooking.version, bookingCreatedAt: snapshot.createdAt,
        attendanceParty: party, bookingSource: snapshot.bookingSource as "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE",
      };
      if (moved) {
        await this.sheetOutbox.enqueueBookingEvent(transaction, {
          ...projection, seminarSessionPublicId: snapshot.session.publicId,
          children: beforeChildren.map((child) => ({ ...child, active: false })),
        });
        await this.sheetOutbox.enqueueBookingEvent(transaction, {
          ...projection, seminarSessionPublicId: targetSessionState.session_public_id, children: afterChildren,
        });
      } else {
        await this.sheetOutbox.enqueueBookingEvent(transaction, {
          ...projection, seminarSessionPublicId: snapshot.session.publicId,
          children: this.unionSheetChildren(beforeChildren, afterChildren),
        });
      }
      const branch = afterChildren[0]?.branch;
      if (branch === undefined) this.fail(409, "BOOKING_BRANCH_MISSING");
      const bookingUrl = this.bookingUrl(snapshot.publicId);
      const rendered = await this.smsTemplates.renderDefault(transaction, "BOOKING_UPDATED", {
        studentName: afterChildren.map((child) => child.studentName).join(", "),
        seminarTitle: targetSessionState.seminar_title,
        sessionDateTime: this.formatSessionDateTime(targetSessionState.starts_at),
        place: targetSessionState.place,
        bookingUrl,
        inquiryPhone: this.inquiryPhone(branch),
      }, {
        key: "SYSTEM_BOOKING_UPDATED",
        body: "[늘푸른수학원] 설명회 예약 정보가 변경되었습니다. 예약 및 입장 QR 확인: {예약확인링크}",
      });
      await this.smsOutbox.enqueue(transaction, {
        eventKey: `BOOKING_UPDATED:${snapshot.publicId}:${updatedBooking.version.toString()}`,
        source: "BOOKING_UPDATED", branch, seminarSessionPublicId: targetSessionState.session_public_id,
        familyBookingPublicId: snapshot.publicId, recipientCiphertext: booking.contact_ciphertext,
        recipientDigest: booking.contact_digest, recipientLast4: booking.contact_last4,
        message: rendered.message, title: rendered.title, actorSubject,
        safeMetadata: { bookingVersion: Number(updatedBooking.version), sessionChanged: moved, ...rendered.snapshot },
      });
      const loaded = await this.load(transaction, booking.id);
      return actorSubject === null
        ? mapMaskedFamilyBookingCore(loaded, this.phoneProtector.reveal(booking.contact_ciphertext))
        : loaded;
    });
    return actorSubject === null
      ? response
      : this.attachContact(id, response as ReturnType<FamilyBookingsManagementService["mapCore"]>);
  }

  /**
   * 테스트 예약을 다시 미입장으로 되돌린다.
   *
   * **실제 입장 기록은 되돌릴 수 없다.** 오스캔은 인원을 고쳐 바로잡고, 일어난 입장은 일어난
   * 것으로 남는다. 이 경로가 존재하는 이유는 하나뿐이다 — 게이트 장비와 QR 흐름을 같은 예약으로
   * 반복 리허설하기 위해서다. 그래서 is_test 가 아닌 예약은 무조건 거절한다.
   *
   * QR 은 건드리지 않는다. 취소와 달리 예약은 살아 있고, 같은 QR 을 다시 찍어야 리허설이 된다.
   */
  public async rollbackCheckIn(id: string, actorSubject: string, key: string) {
    return this.idempotency.execute("FAMILY_BOOKING_CHECK_IN_ROLLBACK", key, { id }, async (transaction) => {
      const snapshot = await transaction.familyBooking.findUnique({
        where: { publicId: id },
        select: { id: true, sessionId: true },
      });
      if (snapshot === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
      await transaction.$executeRaw`select id from seminar_sessions where id=${snapshot.sessionId} for update`;
      const rows = await transaction.$queryRaw<Array<{ id: bigint; status: string; is_test: boolean }>>`
        select id,status,is_test from family_bookings where id=${snapshot.id} for update`;
      const booking = rows[0]!;
      if (!booking.is_test) this.fail(409, "CHECK_IN_ROLLBACK_REQUIRES_TEST_BOOKING");
      // 이미 미입장이면 되돌릴 것이 없다 — 같은 상태를 그대로 돌려준다.
      if (booking.status !== "CHECKED_IN") return this.load(transaction, booking.id);

      await transaction.familyBooking.update({
        where: { id: booking.id },
        data: {
          status: "RESERVED",
          checkedInAt: null,
          attendedCount: null,
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });
      await transaction.bookingEvent.create({
        data: {
          familyBookingId: booking.id,
          eventType: "UPDATED",
          actorSubject,
          safeMetadata: { change: "CHECK_IN_ROLLBACK", testBooking: true },
        },
      });
      return this.load(transaction, booking.id);
    });
  }

  public cancel(
    id: string, expectedVersion: number, cancellationType: BookingCancellationType,
    actorSubject: null, key: string, proofValue: string, legacyPublicReason?: string, request?: Request,
  ): Promise<PublicMaskedFamilyBooking>;
  public cancel(
    id: string, expectedVersion: number, cancellationType: BookingCancellationType,
    actorSubject: string, key: string, proofValue?: string, legacyPublicReason?: string, request?: Request,
  ): Promise<any>;
  public async cancel(
    id: string,
    expectedVersion: number,
    cancellationType: BookingCancellationType,
    actorSubject: string | null,
    key: string,
    proofValue?: string,
    legacyPublicReason?: string,
    _request?: Request,
  ) {
    if (actorSubject === null && (proofValue === undefined || proofValue.trim().length === 0)) {
      this.fail(401, "BOOKING_PROOF_INVALID");
    }
    const proofDigest = actorSubject === null
      ? createHash("sha256").update(proofValue!).digest("base64url")
      : null;
    const idempotencyRequest = cancellationType === "SELF_SERVICE"
      ? { id, expectedVersion, reason: legacyPublicReason ?? "PUBLIC_SELF_SERVICE", proofDigest }
      : { id, expectedVersion, cancellationType, proofDigest };
    const response = await this.idempotency.execute("FAMILY_BOOKING_CANCEL", key, idempotencyRequest, async (transaction) => {
      const snapshot = await transaction.familyBooking.findUnique({
        where: { publicId: id },
        select: { id: true, publicId: true, sessionId: true, createdAt: true, bookingSource: true, attendanceParty: true, session: { select: { publicId: true } } },
      });
      if (snapshot === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
      await transaction.$executeRaw`select id from seminar_sessions where id=${snapshot.sessionId} for update`;
      const rows = await transaction.$queryRaw<Array<{
        id: bigint; session_id: bigint; status: string; version: bigint; seat_count: number;
        contact_digest: Uint8Array; contact_ciphertext: Uint8Array;
      }>>`
        select id,session_id,status,version,seat_count,contact_digest,contact_ciphertext
          from family_bookings where id=${snapshot.id} for update`;
      const booking = rows[0]!;
      if (booking.session_id !== snapshot.sessionId) this.fail(409, "FAMILY_BOOKING_VERSION_CONFLICT");
      if (actorSubject === null) {
        const proof = await this.bookingProof.consume(transaction, proofValue!, "BOOKING_MANAGE");
        if (!Buffer.from(booking.contact_digest).equals(Buffer.from(proof.contactDigest))) this.fail(403, "BOOKING_PROOF_CONTACT_MISMATCH");
      }
      if (booking.status === "CANCELLED") {
        const loaded = await this.load(transaction, booking.id);
        return actorSubject === null
          ? mapMaskedFamilyBookingCore(loaded, this.phoneProtector.reveal(booking.contact_ciphertext))
          : loaded;
      }
      if (booking.version !== BigInt(expectedVersion)) this.fail(409, "FAMILY_BOOKING_VERSION_CONFLICT");
      if (booking.status !== "RESERVED") this.fail(409, "CHECKED_IN_BOOKING_CANNOT_CANCEL");
      const beforeChildren = await this.sheetChildren(transaction, booking.id, true);
      const updatedBooking = await transaction.familyBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 }, updatedAt: new Date() } });
      await transaction.familyBookingStudent.updateMany({ where: { familyBookingId: booking.id, active: true }, data: { active: false, releasedAt: new Date() } });
      await transaction.qrCredential.updateMany({ where: { familyBookingId: booking.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
      const event = await transaction.bookingEvent.create({ data: {
        familyBookingId: booking.id,
        eventType: "CANCELLED",
        actorSubject,
        cancellationType,
        safeMetadata: legacyPublicReason === undefined ? {} : { reason: legacyPublicReason },
      } });
      const delivery = await transaction.familyBooking.findUniqueOrThrow({
        where: { id: booking.id },
        select: {
          publicId: true, contactCiphertext: true, contactDigest: true, contactLast4: true,
          session: { select: { publicId: true, startsAt: true, place: true, seminar: { select: { title: true } } } },
        },
      });
      const branch = beforeChildren[0]?.branch;
      if (branch === undefined) this.fail(409, "BOOKING_BRANCH_MISSING");
      const rendered = await this.smsTemplates.renderDefault(transaction, "BOOKING_CANCELLED", {
        studentName: beforeChildren.map((child) => child.studentName).join(", "),
        seminarTitle: delivery.session.seminar.title,
        sessionDateTime: this.formatSessionDateTime(delivery.session.startsAt),
        place: delivery.session.place,
        bookingUrl: this.bookingUrl(delivery.publicId),
        inquiryPhone: this.inquiryPhone(branch),
      }, {
        key: "SYSTEM_BOOKING_CANCELLED",
        body: "[늘푸른수학원] 설명회 예약이 취소되었습니다.",
      });
      await this.smsOutbox.enqueue(transaction, {
        eventKey: `BOOKING_CANCELLED:${delivery.publicId}`,
        source: "BOOKING_CANCELLED",
        branch,
        seminarSessionPublicId: delivery.session.publicId,
        familyBookingPublicId: delivery.publicId,
        recipientCiphertext: delivery.contactCiphertext,
        recipientDigest: delivery.contactDigest,
        recipientLast4: delivery.contactLast4,
        message: rendered.message,
        title: rendered.title,
        actorSubject,
        safeMetadata: rendered.snapshot,
      });
      await this.sheetOutbox.enqueueBookingEvent(transaction, {
        eventId: event.eventId, eventType: "CANCELLED", occurredAt: event.occurredAt,
        seminarSessionPublicId: snapshot.session.publicId, familyBookingPublicId: snapshot.publicId,
        bookingVersion: updatedBooking.version, bookingCreatedAt: snapshot.createdAt,
        attendanceParty: snapshot.attendanceParty as AttendanceParty,
        bookingSource: snapshot.bookingSource as "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE",
        children: beforeChildren.map((child) => ({ ...child, active: false })),
      });
      const loaded = await this.load(transaction, booking.id);
      return actorSubject === null
        ? mapMaskedFamilyBookingCore(loaded, this.phoneProtector.reveal(booking.contact_ciphertext))
        : loaded;
    });
    return actorSubject === null
      ? response
      : this.attachContact(id, response as ReturnType<FamilyBookingsManagementService["mapCore"]>);
  }

  public async bookingEvents(id: string, afterSequence?: string, requestedLimit?: number) {
    const booking = await this.prisma.familyBooking.findUnique({ where: { publicId: id }, select: { id: true } });
    if (booking === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
    const after = afterSequence === undefined ? 0n : BigInt(afterSequence); const limit = Math.min(requestedLimit ?? 50, 200);
    const rows = await this.prisma.bookingEvent.findMany({ where: { familyBookingId: booking.id, id: { gt: after } }, orderBy: { id: "asc" }, take: limit + 1 });
    return {
      items: rows.slice(0, limit).map((row) => {
        const safeMetadata = this.safeMetadata(row.safeMetadata);
        const reason = typeof safeMetadata.reason === "string" ? safeMetadata.reason.slice(0, 500) : null;
        const scannerDeviceName = this.metadataText(safeMetadata, "scannerDeviceName");
        const scannerEntranceName = this.metadataText(safeMetadata, "scannerEntranceName");
        const scannerGateCode = this.metadataText(safeMetadata, "scannerGateCode");
        const { reason: _reason, ...metadata } = safeMetadata;
        return {
          sequence: row.id.toString(), eventId: row.eventId, familyBookingId: id, type: row.eventType,
          actor: this.bookingEventActor(row.eventType, row.actorSubject), cancellationType: row.cancellationType,
          reason, scannerDeviceName, scannerEntranceName, scannerGateCode, metadata, occurredAt: row.occurredAt,
        };
      }),
      page: { nextAfterSequence: rows.length > limit ? rows[limit - 1]!.id.toString() : null, hasMore: rows.length > limit },
    };
  }

  private bookingEventActor(eventType: string, actorSubject: string | null) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    if (actorSubject !== null && uuid.test(actorSubject)) return {
      type: eventType === "CHECKED_IN" ? "SCANNER" : "ADMIN", subjectId: actorSubject, displayName: null,
    };
    if (actorSubject !== null) return { type: "SYSTEM", subjectId: null, displayName: actorSubject.slice(0, 100) };
    if (eventType === "QR_ISSUED") return { type: "SYSTEM", subjectId: null, displayName: "system:booking" };
    return { type: "PUBLIC_PROOF", subjectId: null, displayName: null };
  }

  private safeMetadata(value: Prisma.JsonValue): Record<string, string | number | boolean | null> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean | null] =>
      entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1])));
  }

  public async checkInEvents(id: string, afterSequence?: string, requestedLimit?: number) {
    const booking = await this.prisma.familyBooking.findUnique({ where: { publicId: id }, select: { id: true } });
    if (booking === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
    const after = afterSequence === undefined ? 0n : BigInt(afterSequence); const limit = Math.min(requestedLimit ?? 50, 200);
    const rows = await this.prisma.checkInEvent.findMany({
      where: { familyBookingId: booking.id, id: { gt: after } },
      select: {
        id: true, eventId: true, source: true, result: true, seatCount: true, gateCode: true,
        safeMetadata: true, occurredAt: true,
        session: { select: { publicId: true } },
        scannerDevice: { select: { publicId: true, name: true, location: true } },
      },
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map((row) => {
        const metadata = this.safeMetadata(row.safeMetadata);
        return {
          sequence: row.id.toString(), eventId: row.eventId, source: row.source, result: row.result,
          seminarSessionId: row.session.publicId, deviceId: row.scannerDevice?.publicId ?? null,
          scannerDeviceName: this.metadataText(metadata, "scannerDeviceName") ?? row.scannerDevice?.name ?? null,
          scannerEntranceName: this.metadataText(metadata, "scannerEntranceName") ?? row.scannerDevice?.location ?? null,
          scannerGateCode: this.metadataText(metadata, "scannerGateCode") ?? row.gateCode,
          seatCount: row.seatCount, gateCode: row.gateCode, metadata, occurredAt: row.occurredAt,
        };
      }),
      page: { nextAfterSequence: rows.length > limit ? rows[limit - 1]!.id.toString() : null, hasMore: rows.length > limit },
    };
  }

  public async qrPass(rawToken: string) {
    if (rawToken.length < 43 || rawToken.length > 512) this.fail(401, "QR_INVALID");
    const digest = this.crypto.digest(rawToken);
    const row = await this.prisma.qrCredential.findUnique({
      where: { tokenDigest: this.bytes(digest) }, include: { familyBooking: { include: { session: { include: { seminar: true } } } } },
    });
    if (row === null) this.fail(404, "QR_NOT_FOUND");
    if (row.status !== "ACTIVE" || row.expiresAt <= new Date()) this.fail(410, "QR_EXPIRED_OR_REVOKED");
    return {
      seminarTitle: row.familyBooking.session.seminar.title, startsAt: row.familyBooking.session.startsAt,
      location: row.familyBooking.session.place, attendanceParty: row.familyBooking.attendanceParty,
      seatCount: row.familyBooking.seatCount,
      status: row.familyBooking.status,
      maskedContact: `***-****-${row.familyBooking.contactLast4}`,
    };
  }

  public async recoverQr(id: string, proofValue: string, request?: Request) {
    if (proofValue.trim().length > 0) {
      const proof = await this.bookingProof.authorize(proofValue, "BOOKING_MANAGE");
      const booking = await this.prisma.familyBooking.findUnique({
        where: { publicId: id },
        select: { contactDigest: true },
      });
      if (booking === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
      if (!Buffer.from(booking.contactDigest).equals(Buffer.from(proof.contactDigest))) {
        this.fail(403, "BOOKING_PROOF_CONTACT_MISMATCH");
      }
    } else {
      if (request === undefined) this.fail(401, "BOOKING_MANAGEMENT_SESSION_REQUIRED");
      await this.bookingAccess.authorize(request, id);
    }
    const credential = await this.prisma.qrCredential.findFirst({
      where: { familyBooking: { publicId: id }, status: "ACTIVE" },
      orderBy: { version: "desc" },
      select: { version: true, tokenDigest: true, tokenCiphertext: true, expiresAt: true },
    });
    if (credential === null) this.fail(404, "QR_CREDENTIAL_NOT_FOUND");
    if (credential.expiresAt <= new Date()) this.fail(410, "QR_EXPIRED_OR_REVOKED");
    if (credential.tokenCiphertext === null) this.fail(409, "QR_RECOVERY_UNAVAILABLE");
    const qrToken = this.qrTokenProtector.reveal(credential.tokenCiphertext);
    if (!Buffer.from(credential.tokenDigest).equals(this.crypto.digest(qrToken))) this.fail(500, "QR_DIGEST_MISMATCH");
    return { familyBookingId: id, version: credential.version, expiresAt: credential.expiresAt, qrToken };
  }

  public proofUnavailable(): never { throw new DomainError(503, "OTP_PROOF_UNAVAILABLE", "Booking proof verification is unavailable."); }

  private async replaceStudents(transaction: Prisma.TransactionClient, familyBookingId: bigint, sessionId: bigint, studentPublicIds: readonly string[], contactDigest: Uint8Array, scope: string, sessionBranchId: bigint | null) {
    const ids = [...new Set(studentPublicIds)].sort(); if (ids.length === 0 || ids.length !== studentPublicIds.length) this.fail(400, "STUDENT_SELECTION_INVALID");
    const students = await transaction.$queryRaw<Array<{ id: bigint; public_id: string; branch_id: bigint; source_student_no: string; name: string; class_name: string; school_name: string | null; grade: string | null; branch_code: string; mother_phone_digest: Uint8Array | null; father_phone_digest: Uint8Array | null; teacher_name: string | null; unit_name: string | null }>>`
      select s.id,s.public_id,s.branch_id,s.source_student_no,s.name,s.class_name,s.school_name,s.grade,b.code branch_code,s.mother_phone_digest,s.father_phone_digest,s.teacher_name,s.unit_name
      from students s join branches b on b.id=s.branch_id where s.public_id=any(${ids}::uuid[]) and s.source_active order by s.id for update of s`;
    if (students.length !== ids.length) this.fail(404, "STUDENT_NOT_FOUND");
    if (students.some((student) => !(
      (student.mother_phone_digest !== null && Buffer.from(student.mother_phone_digest).equals(Buffer.from(contactDigest)))
      || (student.father_phone_digest !== null && Buffer.from(student.father_phone_digest).equals(Buffer.from(contactDigest)))
    ))) this.fail(403, "STUDENT_CONTACT_OWNERSHIP_MISMATCH");
    if (scope === "BRANCH" && students.some((student) => student.branch_id !== sessionBranchId)) this.fail(409, "SESSION_BRANCH_MISMATCH");
    const activeAssignments = await transaction.studentClassAssignment.findMany({
      where: { studentId: { in: students.map((student) => student.id) }, sourceActive: true },
      select: { studentId: true, className: true, sourceActive: true },
    });
    await transaction.familyBookingStudent.updateMany({ where: { familyBookingId, active: true }, data: { active: false, releasedAt: new Date() } });
    for (const student of students) {
      const existing = await transaction.familyBookingStudent.findUnique({ where: { familyBookingId_studentId: { familyBookingId, studentId: student.id } } });
      const teacherNameSnapshot = currentStudentMathHomeroomTeacher({
        teacherName: student.teacher_name,
        assignments: activeAssignments.filter((assignment) => assignment.studentId === student.id),
      });
      const data = { sessionId, active: true, releasedAt: null, branchCodeAtBooking: student.branch_code, sourceStudentNoSnapshot: student.source_student_no, studentNameSnapshot: student.name, classNameSnapshot: student.class_name, schoolNameSnapshot: student.school_name, gradeSnapshot: student.grade, unitNameSnapshot: student.unit_name, teacherNameSnapshot };
      if (existing === null) await transaction.familyBookingStudent.create({ data: { familyBookingId, participantType: "ENROLLED", studentId: student.id, ...data } });
      else await transaction.familyBookingStudent.update({ where: { id: existing.id }, data });
    }
  }

  private async sheetChildren(transaction: Prisma.TransactionClient, familyBookingId: bigint, activeOnly: boolean): Promise<SheetBookingChildSnapshot[]> {
    const links = await transaction.familyBookingStudent.findMany({
      where: { familyBookingId, ...(activeOnly ? { active: true } : {}) },
      select: {
        publicId: true, active: true, participantType: true, sourceStudentNoSnapshot: true, studentNameSnapshot: true,
        branchCodeAtBooking: true, unitNameSnapshot: true, teacherNameSnapshot: true,
        schoolNameSnapshot: true, gradeSnapshot: true, student: { select: {
          publicId: true,
          teacherName: true,
          assignments: { select: { className: true, sourceActive: true } },
        } },
      },
      orderBy: { id: "asc" },
    });
    return links.map((link) => ({
      familyBookingStudentPublicId: link.publicId, studentPublicId: link.student?.publicId ?? link.publicId,
      sourceStudentNo: link.sourceStudentNoSnapshot, studentName: link.studentNameSnapshot,
      branch: link.branchCodeAtBooking as "SONGPA" | "WIRYE" | "GWANGJIN",
      unitName: link.unitNameSnapshot,
      teacherName: link.participantType === "GUEST"
        ? null
        : currentOrHistoricMathHomeroomTeacher(link.student, link.teacherNameSnapshot),
      schoolName: link.schoolNameSnapshot, grade: link.gradeSnapshot, active: link.active,
    }));
  }

  private unionSheetChildren(before: readonly SheetBookingChildSnapshot[], after: readonly SheetBookingChildSnapshot[]): SheetBookingChildSnapshot[] {
    const current = new Map(after.map((child) => [child.familyBookingStudentPublicId, child]));
    for (const child of before) if (!current.has(child.familyBookingStudentPublicId)) current.set(child.familyBookingStudentPublicId, { ...child, active: false });
    return [...current.values()];
  }

  private include() { return { session: true, students: { include: { student: { select: {
    publicId: true,
    teacherName: true,
    assignments: { select: { className: true, sourceActive: true } },
  } } }, orderBy: { id: "asc" as const } }, qrCredentials: { orderBy: { version: "desc" as const }, take: 1 } }; }
  private async load(transaction: Prisma.TransactionClient, id: bigint) { return this.mapCore(await transaction.familyBooking.findUniqueOrThrow({ where: { id }, include: this.include() })); }
  private map(row: any) { return { ...this.mapCore(row), contact: this.phoneProtector.reveal(row.contactCiphertext) }; }
  private mapCore(row: any) {
    const qr = row.qrCredentials[0];
    return {
      familyBookingId: row.publicId,
      seminarSessionId: row.session.publicId,
      attendanceParty: row.attendanceParty,
      bookingSource: row.bookingSource,
      seatCount: row.seatCount,
      status: row.status,
      students: this.currentStudentLinks(row.students).map((link: any) => ({
        familyBookingStudentId: link.publicId,
        participantType: link.participantType,
        studentId: link.student?.publicId ?? null,
        sourceStudentNo: link.sourceStudentNoSnapshot,
        name: link.studentNameSnapshot,
        branch: link.branchCodeAtBooking,
        representativeClassName: link.classNameSnapshot,
        schoolName: link.schoolNameSnapshot,
        grade: link.gradeSnapshot,
        unitName: canonicalUnitName(link.classNameSnapshot),
        teacherName: link.participantType === "GUEST"
          ? null
          : currentOrHistoricMathHomeroomTeacher(link.student, link.teacherNameSnapshot),
      })),
      qrStatus: qr?.status ?? "REVOKED",
      qrVersion: qr?.version ?? 1,
      version: Number(row.version),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      checkedInAt: row.checkedInAt,
      attendedCount: row.attendedCount ?? null,
      isTest: row.isTest === true,
      cancelledAt: row.cancelledAt,
    };
  }
  private currentStudentLinks(links: readonly any[]) {
    const active = links.filter((link) => link.active === true);
    if (active.length > 0) return active;
    const latestRelease = Math.max(...links.map((link) => link.releasedAt instanceof Date ? link.releasedAt.getTime() : -1));
    return links.filter((link) => link.releasedAt instanceof Date && link.releasedAt.getTime() === latestRelease);
  }
  private async attachContact(id: string, response: ReturnType<FamilyBookingsManagementService["mapCore"]>) {
    const booking = await this.prisma.familyBooking.findUnique({ where: { publicId: id }, select: { contactCiphertext: true } });
    if (booking === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
    return { ...response, contact: this.phoneProtector.reveal(booking.contactCiphertext) };
  }
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> { const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy; }
  private bookingUrl(familyBookingId: string): string {
    const base = this.environment.publicBaseUrl ?? "https://invalid.local";
    return new URL(`/booking/${encodeURIComponent(familyBookingId)}`, base).toString();
  }
  private formatSessionDateTime(value: Date): string {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(value);
  }
  private inquiryPhone(branch: SmsBranch): string {
    return ({ SONGPA: "02-413-2652", WIRYE: "02-425-2652", GWANGJIN: "02-422-2652" } as const)[branch];
  }
  private metadataText(metadata: Readonly<Record<string, string | number | boolean | null>>, key: string): string | null {
    const value = metadata[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The family booking operation could not be completed."); }
}
