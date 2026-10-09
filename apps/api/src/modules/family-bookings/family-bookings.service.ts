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
import { SmsTemplateCatalog } from "../sms/sms-template-catalog.service.js";
import type { AppEnvironment } from "../../common/config/environment.js";
import { SheetOutboxService } from "../google-sheets/sheet-outbox.service.js";
import { currentStudentMathHomeroomTeacher } from "../student-sync/student-homeroom-policy.js";
import { QrTokenProtector } from "./qr-token-protector.service.js";

/**
 * 비재원생 학년 선택지
 */
export const GUEST_GRADES = ["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"] as const;

/**
 * 비재원생 학년
 */
export type GuestGrade = typeof GUEST_GRADES[number];

/**
 * 예약 생성 요청
 */
export interface CreateFamilyBookingRequest {
  /**
   * 회차 공개 ID
   */
  readonly sessionId: string;

  /**
   * 공개 예약의 OTP 예약 증명. 관리자 예약은 생략
   */
  readonly bookingProof?: string;

  /**
   * 관리자 예약의 보호자 연락처. 공개 예약은 증명의 연락처 사용
   */
  readonly contact?: string;

  /**
   * 참석 보호자
   */
  readonly attendanceParty: AttendanceParty;

  /**
   * 참여 유형
   */
  readonly participantType: "ENROLLED" | "GUEST";

  /**
   * 관리자 재원생 예약의 학생 공개 ID. 공개 재원생 예약은 증명 연락처로 찾은 학생 전체
   */
  readonly studentIds?: readonly string[];

  /**
   * 비재원생 정보
   */
  readonly guest?: {
    /**
     * 이름
     */
    readonly name: string;

    /**
     * 캠퍼스
     */
    readonly branch: SmsBranch;

    /**
     * 학교
     */
    readonly schoolName: string;

    /**
     * 학년
     */
    readonly grade: string;
  };

  /**
   * 관리자 대리 예약 정보. 있으면 OTP 대신 관리자 감사 증명 생성
   */
  readonly adminOverride?: { readonly actorSubject: string; readonly reason: string; readonly bookingSource: "PHONE" | "TEACHER" | "ON_SITE" };
}

/**
 * 예약 생성 결과
 */
export interface FamilyBookingResult {
  /**
   * 가족 예약 공개 ID
   */
  readonly familyBookingId: string;

  /**
   * 회차 공개 ID
   */
  readonly sessionId: string;

  /**
   * 참석 보호자
   */
  readonly attendanceParty: AttendanceParty;

  /**
   * 예약 인원
   */
  readonly seatCount: number;

  /**
   * 예약 상태
   */
  readonly status: string;

  /**
   * 예약 학생 공개 ID 목록. 비재원생 예약은 빈 목록
   */
  readonly studentIds: readonly string[];

  /**
   * QR 원문. 최초 생성 응답에만 있고 재생이면 null
   */
  readonly qrToken: string | null;

  /**
   * QR 만료 시각. 재생이면 null
   */
  readonly qrExpiresAt: Date | null;

  /**
   * 같은 키 재요청으로 재생했는지 여부
   */
  readonly replayed: boolean;
}

/**
 * 가족 예약 생성
 *
 * 예약·참가자·QR·관리 링크·이벤트·확정 문자·시트 반영을 하나의 트랜잭션으로 기록
 */
@Injectable()
export class FamilyBookingsService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 연락처 보호
     */
    private readonly phoneProtector: PhoneProtector,

    /**
     * 토큰 발급·다이제스트
     */
    private readonly crypto: BookingCryptoService,

    /**
     * QR 원문 암호화
     */
    private readonly qrTokenProtector: QrTokenProtector,

    /**
     * OTP 예약 증명 소비
     */
    private readonly otpProof: OtpProofPort,

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
     * 실행 환경. 공개 기준 URL
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * 가족 예약 생성
   *
   * 1. 참가자 입력 형식 확인(재원생 1~10명 중복 없음, 비재원생 정보 필수)과 비재원생 값 정규화
   * 2. 트랜잭션 밖에서 QR·관리 링크 토큰 발급
   * 3. 멱등 키 advisory lock 후 같은 요청이면 저장 결과 재생(QR 원문 제외)
   * 4. 회차 행 잠금, OPEN·공개 설명회·예약 기간 확인(관리자는 미공개 설명회 허용)
   * 5. 공개 예약은 OTP 증명 소비, 관리자 예약은 관리자 감사 증명 생성
   * 6. 학생 행 잠금과 연락처 소유 확인, 지점 회차면 캠퍼스 일치 확인
   * 7. 같은 회차·연락처의 활성 예약이 있으면 거부
   * 8. 예약·참가자 스냅샷·QR·관리 링크·이벤트 생성, 확정 문자와 시트 반영 적재, 멱등 응답 저장
   *
   * READ COMMITTED 격리, 제한 시간 10초. 실패 시 증명 소비를 포함한 전체가 롤백
   *
   * @returns 최초 생성에만 QR 원문 포함
   * @throws {DomainError} 400 입력 오류, 403 연락처 소유 불일치, 404 학생 없음, 409 예약 불가·중복 예약·키 재사용
   */
  public async create(request: CreateFamilyBookingRequest, idempotencyKey: string): Promise<FamilyBookingResult> {
    // 참가자 입력 형식 확인
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
    // 멱등 요청 다이제스트. 증명·연락처는 다이제스트로만 포함
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
    // 토큰 발급과 QR 암호화는 잠금 전에 수행해 트랜잭션 시간 단축
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

      // 회차 행 잠금으로 같은 회차의 동시 예약 직렬화
      const sessionStates = await transaction.$queryRaw<Array<{
        session_id: bigint; session_public_id: string; status: string; starts_at: Date;
        ends_at: Date; guest_booking_enabled: boolean; seminar_status: string;
        seminar_title: string; place: string;
        booking_opens_at: Date | null; booking_closes_at: Date | null;
        scope: string; branch_id: bigint | null;
      }>>`select ss.id session_id,ss.public_id session_public_id,ss.status,ss.starts_at,ss.ends_at,
                 se.title seminar_title,ss.place,
                 ss.guest_booking_enabled,se.status seminar_status,ss.booking_opens_at,
                 ss.scope,ss.branch_id,
                 ss.booking_closes_at
            from seminar_sessions ss
            join seminars se on se.id=ss.seminar_id
           where ss.public_id=${request.sessionId}::uuid for update of ss`;
      const sessionState = sessionStates[0];
      if (sessionState === undefined || sessionState.status !== "OPEN"
        || (request.adminOverride === undefined && sessionState.seminar_status !== "PUBLISHED")) {
        this.fail(409, "SESSION_NOT_BOOKABLE");
      }
      const now = new Date();
      if ((sessionState.booking_opens_at !== null && now < sessionState.booking_opens_at)
        || (sessionState.booking_closes_at !== null && now > sessionState.booking_closes_at)) this.fail(409, "BOOKING_WINDOW_CLOSED");
      // 공개 예약은 OTP 증명을 1회 소비, 관리자 예약은 소비 완료 상태의 관리자 감사 증명 생성
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
      // 관리자 예약: 지정한 재원생 학생을 ID 순으로 잠금
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
      // 공개 예약: 증명 연락처와 일치하는 학생을 잠그고 선택 캠퍼스 학생만 사용
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
          // 재원생 연락처는 비재원생 경로로 예약할 수 없음
          if (matchingStudents.length > 0) this.fail(409, "ENROLLED_CONTACT_MUST_USE_ENROLLED_FLOW");
          if (guest === null) this.fail(400, "PARTICIPANT_INPUT_INVALID");
          if (!sessionState.guest_booking_enabled) this.fail(409, "GUEST_BOOKING_DISABLED");
          if (guest.branch !== selectedBranch) this.fail(400, "GUEST_CAMPUS_MISMATCH");
          studentIds = [];
        }
      }
      const activeAssignments = students.length === 0 ? [] : await transaction.studentClassAssignment.findMany({
        where: { studentId: { in: students.map((student) => student.id) }, sourceActive: true },
        select: { studentId: true, className: true, sourceActive: true },
      });
      // 모든 학생의 어머니·아버지 연락처 중 하나가 예약 연락처와 일치해야 함
      if (students.some((student) => !(
        (student.mother_phone_digest !== null && this.equal(student.mother_phone_digest, protectedContact.digest))
        || (student.father_phone_digest !== null && this.equal(student.father_phone_digest, protectedContact.digest))
      ))) {
        this.fail(403, "STUDENT_CONTACT_OWNERSHIP_MISMATCH");
      }
      const guestBranch = guest === null ? null : await transaction.branch.findUnique({ where: { code: guest.branch } });
      if (guest !== null && (guestBranch === null || !guestBranch.active)) this.fail(400, "GUEST_BRANCH_INVALID");
      // 지점 회차는 모든 참가자의 캠퍼스가 회차 캠퍼스와 같아야 함
      if (sessionState.scope === "BRANCH" && (sessionState.branch_id === null || (guestBranch !== null
        ? guestBranch.id !== sessionState.branch_id
        : students.some((student) => student.branch_id !== sessionState.branch_id)))) {
        this.fail(409, "SESSION_BRANCH_MISMATCH");
      }
      const activeBooking = await transaction.familyBooking.findFirst({
        where: {
          sessionId: sessionState.session_id,
          contactDigest: this.bytes(protectedContact.digest),
          status: { in: ["RESERVED", "CHECKED_IN"] },
        },
        select: { publicId: true },
      });
      if (activeBooking !== null) this.fail(409, "ACTIVE_FAMILY_BOOKING_EXISTS");

      // QR 만료: 회차 시작 6시간 후·종료 1시간 후·지금부터 1시간 후 중 가장 늦은 시각
      const expiresAt = new Date(Math.max(
        sessionState.starts_at.getTime() + 6 * 60 * 60 * 1_000,
        sessionState.ends_at.getTime() + 60 * 60 * 1_000,
        Date.now() + 60 * 60 * 1_000,
      ));
      const booking = await transaction.familyBooking.create({
        data: {
          sessionId: sessionState.session_id,
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
      // 재원생 참가자 스냅샷. 담임은 현재 활성 대표 수학 반 기준
      for (const student of students) {
        const teacherName = currentStudentMathHomeroomTeacher({
          teacherName: student.teacher_name,
          assignments: activeAssignments.filter((assignment) => assignment.studentId === student.id),
        });
        const link = await transaction.familyBookingStudent.create({ data: {
          familyBookingId: booking.id,
          sessionId: sessionState.session_id,
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
      // 비재원생 참가자. 학번 대신 `비재원-000001` 형식 일련번호 부여
      if (guest !== null && guestBranch !== null) {
        const sequence = await transaction.$queryRaw<Array<{ value: bigint }>>`
          select nextval('guest_participant_no_seq') value`;
        const sourceStudentNo = `비재원-${sequence[0]!.value.toString().padStart(6, "0")}`;
        const link = await transaction.familyBookingStudent.create({ data: {
          familyBookingId: booking.id,
          sessionId: sessionState.session_id,
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
      // 관리 링크 만료: 회차 종료 30일 후와 지금부터 30일 후 중 늦은 시각
      const accessExpiresAt = new Date(Math.max(
        sessionState.ends_at.getTime() + 30 * 24 * 60 * 60_000,
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
      // 관리 링크 토큰은 URL 프래그먼트에 넣어 서버 로그·Referer로 새지 않게 함
      const bookingUrl = new URL("/booking/access", this.environment.publicBaseUrl ?? "https://invalid.local");
      bookingUrl.hash = `token=${access.rawToken}`;
      const smsBranch = bookingChildren[0]!.branch;
      const rendered = await this.smsTemplates.renderDefault(transaction, "BOOKING_CONFIRMED", {
        studentName: bookingChildren.map((child) => child.studentName).join(", "),
        seminarTitle: sessionState.seminar_title,
        sessionDateTime: this.formatSessionDateTime(sessionState.starts_at),
        place: sessionState.place,
        bookingUrl: bookingUrl.toString(),
        inquiryPhone: this.inquiryPhone(smsBranch),
      }, {
        key: "SYSTEM_BOOKING_CONFIRMED",
        body: "[예시학원] 설명회 예약이 완료되었습니다. 예약 및 입장 QR 확인: {예약확인링크}",
      });
      await this.smsOutbox.enqueue(transaction, {
        eventKey: `BOOKING_CONFIRMED:${booking.publicId}:1`,
        source: "BOOKING_CONFIRMED",
        branch: smsBranch,
        seminarSessionPublicId: sessionState.session_public_id,
        familyBookingPublicId: booking.publicId,
        recipientCiphertext: protectedContact.ciphertext,
        recipientDigest: protectedContact.digest,
        recipientLast4: protectedContact.last4,
        message: rendered.message,
        title: rendered.title,
        actorSubject: request.adminOverride?.actorSubject ?? null,
        safeMetadata: { qrVersion: 1, ...rendered.snapshot },
      });
      await this.sheetOutbox.enqueueBookingEvent(transaction, {
        eventId: createdEvent.eventId,
        eventType: "CREATED",
        occurredAt: createdEvent.occurredAt,
        seminarSessionPublicId: sessionState.session_public_id,
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
      // 멱등 응답에는 QR 원문을 저장하지 않음
      const responseWithoutRaw = {
        familyBookingId: booking.publicId,
        sessionId: sessionState.session_public_id,
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

  /**
   * 다이제스트 상수 시간 비교
   */
  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }

  /**
   * 예약 생성 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The family booking could not be completed.");
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
}
