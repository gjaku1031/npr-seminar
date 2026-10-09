import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { DomainError } from "../../src/common/errors/domain-error.js";
import { IdempotencyService } from "../../src/common/idempotency/idempotency.service.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { CheckInsService } from "../../src/modules/check-ins/check-ins.service.js";
import { BookingCryptoService } from "../../src/modules/family-bookings/booking-crypto.service.js";
import { FamilyBookingsManagementService } from "../../src/modules/family-bookings/family-bookings-management.service.js";
import { FamilyBookingsService } from "../../src/modules/family-bookings/family-bookings.service.js";
import { BookingProofService } from "../../src/modules/family-bookings/otp-proof.port.js";
import { SheetOutboxService } from "../../src/modules/google-sheets/sheet-outbox.service.js";
import {
  GoogleSheetsGateway,
  SHEET_SCHEMA_FINGERPRINT,
  type SheetDispatchPlan,
} from "../../src/modules/google-sheets/google-sheets.gateway.js";
import { SheetWorkerService } from "../../src/modules/google-sheets/sheet-worker.service.js";
import { QrService } from "../../src/modules/qr/qr.service.js";
import { SmsMessagePolicy } from "../../src/modules/sms/sms-message-policy.service.js";
import { SmsOutboxService } from "../../src/modules/sms/sms-outbox.service.js";
import { SmsTemplateCatalog } from "../../src/modules/sms/sms-template-catalog.service.js";
import { SmsTemplateRenderer } from "../../src/modules/sms/sms-template-renderer.service.js";
import { QrTokenProtector } from "../../src/modules/family-bookings/qr-token-protector.service.js";

/**
 * api 패키지 디렉터리
 */
const apiDirectory = resolve(import.meta.dirname, "../..");

/**
 * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
 */
function bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
}

// 가족 예약 수명 주기 통합 테스트. PostgreSQL 컨테이너에 마이그레이션을 적용해 실제 SQL로 검증
describe("family booking lifecycle", () => {
  // PostgreSQL 컨테이너
  let postgres: StartedTestContainer;

  // DB 클라이언트
  let prisma: PrismaService;

  // 연락처 보호
  let protector: PhoneProtector;

  // 토큰 다이제스트
  let crypto: BookingCryptoService;

  // 예약 증명
  let proofService: BookingProofService;

  // 예약 생성 서비스
  let bookings: FamilyBookingsService;

  // 예약 관리 서비스
  let management: FamilyBookingsManagementService;

  // QR 서비스
  let qr: QrService;

  // 체크인 서비스
  let checkIns: CheckInsService;

  // 게시 완료 동기화 실행 ID
  let runId: bigint;

  // A 지점 ID
  let branchId: bigint;

  // 테스트 실행 환경
  let environment: AppEnvironment;

  // 시트 반영 대기열
  let sheetOutbox: SheetOutboxService;

  // 컨테이너 기동, 마이그레이션 적용, 지점·동기화 실행·서비스 구성
  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_PASSWORD: "integration_only", POSTGRES_DB: "npr_family" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();
    const databaseUrl = `postgresql://postgres:integration_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_family`;
    execFileSync(resolve(apiDirectory, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: apiDirectory, env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl }, stdio: "pipe",
    });
    environment = {
      appEnv: "test", processRole: "api", port: 4000, databaseUrl,
      sessionSecret: "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg=",
      scannerPairingHmacKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
      phoneEncryptionKey: "BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=",
      phoneHmacKey: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=",
      otpPepper: "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ=",
      qrEncryptionKey: "AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM=",
      publicBaseUrl: "https://public.test", trustProxy: 1, tongSyncEnabled: false,
      smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
      smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined }, smsAligoTestMode: true,
      googleSheetsEnabled: false, sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
    };
    prisma = new PrismaService(environment);
    protector = new PhoneProtector(environment);
    crypto = new BookingCryptoService();
    proofService = new BookingProofService(prisma);
    const idempotency = new IdempotencyService(prisma);
    const sms = new SmsOutboxService(protector, new SmsMessagePolicy());
    const smsTemplates = new SmsTemplateCatalog(new SmsTemplateRenderer());
    sheetOutbox = new SheetOutboxService(protector);
    const qrTokenProtector = new QrTokenProtector(environment);
    const bookingAccess = {} as never;
    bookings = new FamilyBookingsService(prisma, protector, crypto, qrTokenProtector, proofService, sms, smsTemplates, sheetOutbox, environment);
    management = new FamilyBookingsManagementService(prisma, idempotency, crypto, sms, smsTemplates, sheetOutbox, proofService, protector, bookingAccess, qrTokenProtector, environment);
    qr = new QrService(prisma, crypto, proofService, bookingAccess, qrTokenProtector);
    checkIns = new CheckInsService(prisma, crypto, sheetOutbox);
    runId = (await prisma.syncRun.create({ data: { runType: "OFFLINE_INITIAL_DRY_RUN", status: "PUBLISHED" } })).id;
    branchId = (await prisma.branch.findUniqueOrThrow({ where: { code: "CAMPUS_A" } })).id;
  });

  // DB 연결 종료와 컨테이너 정지
  afterAll(async () => { await prisma?.$disconnect(); await postgres?.stop(); });

  /**
   * 공개 설명회의 OPEN 회차 생성
   * @param withSheet true면 시트 매핑도 생성
   */
  async function session(withSheet = false) {
    const seminar = await prisma.seminar.findFirstOrThrow({ where: { status: "PUBLISHED" } });
    const created = await prisma.seminarSession.create({ data: {
      seminarId: seminar.id, scope: "ALL", title: `통합 ${randomUUID()}`, place: "테스트",
      startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000),
      bookingOpensAt: new Date(Date.now() - 3_600_000), bookingClosesAt: new Date(Date.now() + 80_000_000), status: "OPEN",
      guestBookingEnabled: true,
    } });
    if (withSheet) await prisma.sheetMapping.create({ data: {
      seminarSessionPublicId: created.publicId, spreadsheetId: `integration-${created.publicId}`,
      schemaFingerprint: SHEET_SCHEMA_FINGERPRINT, enabled: false, circuitStatus: "BLOCKED", blockReasonCode: "INTEGRATION",
    } });
    return created;
  }

  /**
   * 지정 연락처·용도의 VERIFIED 예약 증명 생성. 새 예약 용도는 A 캠퍼스로 고정
   * @returns 증명 원문
   */
  async function proof(phone: string, purpose: "FAMILY_BOOKING" | "BOOKING_MANAGE") {
    const raw = randomBytes(32).toString("base64url");
    const contact = protector.protect(phone);
    await prisma.otpProofAudit.create({ data: {
      proofDigest: bytes(createHash("sha256").update(raw).digest()), purpose,
      contactDigest: bytes(contact.digest), contactCiphertext: bytes(contact.ciphertext), contactLast4: contact.last4,
      selectedBranchCode: purpose === "FAMILY_BOOKING" ? "CAMPUS_A" : null,
      status: "VERIFIED", expiresAt: new Date(Date.now() + 600_000), verifiedAt: new Date(),
    } });
    return raw;
  }

  // 지정 연락처를 어머니 연락처로 가진 A 재원생 생성
  async function student(
    phone: string,
    side: "MOTHER" | "FATHER",
    options: { readonly branchId?: bigint; readonly name?: string } = {},
  ) {
    const contact = protector.protect(phone);
    return prisma.student.create({ data: {
      sourceStudentNo: `ST-${randomUUID()}`,
      branchId: options.branchId ?? branchId,
      name: options.name ?? "재원 학생",
      className: "중3A",
      sourceHash: bytes(createHash("sha256").update(randomUUID()).digest()), firstSeenRunId: runId, lastSeenRunId: runId,
      ...(side === "MOTHER" ? {
        motherPhoneCiphertext: bytes(contact.ciphertext), motherPhoneDigest: bytes(contact.digest), motherPhoneLast4: contact.last4,
      } : {
        fatherPhoneCiphertext: bytes(contact.ciphertext), fatherPhoneDigest: bytes(contact.digest), fatherPhoneLast4: contact.last4,
      }),
    } });
  }

  // 어머니·아버지 연락처를 모두 가진 재원생 생성
  async function studentWithParents(motherPhone: string, fatherPhone: string) {
    const mother = protector.protect(motherPhone);
    const father = protector.protect(fatherPhone);
    const created = await prisma.student.create({ data: {
      sourceStudentNo: `ST-${randomUUID()}`, branchId, name: "양부모 재원 학생", className: "중3A",
      schoolName: "테스트중", grade: "3", teacherName: "김담임, 이부담임",
      sourceHash: bytes(createHash("sha256").update(randomUUID()).digest()), firstSeenRunId: runId, lastSeenRunId: runId,
      motherPhoneCiphertext: bytes(mother.ciphertext), motherPhoneDigest: bytes(mother.digest), motherPhoneLast4: mother.last4,
      fatherPhoneCiphertext: bytes(father.ciphertext), fatherPhoneDigest: bytes(father.digest), fatherPhoneLast4: father.last4,
    } });
    await assignment(created.id, "중3A", "수학강사");
    return created;
  }

  // 학생의 활성 수강 등록 생성
  async function assignment(studentId: bigint, className: string, teacherName: string) {
    return prisma.studentClassAssignment.create({ data: {
      studentId,
      sourceUniqueNo: `AS-${randomUUID()}`,
      classRegistrationNo: `CR-${randomUUID()}`,
      className,
      teacherName,
      sourceHash: bytes(createHash("sha256").update(randomUUID()).digest()),
      firstSeenRunId: runId,
      lastSeenRunId: runId,
    } });
  }

  /**
   * 공개 비재원생 예약 생성
   * @returns 예약 결과, 사용한 증명 원문, 대상 회차, 멱등 키
   */
  async function guestBooking(
    phone: string,
    target?: Awaited<ReturnType<typeof session>>,
    key = `guest-${randomUUID()}`,
    attendanceParty: "MOTHER" | "FATHER" | "BOTH" = "MOTHER",
  ) {
    const selectedSession = target ?? await session(true);
    const rawProof = await proof(phone, "FAMILY_BOOKING");
    const result = await bookings.create({
      sessionId: selectedSession.publicId, bookingProof: rawProof, attendanceParty, participantType: "GUEST",
      guest: { name: "비재원 학생", branch: "CAMPUS_A", schoolName: "테스트중", grade: "중3" },
    }, key);
    return { result, rawProof, target: selectedSession, key };
  }

  // 비재원생 내부 번호는 충돌 없이 부여되고 재생·목록 응답은 비밀 값을 노출하지 않음
  it("creates a guest with a collision-free internal number and keeps replay/list ownership secret-safe", async () => {
    const phone = "01020001001";
    const created = await guestBooking(phone);
    expect(created.result.qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const replay = await bookings.create({
      sessionId: created.target.publicId, bookingProof: created.rawProof, attendanceParty: "MOTHER", participantType: "GUEST",
      guest: { name: "비재원 학생", branch: "CAMPUS_A", schoolName: "테스트중", grade: "중3" },
    }, created.key);
    expect(replay).toMatchObject({ replayed: true, qrToken: null, qrExpiresAt: null });
    const detail = await management.get(created.result.familyBookingId);
    expect(detail.students[0]).toMatchObject({ participantType: "GUEST", studentId: null, representativeClassName: "비재원생" });
    expect(detail.students[0]!.sourceStudentNo).toMatch(/^비재원-\d{6}$/u);
    expect(detail).toMatchObject({ contact: phone });
    expect(detail).not.toHaveProperty("maskedContact");

    const manageProof = await proof(phone, "BOOKING_MANAGE");
    const owned = await management.listAuthorized(manageProof);
    expect(owned.items.map((item) => item.familyBookingId)).toContain(created.result.familyBookingId);
    expect(owned.items[0]).toMatchObject({
      maskedContact: "010-****-1001",
      participants: [{ participantType: "GUEST", maskedName: "비****생", branch: "CAMPUS_A" }],
    });
    expect(owned.items[0]).not.toHaveProperty("contact");
    expect(owned.items[0]).not.toHaveProperty("students");
    expect((await management.listAuthorized(await proof("01029999999", "BOOKING_MANAGE"))).items).toHaveLength(0);
    await expect(guestBooking(phone, created.target, `duplicate-${randomUUID()}`)).rejects.toMatchObject({ code: "ACTIVE_FAMILY_BOOKING_EXISTS" });

    const records = await prisma.idempotencyRecord.findMany({ where: { resourcePublicId: created.result.familyBookingId } });
    const serialized = JSON.stringify(records, (_key, value) => typeof value === "bigint" ? value.toString() : value);
    expect(serialized).not.toContain(created.rawProof);
    expect(serialized).not.toContain(created.result.qrToken!);
  });

  // 상위 설명회가 공개되지 않은 OPEN 회차는 예약 거부
  it("rejects a guessed open session whose parent seminar is not published", async () => {
    const unpublished = await prisma.seminar.create({ data: { title: `비공개 ${randomUUID()}`, status: "DRAFT" } });
    const hiddenSession = await prisma.seminarSession.create({ data: {
      seminarId: unpublished.id,
      scope: "ALL",
      title: `비공개 회차 ${randomUUID()}`,
      place: "테스트",
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      bookingOpensAt: new Date(Date.now() - 3_600_000),
      bookingClosesAt: new Date(Date.now() + 80_000_000),
      guestBookingEnabled: true,
      status: "OPEN",
    } });

    await expect(guestBooking("01020001002", hiddenSession)).rejects.toMatchObject({
      code: "SESSION_NOT_BOOKABLE",
    });
    expect(await prisma.familyBooking.count({ where: { sessionId: hiddenSession.id } })).toBe(0);
  });

  // 어머니·아버지 연락처 소유를 정확히 확인하고 같은 연락처 동시 생성은 하나만 성공
  it("accepts exact mother or father ownership and deduplicates concurrent same-contact creates", async () => {
    for (const side of ["MOTHER", "FATHER"] as const) {
      const phone = side === "MOTHER" ? "01020002001" : "01020002002";
      const target = await session();
      const enrolled = await student(phone, side);
      await expect(bookings.create({
        sessionId: target.publicId, bookingProof: await proof(phone, "FAMILY_BOOKING"), attendanceParty: side,
        participantType: "ENROLLED", studentIds: [enrolled.publicId],
      }, `${side.toLowerCase()}-${randomUUID()}`)).resolves.toMatchObject({ replayed: false });
    }

    const phone = "01020002003";
    const target = await session();
    const attempts = await Promise.allSettled([
      guestBooking(phone, target, `concurrent-a-${randomUUID()}`),
      guestBooking(phone, target, `concurrent-b-${randomUUID()}`),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.familyBooking.count({ where: { sessionId: target.id, status: "RESERVED" } })).toBe(1);
  });

  // 관리자 취소 유형을 추가 전용 감사 이벤트에 저장
  it("persists the constrained administrator cancellation type on the append-only audit event", async () => {
    const created = await guestBooking("01020002501");
    const actorSubject = randomUUID();
    await management.cancel(
      created.result.familyBookingId,
      1,
      "PHONE",
      actorSubject,
      `admin-cancel-${randomUUID()}`,
    );

    const persisted = await prisma.bookingEvent.findFirstOrThrow({
      where: { familyBooking: { publicId: created.result.familyBookingId }, eventType: "CANCELLED" },
    });
    expect(persisted).toMatchObject({ cancellationType: "PHONE", actorSubject, safeMetadata: {} });
    const audit = await management.bookingEvents(created.result.familyBookingId);
    expect(audit.items.at(-1)).toMatchObject({
      type: "CANCELLED",
      cancellationType: "PHONE",
      actor: { type: "ADMIN", subjectId: actorSubject },
      reason: null,
    });
  });

  // 취소 문자 내용과 발신 지점은 취소 직전 활성 참가자만으로 구성
  it("builds cancellation SMS content and sender branch from only the pre-cancel active participants", async () => {
    const phone = "01020002503";
    const target = await session();
    const historicStudent = await student(phone, "MOTHER", { name: "과거 학생" });
    const created = await bookings.create({
      sessionId: target.publicId,
      bookingProof: await proof(phone, "FAMILY_BOOKING"),
      attendanceParty: "MOTHER",
      participantType: "ENROLLED",
      studentIds: [historicStudent.publicId],
    }, `cancel-audience-create-${randomUUID()}`);
    const campusBBranch = await prisma.branch.findUniqueOrThrow({ where: { code: "CAMPUS_B" } });
    const activeStudent = await student(phone, "MOTHER", {
      branchId: campusBBranch.id,
      name: "현재 학생",
    });
    const actorSubject = randomUUID();
    const updated = await management.update(created.familyBookingId, {
      expectedVersion: 1,
      studentIds: [activeStudent.publicId],
      reason: "현재 참가자로 교체",
    }, actorSubject, `cancel-audience-update-${randomUUID()}`);
    const template = await prisma.smsTemplate.findFirstOrThrow({
      where: { purpose: "BOOKING_CANCELLED", active: true, isDefault: true },
    });
    await prisma.smsTemplate.update({
      where: { id: template.id },
      data: { body: "[test] {학생명}|{문의전화}" },
    });

    try {
      await management.cancel(
        created.familyBookingId,
        updated.version,
        "OTHER",
        actorSubject,
        `cancel-audience-cancel-${randomUUID()}`,
      );
      const delivery = await prisma.smsOutbox.findFirstOrThrow({
        where: { familyBookingPublicId: created.familyBookingId, source: "BOOKING_CANCELLED" },
      });
      const message = protector.decryptSmsPayload(delivery.messageCiphertext);
      expect(delivery.branchCode).toBe("CAMPUS_B");
      expect(message).toBe("[test] 현재 학생|02-000-0002");
      expect(message).not.toContain("과거 학생");
    } finally {
      await prisma.smsTemplate.update({
        where: { id: template.id },
        data: { body: template.body },
      });
    }
  });

  // 롤백 기간 형식의 취소 이벤트 삽입도 분류하되 추가 전용 제약은 유지
  it("classifies rollback-era cancellation inserts without weakening append-only audit events", async () => {
    const created = await guestBooking("01020002502");
    const booking = await prisma.familyBooking.findUniqueOrThrow({
      where: { publicId: created.result.familyBookingId },
      select: { id: true },
    });

    const selfService = await prisma.bookingEvent.create({
      data: { familyBookingId: booking.id, eventType: "CANCELLED", actorSubject: null },
    });
    const administrator = await prisma.bookingEvent.create({
      data: { familyBookingId: booking.id, eventType: "CANCELLED", actorSubject: randomUUID() },
    });
    const explicit = await prisma.bookingEvent.create({
      data: {
        familyBookingId: booking.id,
        eventType: "CANCELLED",
        actorSubject: randomUUID(),
        cancellationType: "TEACHER",
      },
    });

    expect(selfService.cancellationType).toBe("SELF_SERVICE");
    expect(administrator.cancellationType).toBe("OTHER");
    expect(explicit.cancellationType).toBe("TEACHER");
    await expect(prisma.bookingEvent.update({
      where: { id: selfService.id },
      data: { safeMetadata: { reason: "must remain append-only" } },
    })).rejects.toThrow();
  });

  // QR을 비밀 안전하게 재발급하고, 외래 키·시트를 유지한 채 회차 이동 후 취소
  it("rotates QR secret-safely, moves session with FK/Sheets intact, then cancels", async () => {
    const phone = "01020003001";
    const source = await session(true);
    const target = await session(true);
    const targetStartsAt = new Date(Date.now() + 45 * 24 * 60 * 60_000);
    const targetEndsAt = new Date(targetStartsAt.getTime() + 60 * 60_000);
    await prisma.seminarSession.update({
      where: { id: target.id },
      data: { startsAt: targetStartsAt, endsAt: targetEndsAt, guestBookingEnabled: false },
    });
    const created = await guestBooking(phone, source);
    const oldToken = created.result.qrToken!;
    const rotateKey = `rotate-${randomUUID()}`;
    const rotateProof = await proof(phone, "BOOKING_MANAGE");
    const rotated = await qr.rotate(created.result.familyBookingId, null, "분실 재발급", rotateKey, rotateProof);
    expect(rotated).toHaveProperty("qrToken");
    const rotateReplay = await qr.rotate(created.result.familyBookingId, null, "분실 재발급", rotateKey, rotateProof);
    expect(rotateReplay).toMatchObject({ replayed: true });
    expect(rotateReplay).not.toHaveProperty("qrToken");
    await expect(management.qrPass(oldToken)).rejects.toMatchObject({ code: "QR_EXPIRED_OR_REVOKED" });

    const current = await management.get(created.result.familyBookingId);
    const beforeCredential = await prisma.qrCredential.findFirstOrThrow({ where: { familyBooking: { publicId: created.result.familyBookingId }, status: "ACTIVE" } });
    const beforeAccess = await prisma.bookingAccessCredential.findFirstOrThrow({
      where: { familyBooking: { publicId: created.result.familyBookingId }, status: "ACTIVE" },
    });
    const moveProof = await proof(phone, "BOOKING_MANAGE");
    await expect(management.update(created.result.familyBookingId, {
      expectedVersion: current.version, seminarSessionId: target.publicId, reason: "비재원 비활성 회차 변경",
    }, null, `move-disabled-${randomUUID()}`, moveProof)).rejects.toMatchObject({
      code: "GUEST_BOOKING_DISABLED",
    });
    expect((await prisma.otpProofAudit.findUniqueOrThrow({
      where: { proofDigest: bytes(createHash("sha256").update(moveProof).digest()) },
    })).status).toBe("VERIFIED");
    await prisma.seminarSession.update({ where: { id: target.id }, data: { guestBookingEnabled: true } });
    const moved = await management.update(created.result.familyBookingId, {
      expectedVersion: current.version, seminarSessionId: target.publicId, reason: "회차 변경",
    }, null, `move-${randomUUID()}`, moveProof);
    expect((await prisma.otpProofAudit.findUniqueOrThrow({
      where: { proofDigest: bytes(createHash("sha256").update(moveProof).digest()) },
    })).status).toBe("CONSUMED");
    expect(moved.seminarSessionId).toBe(target.publicId);
    expect(moved).toMatchObject({ maskedContact: "010-****-3001" });
    expect(moved).not.toHaveProperty("contact");
    const storedMove = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { scope: "FAMILY_BOOKING_UPDATE" }, orderBy: { id: "desc" },
    });
    expect(JSON.stringify(storedMove.responseBody)).not.toContain(phone);
    expect(storedMove.responseBody).not.toHaveProperty("contact");
    const afterCredential = await prisma.qrCredential.findFirstOrThrow({ where: { familyBooking: { publicId: created.result.familyBookingId }, status: "ACTIVE" } });
    expect(afterCredential.id).toBe(beforeCredential.id);
    expect(afterCredential.version).toBe(beforeCredential.version);
    expect(Buffer.from(afterCredential.tokenDigest).equals(Buffer.from(beforeCredential.tokenDigest))).toBe(true);
    expect(Buffer.from(afterCredential.tokenCiphertext!).equals(Buffer.from(beforeCredential.tokenCiphertext!))).toBe(true);
    expect(afterCredential.expiresAt.getTime()).toBeGreaterThanOrEqual(targetStartsAt.getTime() + 6 * 60 * 60_000);
    const afterAccess = await prisma.bookingAccessCredential.findFirstOrThrow({
      where: { familyBooking: { publicId: created.result.familyBookingId }, status: "ACTIVE" },
    });
    expect(afterAccess.id).toBe(beforeAccess.id);
    expect(Buffer.from(afterAccess.tokenDigest).equals(Buffer.from(beforeAccess.tokenDigest))).toBe(true);
    expect(afterAccess.expiresAt.getTime()).toBeGreaterThanOrEqual(targetEndsAt.getTime() + 30 * 24 * 60 * 60_000);
    const persisted = await prisma.familyBooking.findUniqueOrThrow({ where: { publicId: created.result.familyBookingId }, include: { students: true } });
    expect(persisted.students.every((link) => link.sessionId === target.id)).toBe(true);
    expect(await prisma.familyBooking.count({
      where: { sessionId: source.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
    })).toBe(0);
    expect(await prisma.familyBooking.count({
      where: { sessionId: target.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
    })).toBe(1);
    expect(await prisma.sheetOutbox.count({ where: { familyBookingPublicId: created.result.familyBookingId, eventType: "UPDATED" } })).toBe(2);

    const cancelled = await management.cancel(created.result.familyBookingId, moved.version, "SELF_SERVICE", null, `cancel-${randomUUID()}`, await proof(phone, "BOOKING_MANAGE"), "직접 취소");
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      maskedContact: "010-****-3001",
      participants: [{ participantType: "GUEST", maskedName: "비****생", branch: "CAMPUS_A" }],
    });
    expect(cancelled).not.toHaveProperty("contact");
    expect(cancelled).not.toHaveProperty("students");
    expect((await management.get(created.result.familyBookingId)).students[0]).toMatchObject({ name: "비재원 학생" });
    expect((await management.getAuthorized(
      created.result.familyBookingId,
      await proof(phone, "BOOKING_MANAGE"),
    )).participants).toEqual(cancelled.participants);
    const cancelledList = await management.list({
      sessionId: target.publicId, status: "CANCELLED", page: 1, pageSize: 20,
    });
    expect(cancelledList.items.find((item) => item.familyBookingId === created.result.familyBookingId)?.students[0])
      .toMatchObject({ name: "비재원 학생" });
    const ownedAfterCancellation = await management.listAuthorized(await proof(phone, "BOOKING_MANAGE"));
    expect(ownedAfterCancellation.items.find((item) => item.familyBookingId === created.result.familyBookingId)?.participants)
      .toEqual(cancelled.participants);
    const eventMetadata = await prisma.bookingEvent.findMany({
      where: { familyBooking: { publicId: created.result.familyBookingId } },
      select: { eventType: true, cancellationType: true, safeMetadata: true },
    });
    expect(JSON.stringify(eventMetadata)).not.toContain(phone);
    expect(eventMetadata.find((event) => event.eventType === "CANCELLED")).toMatchObject({
      cancellationType: "SELF_SERVICE",
      safeMetadata: { reason: "직접 취소" },
    });
    expect(await prisma.familyBooking.count({
      where: { sessionId: target.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
    })).toBe(0);
  });

  // 비재원생 생성·변경·취소 반영을 처리하고 만료된 워커 lease를 정리
  it("drains durable guest create/update/cancel deliveries and reconciles an expired worker lease", async () => {
    const phone = "01020003501";
    const source = await session(true);
    const target = await session(true);
    const created = await guestBooking(phone, source);
    const current = await management.get(created.result.familyBookingId);
    const moved = await management.update(created.result.familyBookingId, {
      expectedVersion: current.version,
      seminarSessionId: target.publicId,
      reason: "시트 워커 회차 변경",
    }, null, `sheet-move-${randomUUID()}`, await proof(phone, "BOOKING_MANAGE"));
    await management.cancel(
      created.result.familyBookingId,
      moved.version,
      "SELF_SERVICE",
      null,
      `sheet-cancel-${randomUUID()}`,
      await proof(phone, "BOOKING_MANAGE"),
      "시트 워커 취소",
    );

    await prisma.sheetMapping.updateMany({
      where: { seminarSessionPublicId: { in: [source.publicId, target.publicId] } },
      data: { enabled: true, circuitStatus: "CLOSED", blockReasonCode: null, lastValidatedAt: new Date() },
    });
    const plans: SheetDispatchPlan[] = [];
    const gateway = {
      validate: vi.fn().mockResolvedValue({ kind: "SUCCEEDED" }),
      apply: vi.fn(async (plan: SheetDispatchPlan) => { plans.push(plan); return { kind: "SUCCEEDED" as const }; }),
    } as unknown as GoogleSheetsGateway;
    const worker = new SheetWorkerService(prisma, protector, gateway, {
      ...environment,
      processRole: "worker",
      googleSheetsEnabled: true,
      googleSheetsSpreadsheetId: `integration-${source.publicId}`,
    });

    for (let guard = 0; guard < 10; guard += 1) {
      const pending = await prisma.sheetOutbox.count({
        where: { familyBookingPublicId: created.result.familyBookingId, status: { in: ["PENDING", "RETRY", "CLAIMED"] } },
      });
      if (pending === 0) break;
      await worker.runOnce();
      await prisma.sheetMapping.updateMany({ data: { lastDispatchAt: null } });
    }
    const deliveries = await prisma.sheetOutbox.findMany({
      where: { familyBookingPublicId: created.result.familyBookingId },
      include: { attempts: true },
      orderBy: { id: "asc" },
    });
    expect(deliveries).toHaveLength(4);
    expect(deliveries.every((delivery) => delivery.status === "SUCCEEDED" && delivery.attempts.length === 1)).toBe(true);
    expect(plans.every((plan) => /^비재원-\d{6}$/u.test(plan.row.sourceStudentNo))).toBe(true);
    expect(plans.every((plan) => plan.row.reservationState === "예약취소 (모) · 1명")).toBe(true);
    expect(plans.every((plan) => plan.row.latestOperationalLog.startsWith("웹앱 예약 취소 "))).toBe(true);
    expect(new Set(plans.map((plan) => plan.row.marker)).size).toBe(1);

    const recoverySession = await session(true);
    const recovery = await guestBooking("01020003502", recoverySession);
    const recoveryMapping = await prisma.sheetMapping.update({
      where: { seminarSessionPublicId: recoverySession.publicId },
      data: { enabled: true, circuitStatus: "CLOSED", blockReasonCode: null, lastValidatedAt: new Date(), lastDispatchAt: null },
    });
    const leaseOwner = randomUUID();
    const recoveryDelivery = await prisma.sheetOutbox.findFirstOrThrow({
      where: { familyBookingPublicId: recovery.result.familyBookingId, eventType: "CREATED" },
    });
    await prisma.sheetOutbox.update({
      where: { id: recoveryDelivery.id },
      data: { status: "CLAIMED", attemptCount: 1, leaseOwner, leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    await prisma.sheetMapping.update({
      where: { id: recoveryMapping.id },
      data: { dispatchLeaseOwner: leaseOwner, dispatchLeaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    await worker.runOnce();
    const recovered = await prisma.sheetOutbox.findUniqueOrThrow({
      where: { id: recoveryDelivery.id },
      include: { attempts: { orderBy: { attemptNo: "asc" } } },
    });
    expect(recovered.status).toBe("SUCCEEDED");
    expect(recovered.attempts.map((attempt) => [attempt.attemptNo, attempt.result, attempt.errorCode])).toEqual([
      [1, "RETRY", "SHEETS_RECONCILE_REQUIRED"],
      [2, "SUCCEEDED", null],
    ]);
  });

  // 늦게 처리되는 이전 반영도 현재 재예약 기준으로 투영하고 둘 다 참석 비재원생 연락처는 모 열에만 기록
  it("projects the current rebooking for late old deliveries and maps a BOTH guest contact to mother only", async () => {
    const phone = "01020003601";
    const target = await session(true);
    const oldBooking = await guestBooking(phone, target);
    await management.cancel(
      oldBooking.result.familyBookingId,
      1,
      "SELF_SERVICE",
      null,
      `late-cancel-${randomUUID()}`,
      await proof(phone, "BOOKING_MANAGE"),
      "재예약 전 취소",
    );
    const currentBooking = await guestBooking(phone, target, `rebook-${randomUUID()}`, "BOTH");
    const [oldLink, currentLink] = await Promise.all([
      prisma.familyBookingStudent.findFirstOrThrow({
        where: { familyBooking: { publicId: oldBooking.result.familyBookingId } },
      }),
      prisma.familyBookingStudent.findFirstOrThrow({
        where: { familyBooking: { publicId: currentBooking.result.familyBookingId } },
      }),
    ]);
    await prisma.sheetMapping.update({
      where: { seminarSessionPublicId: target.publicId },
      data: { enabled: true, circuitStatus: "CLOSED", blockReasonCode: null, lastValidatedAt: new Date() },
    });
    const plans: SheetDispatchPlan[] = [];
    const gateway = {
      validate: vi.fn().mockResolvedValue({ kind: "SUCCEEDED" }),
      apply: vi.fn(async (plan: SheetDispatchPlan) => { plans.push(plan); return { kind: "SUCCEEDED" as const }; }),
    } as unknown as GoogleSheetsGateway;
    const worker = new SheetWorkerService(prisma, protector, gateway, {
      ...environment,
      processRole: "worker",
      googleSheetsEnabled: true,
      googleSheetsSpreadsheetId: `integration-${target.publicId}`,
    });

    for (let guard = 0; guard < 6; guard += 1) {
      if (await prisma.sheetOutbox.count({
        where: { mapping: { seminarSessionPublicId: target.publicId }, status: { in: ["PENDING", "RETRY", "CLAIMED"] } },
      }) === 0) break;
      await worker.runOnce();
      await prisma.sheetMapping.update({
        where: { seminarSessionPublicId: target.publicId },
        data: { lastDispatchAt: null },
      });
    }

    expect(plans).toHaveLength(3);
    expect(plans.every((plan) => plan.row.sourceStudentNo === currentLink.sourceStudentNoSnapshot)).toBe(true);
    expect(plans.every((plan) => plan.row.reservationState === "예약 (모/부) · 2명")).toBe(true);
    expect(plans.every((plan) => plan.row.latestOperationalLog.startsWith("웹앱 예약 "))).toBe(true);
    expect(plans.every((plan) => !plan.row.latestOperationalLog.includes("취소"))).toBe(true);
    expect(plans.every((plan) => plan.row.marker === currentLink.publicId)).toBe(true);
    expect(plans.every((plan) => plan.row.motherPhone === "010-2000-3601" && plan.row.fatherPhone === "")).toBe(true);
    const safeMetadata = await prisma.bookingEvent.findMany({
      where: { familyBookingId: { in: [oldLink.familyBookingId, currentLink.familyBookingId] } },
      select: { safeMetadata: true },
    });
    expect(JSON.stringify(safeMetadata)).not.toContain(phone);
  });

  // 현재 재원생의 어머니·아버지 연락처, 현재 반 열, 대표 담임을 사용
  it("uses both current enrolled parent phones, current class columns, and the canonical primary teacher", async () => {
    const motherPhone = "01020003701";
    const fatherPhone = "01020003702";
    const target = await session(true);
    const enrolled = await studentWithParents(motherPhone, fatherPhone);
    const created = await bookings.create({
      sessionId: target.publicId,
      bookingProof: await proof(motherPhone, "FAMILY_BOOKING"),
      attendanceParty: "MOTHER",
      participantType: "ENROLLED",
      studentIds: [enrolled.publicId],
    }, `sheet-enrolled-${randomUUID()}`);
    await prisma.sheetMapping.update({
      where: { seminarSessionPublicId: target.publicId },
      data: { enabled: true, circuitStatus: "CLOSED", blockReasonCode: null, lastValidatedAt: new Date() },
    });
    const plans: SheetDispatchPlan[] = [];
    const gateway = {
      validate: vi.fn().mockResolvedValue({ kind: "SUCCEEDED" }),
      apply: vi.fn(async (plan: SheetDispatchPlan) => { plans.push(plan); return { kind: "SUCCEEDED" as const }; }),
    } as unknown as GoogleSheetsGateway;
    const worker = new SheetWorkerService(prisma, protector, gateway, {
      ...environment,
      processRole: "worker",
      googleSheetsEnabled: true,
      googleSheetsSpreadsheetId: `integration-${target.publicId}`,
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.row).toMatchObject({
      sourceStudentNo: enrolled.sourceStudentNo,
      studentName: enrolled.name,
      mathClassNames: enrolled.className,
      scienceClassNames: "",
      schoolName: enrolled.schoolName,
      grade: enrolled.grade,
      primaryTeacher: "김담임",
      motherPhone: "010-2000-3701",
      fatherPhone: "010-2000-3702",
      reservationState: "예약 (모) · 1명",
    });
    expect(plans[0]?.row.marker).toBe((await prisma.familyBookingStudent.findFirstOrThrow({
      where: { familyBooking: { publicId: created.familyBookingId } },
    })).publicId);
  });

  // 과학 강사는 예약·입장 스냅샷·시트 어디서도 담임으로 쓰지 않고 추적용으로만 유지
  it("keeps science instructors traceability-only across booking, check-in snapshots, and Sheets", async () => {
    const target = await session(true);
    const createClassifiedStudent = async (input: {
      readonly phone: string;
      readonly name: string;
      readonly className: string;
      readonly studentTeacherName: string;
      readonly assignmentClassName: string;
      readonly assignmentTeacherName: string;
      readonly scienceOnly: boolean;
    }) => {
      const contact = protector.protect(input.phone);
      const created = await prisma.student.create({ data: {
        sourceStudentNo: `ST-${randomUUID()}`,
        branchId,
        name: input.name,
        className: input.className,
        teacherName: input.studentTeacherName,
        unitName: input.scienceOnly ? "과학" : "고등",
        classResolutionStatus: input.scienceOnly ? "SCIENCE_ONLY" : "ONE_REGULAR",
        sourceHash: bytes(createHash("sha256").update(randomUUID()).digest()),
        firstSeenRunId: runId,
        lastSeenRunId: runId,
        motherPhoneCiphertext: bytes(contact.ciphertext),
        motherPhoneDigest: bytes(contact.digest),
        motherPhoneLast4: contact.last4,
      } });
      const sourceAssignment = await assignment(
        created.id,
        input.assignmentClassName,
        input.assignmentTeacherName,
      );
      return { student: created, sourceAssignment };
    };
    const sciencePhone = "01020003801";
    const mathPhone = "01020003802";
    const science = await createClassifiedStudent({
      phone: sciencePhone,
      name: "과학 전용 학생",
      className: "과학",
      studentTeacherName: "과학행담임, 공동담임",
      assignmentClassName: "과고2역학SKY[일5]",
      assignmentTeacherName: "과학강사",
      scienceOnly: true,
    });
    const math = await createClassifiedStudent({
      phone: mathPhone,
      name: "수학 학생",
      className: "고2수학[월수]",
      studentTeacherName: " 수학담임，공동담임 ",
      assignmentClassName: "고2수학[월수]",
      assignmentTeacherName: "수학강사",
      scienceOnly: false,
    });
    await assignment(math.student.id, "과2내신[토10]", "과학강사2");
    const scienceBooking = await bookings.create({
      sessionId: target.publicId,
      bookingProof: await proof(sciencePhone, "FAMILY_BOOKING"),
      attendanceParty: "MOTHER",
      participantType: "ENROLLED",
      studentIds: [science.student.publicId],
    }, `science-policy-${randomUUID()}`);
    const mathBooking = await bookings.create({
      sessionId: target.publicId,
      bookingProof: await proof(mathPhone, "FAMILY_BOOKING"),
      attendanceParty: "MOTHER",
      participantType: "ENROLLED",
      studentIds: [math.student.publicId],
    }, `math-policy-${randomUUID()}`);
    const [scienceLink, mathLink] = await Promise.all([
      prisma.familyBookingStudent.findFirstOrThrow({
        where: { familyBooking: { publicId: scienceBooking.familyBookingId } },
      }),
      prisma.familyBookingStudent.findFirstOrThrow({
        where: { familyBooking: { publicId: mathBooking.familyBookingId } },
      }),
    ]);
    expect(scienceLink.teacherNameSnapshot).toBeNull();
    expect(mathLink.teacherNameSnapshot).toBe("수학담임");
    expect(science.sourceAssignment.teacherName).toBe("과학강사");
    expect(math.sourceAssignment.teacherName).toBe("수학강사");

    const createdPayloads = await prisma.sheetOutbox.findMany({
      where: {
        familyBookingPublicId: { in: [scienceBooking.familyBookingId, mathBooking.familyBookingId] },
        eventType: "CREATED",
      },
    });
    const createdPayloadByBooking = new Map(createdPayloads.map((delivery) => [
      delivery.familyBookingPublicId,
      JSON.parse(protector.decryptSheetPayload(delivery.snapshotCiphertext)) as { readonly teacherName: string | null },
    ]));
    expect(createdPayloadByBooking.get(scienceBooking.familyBookingId)?.teacherName).toBeNull();
    expect(createdPayloadByBooking.get(mathBooking.familyBookingId)?.teacherName).toBe("수학담임");

    // 정책 이전 스냅숏을 흉내 내 현재 근거를 읽는 모든 경로가 이를 숨기는지 확인
    await prisma.familyBookingStudent.update({
      where: { id: scienceLink.id },
      data: { teacherNameSnapshot: "과거누출담임" },
    });
    expect((await management.get(scienceBooking.familyBookingId)).students[0]?.teacherName).toBeNull();
    expect((await management.get(mathBooking.familyBookingId)).students[0]?.teacherName).toBe("수학담임");

    const device = await prisma.scannerDevice.create({ data: {
      branchId,
      name: "교사 정책 스캐너",
      gateCode: "TEACHER-POLICY",
      pairedBy: "integration",
      selectedSessionId: target.id,
      scanModeLockedAt: new Date(),
    } });
    const actor = {
      subject: device.publicId,
      role: "SCANNER" as const,
      scannerDeviceId: device.publicId,
      selectedSessionId: target.publicId,
    };
    await expect(checkIns.byQr(actor, scienceBooking.qrToken!, `science-checkin-${randomUUID()}`))
      .resolves.toMatchObject({ result: "CHECKED_IN" });
    await expect(checkIns.byQr(actor, mathBooking.qrToken!, `math-checkin-${randomUUID()}`))
      .resolves.toMatchObject({ result: "CHECKED_IN" });

    const checkedInPayloads = await prisma.sheetOutbox.findMany({
      where: {
        familyBookingPublicId: { in: [scienceBooking.familyBookingId, mathBooking.familyBookingId] },
        eventType: "CHECKED_IN",
      },
    });
    const checkedInPayloadByBooking = new Map(checkedInPayloads.map((delivery) => [
      delivery.familyBookingPublicId,
      JSON.parse(protector.decryptSheetPayload(delivery.snapshotCiphertext)) as { readonly teacherName: string | null },
    ]));
    expect(checkedInPayloadByBooking.get(scienceBooking.familyBookingId)?.teacherName).toBeNull();
    expect(checkedInPayloadByBooking.get(mathBooking.familyBookingId)?.teacherName).toBe("수학담임");

    await prisma.sheetMapping.update({
      where: { seminarSessionPublicId: target.publicId },
      data: { enabled: true, circuitStatus: "CLOSED", blockReasonCode: null, lastValidatedAt: new Date() },
    });
    const plans: SheetDispatchPlan[] = [];
    const gateway = {
      validate: vi.fn().mockResolvedValue({ kind: "SUCCEEDED" }),
      apply: vi.fn(async (plan: SheetDispatchPlan) => { plans.push(plan); return { kind: "SUCCEEDED" as const }; }),
    } as unknown as GoogleSheetsGateway;
    const worker = new SheetWorkerService(prisma, protector, gateway, {
      ...environment,
      processRole: "worker",
      googleSheetsEnabled: true,
      googleSheetsSpreadsheetId: `integration-${target.publicId}`,
    });
    for (let guard = 0; guard < 8; guard += 1) {
      if (await prisma.sheetOutbox.count({
        where: {
          mapping: { seminarSessionPublicId: target.publicId },
          status: { in: ["PENDING", "RETRY", "CLAIMED"] },
        },
      }) === 0) break;
      await worker.runOnce();
      await prisma.sheetMapping.update({
        where: { seminarSessionPublicId: target.publicId },
        data: { lastDispatchAt: null },
      });
    }
    const sciencePlans = plans.filter((plan) => plan.row.sourceStudentNo === science.student.sourceStudentNo);
    const mathPlans = plans.filter((plan) => plan.row.sourceStudentNo === math.student.sourceStudentNo);
    expect(sciencePlans).toHaveLength(2);
    expect(sciencePlans.every((plan) => plan.row.primaryTeacher === "")).toBe(true);
    expect(sciencePlans.every((plan) => plan.row.mathClassNames === ""
      && plan.row.scienceClassNames === "과고2역학SKY[일5]")).toBe(true);
    expect(mathPlans).toHaveLength(2);
    expect(mathPlans.every((plan) => plan.row.primaryTeacher === "수학담임")).toBe(true);
    expect(mathPlans.every((plan) => plan.row.mathClassNames === "고2수학[월수]"
      && plan.row.scienceClassNames === "과2내신[토10]")).toBe(true);

    const storedAssignments = await prisma.studentClassAssignment.findMany({
      where: { id: { in: [science.sourceAssignment.id, math.sourceAssignment.id] } },
      orderBy: { id: "asc" },
      select: { teacherName: true },
    });
    expect(storedAssignments.map((entry) => entry.teacherName)).toEqual(["과학강사", "수학강사"]);
  });

  // 회차 이동·취소, 입장·취소 경합에서 최종 결과는 하나만 성공
  it("allows one terminal outcome in move/cancel and check-in/cancel races", async () => {
    const phone = "01020004001";
    const source = await session();
    const target = await session();
    const created = await guestBooking(phone, source);
    const race = await Promise.allSettled([
      management.update(created.result.familyBookingId, { expectedVersion: 1, seminarSessionId: target.publicId, reason: "경합 이동" }, null, `race-move-${randomUUID()}`, await proof(phone, "BOOKING_MANAGE")),
      management.cancel(created.result.familyBookingId, 1, "SELF_SERVICE", null, `race-cancel-${randomUUID()}`, await proof(phone, "BOOKING_MANAGE"), "경합 취소"),
    ]);
    expect(race.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.familyBooking.count({
      where: {
        publicId: created.result.familyBookingId,
        sessionId: { in: [source.id, target.id] },
        status: { in: ["RESERVED", "CHECKED_IN"] },
      },
    })).toBeLessThanOrEqual(1);

    const siblingPhone = "01020004004";
    const siblingSession = await session();
    const siblingStudents = [
      await student(siblingPhone, "MOTHER"),
      await student(siblingPhone, "MOTHER"),
    ];
    const siblingBooking = await bookings.create({
      sessionId: siblingSession.publicId,
      bookingProof: await proof(siblingPhone, "FAMILY_BOOKING"),
      attendanceParty: "MOTHER",
      participantType: "ENROLLED",
      studentIds: siblingStudents.map((entry) => entry.publicId),
    }, `survey-siblings-create-${randomUUID()}`);
    const primaryLink = await prisma.familyBookingStudent.findFirstOrThrow({
      where: { familyBooking: { publicId: siblingBooking.familyBookingId } },
      orderBy: { id: "asc" },
    });
    await prisma.student.update({
      where: { id: primaryLink.studentId! },
      data: { name: "현재 대표 학생", className: "2B[토3]", teacherName: "현재담임, 부담임", unitName: "중등2" },
    });
    await assignment(primaryLink.studentId!, "2B[토3]", "수학강사");
    await prisma.familyBooking.update({
      where: { publicId: siblingBooking.familyBookingId },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });
    const checkPhone = "01020004003";
    const checkSession = await session();
    const checkBooking = await guestBooking(checkPhone, checkSession);
    const device = await prisma.scannerDevice.create({ data: {
      branchId, name: "경합 스캐너", gateCode: "RACE", pairedBy: "integration",
      selectedSessionId: checkSession.id, scanModeLockedAt: new Date(),
    } });
    const actor = { subject: device.publicId, role: "SCANNER" as const, scannerDeviceId: device.publicId, selectedSessionId: checkSession.publicId };
    const checkRace = await Promise.allSettled([
      checkIns.byQr(actor, checkBooking.result.qrToken!, `race-check-${randomUUID()}`),
      management.cancel(checkBooking.result.familyBookingId, 1, "SELF_SERVICE", null, `race-check-cancel-${randomUUID()}`, await proof(checkPhone, "BOOKING_MANAGE"), "입장 경합"),
    ]);
    const final = await prisma.familyBooking.findUniqueOrThrow({ where: { publicId: checkBooking.result.familyBookingId } });
    expect(["CHECKED_IN", "CANCELLED"]).toContain(final.status);
    const checkOutcome = checkRace[0];
    if (final.status === "CANCELLED") {
      expect(checkOutcome.status).toBe("fulfilled");
      expect((checkOutcome as PromiseFulfilledResult<{ result: string }>).value.result).toBe("CANCELLED");
      expect(await prisma.bookingEvent.count({ where: { familyBookingId: final.id, eventType: "CHECKED_IN" } })).toBe(0);
    } else {
      expect(checkOutcome.status).toBe("fulfilled");
      expect((checkOutcome as PromiseFulfilledResult<{ result: string }>).value.result).toBe("CHECKED_IN");
      expect(checkRace[1]?.status).toBe("rejected");
    }
  });
});
