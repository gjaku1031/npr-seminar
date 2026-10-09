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

/**
 * 예약 변경 입력. seminarSessionId 옮길 회차, attendanceParty 참석 보호자, studentIds 교체할 재원생, expectedVersion 현재 버전, reason 감사 사유
 */
interface UpdateInput { readonly seminarSessionId?: string; readonly attendanceParty?: AttendanceParty; readonly studentIds?: readonly string[]; readonly expectedVersion: number; readonly reason: string; }

/**
 * include()가 조회하는 예약 행
 */
type BookingRow = Prisma.FamilyBookingGetPayload<{
  /**
   * 예약 상세 include 조건
   */
  include: ReturnType<FamilyBookingsManagementService["include"]>;
}>;

/**
 * 멱등 재생은 JSON 저장값을 돌려주므로 날짜가 문자열일 수 있는 예약 응답
 */
type ReplayableBookingDates<T> = Omit<T, "createdAt" | "updatedAt" | "checkedInAt" | "cancelledAt"> & {
  /**
   * 생성 시각. 재생 응답이면 문자열
   */
  readonly createdAt: Date | string;

  /**
   * 변경 시각
   */
  readonly updatedAt: Date | string;

  /**
   * 입장 시각
   */
  readonly checkedInAt: Date | string | null;

  /**
   * 취소 시각
   */
  readonly cancelledAt: Date | string | null;
};

/**
 * 관리자 예약 조회·변경·취소 응답. 공개 응답과 달리 연락처 포함
 */
type AdminFamilyBooking = ReplayableBookingDates<Awaited<ReturnType<FamilyBookingsManagementService["get"]>>>;

/**
 * 예약 조회·변경·취소
 *
 * 관리자 응답은 연락처 포함, 공개 응답은 마스킹해 연락처 공개 경계 유지
 */
@Injectable()
export class FamilyBookingsManagementService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 멱등 처리
     */
    private readonly idempotency: IdempotencyService,

    /**
     * 토큰 발급·다이제스트
     */
    private readonly crypto: BookingCryptoService,

    /**
     * 문자 대기열
     */
    private readonly smsOutbox: SmsOutboxService,

    /**
     * 문자 템플릿
     */
    private readonly smsTemplates: SmsTemplateCatalog,

    /**
     * 시트 반영 대기열
     */
    private readonly sheetOutbox: SheetOutboxService,

    /**
     * OTP 예약 증명
     */
    private readonly bookingProof: BookingProofService,

    /**
     * 연락처 보호
     */
    private readonly phoneProtector: PhoneProtector,

    /**
     * 예약 관리 세션
     */
    private readonly bookingAccess: BookingAccessService,

    /**
     * QR 원문 복호화
     */
    private readonly qrTokenProtector: QrTokenProtector,

    /**
     * 실행 환경. 공개 기준 URL
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * 관리자 예약 목록. 생성 역순
   *
   * 캠퍼스·검색어는 활성 참가자 기준. 검색어가 숫자 4자리면 연락처 끝 4자리도 검색
   */
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

  /**
   * 관리자 예약 상세
   *
   * @throws {DomainError} 404 FAMILY_BOOKING_NOT_FOUND
   */
  public async get(id: string) {
    const row = await this.prisma.familyBooking.findUnique({ where: { publicId: id }, include: this.include() });
    if (row === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
    return this.map(row);
  }

  /**
   * 공개 예약 상세. 마스킹 응답
   *
   * 예약 증명이 있으면 증명 연락처와 예약 연락처 일치 확인, 없으면 예약 관리 세션 확인
   *
   * @throws {DomainError} 404 없음, 403 증명 연락처 불일치, 401 증명·세션 없음
   */
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

  /**
   * 예약 증명 연락처의 예약 최대 100건. 최신순, 마스킹 응답
   *
   * @throws {DomainError} 401 증명 무효, 403 용도 불일치
   */
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

  /**
   * 공개 변경. 응답은 마스킹
   */
  public update(id: string, input: UpdateInput, actorSubject: null, key: string, proofValue: string, request?: Request): Promise<PublicMaskedFamilyBooking>;

  /**
   * 관리자 변경. 응답은 연락처 포함, 멱등 재생 시 날짜는 문자열일 수 있음
   */
  public update(id: string, input: UpdateInput, actorSubject: string, key: string, proofValue?: string, request?: Request): Promise<AdminFamilyBooking>;

  /**
   * 예약 변경
   *
   * 1. 공개 변경은 예약 증명 필수
   * 2. 원래 회차와 옮길 회차를 ID 순으로 잠근 뒤 예약 행 잠금
   * 3. 공개 변경은 증명 소비와 연락처 일치 확인
   * 4. 버전 일치·RESERVED 상태 확인. 회차를 옮기면 대상 회차 OPEN·예약 기간·중복 예약 확인
   * 5. 학생 교체(비재원생 예약은 불가) 또는 회차 이동 시 참가자 연락처 소유·캠퍼스 재확인
   * 6. 예약 갱신, 회차 이동이면 참가자 회차 변경과 QR·관리 링크 만료 연장
   * 7. 변경 이벤트·시트 반영(이동 시 기존 회차는 해제, 새 회차는 추가)·변경 문자 적재
   *
   * 모두 하나의 멱등 트랜잭션. 실패 시 증명 소비를 포함해 전체 롤백
   *
   * @throws {DomainError} 401 증명 없음, 403 연락처 불일치, 404 예약·회차 없음, 409 버전 충돌·변경 불가·중복 예약
   */
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
      // 원래 회차와 대상 회차를 ID 순으로 잠가 교착 방지
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
      // 예약 행 잠금 후 잠금 전 조회한 회차가 그대로인지 확인
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
      // 대상 회차에 같은 연락처의 활성 예약이 있으면 거부
      if (moved) {
        const duplicate = await transaction.familyBooking.findFirst({
          where: {
            id: { not: booking.id }, sessionId: targetSession.id,
            contactDigest: this.bytes(booking.contact_digest), status: { in: ["RESERVED", "CHECKED_IN"] },
          },
          select: { id: true },
        });
        if (duplicate !== null) this.fail(409, "ACTIVE_FAMILY_BOOKING_EXISTS");
      }
      // 변경 전 참가자 스냅샷. 시트에서 빠진 학생 해제 반영에 사용
      const beforeChildren = await this.sheetChildren(transaction, booking.id, true);
      if (input.studentIds !== undefined) {
        const guestParticipant = await transaction.familyBookingStudent.findFirst({
          where: { familyBookingId: booking.id, active: true, participantType: "GUEST" }, select: { id: true },
        });
        if (guestParticipant !== null) this.fail(409, "GUEST_PARTICIPANT_IMMUTABLE");
        await this.replaceStudents(transaction, booking.id, targetSession.id, input.studentIds, booking.contact_digest, targetSessionState.scope, targetSessionState.branch_id);
      // 회차만 옮기는 경우 기존 참가자의 연락처 소유·비재원생 허용·캠퍼스 재확인
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
      // 회차 이동 시 예약과 참가자의 회차를 함께 바꾸므로 복합 외래 키 검사를 커밋 시점으로 미룸
      if (moved) {
        await transaction.$executeRawUnsafe("set constraints family_booking_students_family_session_fk deferred");
      }
      const updatedBooking = await transaction.familyBooking.update({
        where: { id: booking.id }, data: { sessionId: targetSession.id, attendanceParty: party, seatCount: seats, version: { increment: 1 }, updatedAt: now },
      });
      if (moved) {
        await transaction.familyBookingStudent.updateMany({ where: { familyBookingId: booking.id }, data: { sessionId: targetSession.id } });
        // 회차 이동 시 QR·관리 링크 만료를 새 회차 기준으로 연장. 줄이지는 않음
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
      // 시트 반영: 이동이면 기존 회차에 해제, 새 회차에 추가. 같은 회차면 변경 전후 학생 합집합
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
      // 변경 문자. 이벤트 키에 예약 버전을 넣어 변경마다 한 번 적재
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
        body: "[예시학원] 설명회 예약 정보가 변경되었습니다. 예약 및 입장 QR 확인: {예약확인링크}",
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
    // 관리자 응답은 커밋 후 연락처를 다시 붙임
    return actorSubject === null
      ? response
      : this.attachContact(id, response as ReplayableBookingDates<ReturnType<FamilyBookingsManagementService["mapCore"]>>);
  }

  /**
   * 테스트 예약 캠퍼스 변경. 테스트 예약 전용
   *
   * 문자 발송은 캠퍼스별로 대상을 고르므로 세 캠퍼스 발송을 확인하려면 리허설 예약을 옮겨야 함
   * 캠퍼스마다 테스트 예약을 만들면 명단·집계에 가짜 행이 늘어나므로 하나를 옮김
   * 실제 예약에는 쓸 수 없음. 실제 가족의 캠퍼스는 예약 시점 사실이며 바꾸면 이미 나간 문자·시트와 어긋남
   * 캠퍼스는 참가자 행(branch_code_at_booking)에 있고 테스트 예약은 비재원생 한 명이라 그 행만 변경
   *
   * @throws {DomainError} 404 예약 없음, 409 테스트 예약 아님
   */
  public async changeTestBookingBranch(id: string, branch: string, actorSubject: string, key: string) {
    return this.idempotency.execute("FAMILY_BOOKING_TEST_BRANCH", key, { id, branch }, async (transaction) => {
      const snapshot = await transaction.familyBooking.findUnique({
        where: { publicId: id },
        select: { id: true, sessionId: true },
      });
      if (snapshot === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
      // 회차 → 예약 순으로 잠금
      await transaction.$executeRaw`select id from seminar_sessions where id=${snapshot.sessionId} for update`;
      const rows = await transaction.$queryRaw<Array<{ id: bigint; is_test: boolean }>>`
        select id,is_test from family_bookings where id=${snapshot.id} for update`;
      const booking = rows[0]!;
      if (!booking.is_test) this.fail(409, "BRANCH_CHANGE_REQUIRES_TEST_BOOKING");

      await transaction.familyBookingStudent.updateMany({
        where: { familyBookingId: booking.id, active: true },
        data: { branchCodeAtBooking: branch },
      });
      await transaction.familyBooking.update({
        where: { id: booking.id },
        data: { version: { increment: 1 }, updatedAt: new Date() },
      });
      await transaction.bookingEvent.create({
        data: {
          familyBookingId: booking.id,
          eventType: "UPDATED",
          actorSubject,
          safeMetadata: { change: "TEST_BRANCH", branch, testBooking: true },
        },
      });
      return this.load(transaction, booking.id);
    });
  }

  /**
   * 테스트 예약 입장 취소. 다시 미입장 상태로 되돌림
   *
   * 실제 입장 기록은 되돌릴 수 없음. 잘못 찍은 입장은 인원을 고쳐 바로잡고, 일어난 입장은 그대로 남김
   * 게이트 장비와 QR 흐름을 같은 예약으로 반복 리허설하기 위한 경로라 테스트 예약이 아니면 거부
   * QR은 그대로 둠. 취소와 달리 예약은 유효하고 같은 QR을 다시 찍어야 리허설이 됨
   *
   * @throws {DomainError} 404 예약 없음, 409 테스트 예약 아님
   */
  public async rollbackCheckIn(id: string, actorSubject: string, key: string) {
    return this.idempotency.execute("FAMILY_BOOKING_CHECK_IN_ROLLBACK", key, { id }, async (transaction) => {
      const snapshot = await transaction.familyBooking.findUnique({
        where: { publicId: id },
        select: { id: true, sessionId: true },
      });
      if (snapshot === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
      // 회차 → 예약 순으로 잠금
      await transaction.$executeRaw`select id from seminar_sessions where id=${snapshot.sessionId} for update`;
      const rows = await transaction.$queryRaw<Array<{ id: bigint; status: string; is_test: boolean }>>`
        select id,status,is_test from family_bookings where id=${snapshot.id} for update`;
      const booking = rows[0]!;
      if (!booking.is_test) this.fail(409, "CHECK_IN_ROLLBACK_REQUIRES_TEST_BOOKING");
      // 이미 미입장이면 되돌릴 것이 없어 현재 상태 반환
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

  /**
   * 공개 취소. 응답은 마스킹
   */
  public cancel(
    id: string, expectedVersion: number, cancellationType: BookingCancellationType,
    actorSubject: null, key: string, proofValue: string, legacyPublicReason?: string, request?: Request,
  ): Promise<PublicMaskedFamilyBooking>;

  /**
   * 관리자 취소. 응답은 연락처 포함, 멱등 재생 시 날짜는 문자열일 수 있음
   */
  public cancel(
    id: string, expectedVersion: number, cancellationType: BookingCancellationType,
    actorSubject: string, key: string, proofValue?: string, legacyPublicReason?: string, request?: Request,
  ): Promise<AdminFamilyBooking>;

  /**
   * 예약 취소
   *
   * 1. 공개 취소는 예약 증명 필수
   * 2. 회차 → 예약 순으로 잠금, 공개 취소는 증명 소비와 연락처 일치 확인
   * 3. 이미 취소된 예약은 현재 상태 반환
   * 4. 버전 일치·RESERVED 상태 확인. 입장한 예약은 취소 불가
   * 5. 예약 취소, 참가자 해제, ACTIVE QR 폐기, 취소 이벤트·문자·시트 해제 반영
   *
   * 하나의 멱등 트랜잭션. 요청 다이제스트에는 공개 취소는 사유, 관리자 취소는 취소 유형을 포함
   *
   * @param legacyPublicReason 공개 취소 사유. 이벤트 메타데이터에 기록
   * @throws {DomainError} 401 증명 없음, 403 연락처 불일치, 404 예약 없음, 409 버전 충돌·입장 완료
   */
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
      // 회차 → 예약 순으로 잠금
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
      // 이미 취소된 예약은 같은 결과로 응답
      if (booking.status === "CANCELLED") {
        const loaded = await this.load(transaction, booking.id);
        return actorSubject === null
          ? mapMaskedFamilyBookingCore(loaded, this.phoneProtector.reveal(booking.contact_ciphertext))
          : loaded;
      }
      if (booking.version !== BigInt(expectedVersion)) this.fail(409, "FAMILY_BOOKING_VERSION_CONFLICT");
      if (booking.status !== "RESERVED") this.fail(409, "CHECKED_IN_BOOKING_CANNOT_CANCEL");
      // 취소 전 참가자 스냅샷. 문자 학생 이름과 시트 해제 반영에 사용
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
        body: "[예시학원] 설명회 예약이 취소되었습니다.",
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
      : this.attachContact(id, response as ReplayableBookingDates<ReturnType<FamilyBookingsManagementService["mapCore"]>>);
  }

  /**
   * 예약 이벤트 커서 조회
   *
   * 사유는 최대 500자로 분리하고 스캐너 정보는 메타데이터에서 추출
   *
   * @param requestedLimit 최대 200, 기본 50
   * @throws {DomainError} 404 예약 없음
   */
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

  /**
   * 이벤트 처리 주체 표시
   *
   * UUID 주체는 입장 이벤트면 스캐너, 그 외 관리자. 그 밖의 문자열은 시스템, QR 발급은 시스템, 주체 없음은 공개 예약 증명
   */
  private bookingEventActor(eventType: string, actorSubject: string | null) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    if (actorSubject !== null && uuid.test(actorSubject)) return {
      type: eventType === "CHECKED_IN" ? "SCANNER" : "ADMIN", subjectId: actorSubject, displayName: null,
    };
    if (actorSubject !== null) return { type: "SYSTEM", subjectId: null, displayName: actorSubject.slice(0, 100) };
    if (eventType === "QR_ISSUED") return { type: "SYSTEM", subjectId: null, displayName: "system:booking" };
    return { type: "PUBLIC_PROOF", subjectId: null, displayName: null };
  }

  /**
   * JSON 메타데이터에서 문자열·숫자·불리언·null 값만 남긴 객체
   */
  private safeMetadata(value: Prisma.JsonValue): Record<string, string | number | boolean | null> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean | null] =>
      entry[1] === null || ["string", "number", "boolean"].includes(typeof entry[1])));
  }

  /**
   * 예약 입장 이벤트 커서 조회. 스캐너 표시 정보는 입장 당시 메타데이터 우선
   *
   * @param requestedLimit 최대 200, 기본 50
   * @throws {DomainError} 404 예약 없음
   */
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

  /**
   * QR 토큰으로 입장권 정보 조회. 연락처는 끝 4자리만
   *
   * @throws {DomainError} 401 토큰 길이 오류, 404 없음, 410 만료·폐기
   */
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

  /**
   * 공개 예약 QR 재표시
   *
   * 예약 증명 또는 예약 관리 세션 확인 후 최신 ACTIVE QR의 원문을 복호화하고 다이제스트로 대조
   *
   * @throws {DomainError} 401 증명·세션 없음, 403 연락처 불일치, 404 QR 없음, 409 원문 보관 안 됨, 410 만료, 500 다이제스트 불일치
   */
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

  /**
   * 예약 증명 확인 불가 오류 발생
   *
   * @throws {DomainError} 503 OTP_PROOF_UNAVAILABLE
   */
  public proofUnavailable(): never { throw new DomainError(503, "OTP_PROOF_UNAVAILABLE", "Booking proof verification is unavailable."); }

  /**
   * 재원생 참가자 전체 교체
   *
   * 학생 ID 순으로 잠그고 연락처 소유·지점 회차 캠퍼스 확인 후 기존 참가자 해제
   * 이전에 연결된 학생은 기존 행을 다시 활성화, 새 학생은 행 생성. 스냅샷은 현재 원장 값
   *
   * @throws {DomainError} 400 중복·빈 목록, 403 연락처 불일치, 404 학생 없음, 409 캠퍼스 불일치
   */
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

  /**
   * 시트 반영용 참가자 스냅샷
   *
   * @param activeOnly true면 현재 참가자만
   */
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
      branch: link.branchCodeAtBooking as "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C",
      unitName: link.unitNameSnapshot,
      teacherName: link.participantType === "GUEST"
        ? null
        : currentOrHistoricMathHomeroomTeacher(link.student, link.teacherNameSnapshot),
      schoolName: link.schoolNameSnapshot, grade: link.gradeSnapshot, active: link.active,
    }));
  }

  /**
   * 변경 후 참가자에 변경 전에만 있던 참가자를 해제 상태로 더한 합집합
   */
  private unionSheetChildren(before: readonly SheetBookingChildSnapshot[], after: readonly SheetBookingChildSnapshot[]): SheetBookingChildSnapshot[] {
    const current = new Map(after.map((child) => [child.familyBookingStudentPublicId, child]));
    for (const child of before) if (!current.has(child.familyBookingStudentPublicId)) current.set(child.familyBookingStudentPublicId, { ...child, active: false });
    return [...current.values()];
  }

  /**
   * 예약 상세 매핑에 필요한 관계. 참가자, 학생 원장 담임·수강 등록, 최신 QR 1건
   */
  private include() { return { session: true, students: { include: { student: { select: {
    publicId: true,
    teacherName: true,
    assignments: { select: { className: true, sourceActive: true } },
  } } }, orderBy: { id: "asc" as const } }, qrCredentials: { orderBy: { version: "desc" as const }, take: 1 } } as const satisfies Prisma.FamilyBookingInclude; }

  /**
   * 트랜잭션 안에서 예약을 다시 읽어 연락처 제외 응답으로 변환
   */
  private async load(transaction: Prisma.TransactionClient, id: bigint) { return this.mapCore(await transaction.familyBooking.findUniqueOrThrow({ where: { id }, include: this.include() })); }

  /**
   * 관리자 응답. 연락처 복호화 포함
   */
  private map(row: BookingRow) { return { ...this.mapCore(row), contact: this.phoneProtector.reveal(row.contactCiphertext) }; }

  /**
   * 공개·관리자 응답 공통 필드. 연락처 제외
   *
   * 참가자는 현재 참가자, 없으면 마지막 해제 참가자. QR이 없으면 상태 REVOKED·버전 1
   */
  private mapCore(row: BookingRow) {
    const qr = row.qrCredentials[0];
    return {
      familyBookingId: row.publicId,
      seminarSessionId: row.session.publicId,
      attendanceParty: row.attendanceParty,
      bookingSource: row.bookingSource,
      seatCount: row.seatCount,
      status: row.status,
      students: this.currentStudentLinks(row.students).map((link) => ({
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

  /**
   * 활성 참가자 우선, 없으면 마지막 해제 시각의 참가자
   */
  private currentStudentLinks(links: readonly BookingRow["students"][number][]) {
    const active = links.filter((link) => link.active === true);
    if (active.length > 0) return active;
    const latestRelease = Math.max(...links.map((link) => link.releasedAt instanceof Date ? link.releasedAt.getTime() : -1));
    return links.filter((link) => link.releasedAt instanceof Date && link.releasedAt.getTime() === latestRelease);
  }

  /**
   * 관리자 응답에 연락처 추가. 멱등 재생 응답에도 최신 암호문을 조회해 붙임
   *
   * @throws {DomainError} 404 예약 없음
   */
  private async attachContact(id: string, response: ReplayableBookingDates<ReturnType<FamilyBookingsManagementService["mapCore"]>>) {
    const booking = await this.prisma.familyBooking.findUnique({ where: { publicId: id }, select: { contactCiphertext: true } });
    if (booking === null) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
    return { ...response, contact: this.phoneProtector.reveal(booking.contactCiphertext) };
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> { const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy; }

  /**
   * 예약 확인 링크. 공개 기준 URL의 /booking/{예약 ID}
   */
  private bookingUrl(familyBookingId: string): string {
    const base = this.environment.publicBaseUrl ?? "https://invalid.local";
    return new URL(`/booking/${encodeURIComponent(familyBookingId)}`, base).toString();
  }

  /**
   * 회차 일시 문자 표기. 서울 시간, ko-KR 형식
   */
  private formatSessionDateTime(value: Date): string {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(value);
  }

  /**
   * 캠퍼스별 문의 전화번호
   */
  private inquiryPhone(branch: SmsBranch): string {
    return ({ CAMPUS_A: "02-000-0001", CAMPUS_B: "02-000-0002", CAMPUS_C: "02-000-0003" } as const)[branch];
  }

  /**
   * 메타데이터 문자열 값. 없거나 빈 문자열이면 null
   */
  private metadataText(metadata: Readonly<Record<string, string | number | boolean | null>>, key: string): string | null {
    const value = metadata[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  /**
   * 예약 관리 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The family booking operation could not be completed."); }
}
