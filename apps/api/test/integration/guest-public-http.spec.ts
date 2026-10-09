import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RedisStore } from "connect-redis";
import session, { type SessionOptions } from "express-session";
import helmet from "helmet";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { type AppEnvironment } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { ProblemDetailsFilter } from "../../src/common/errors/problem-details.filter.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { RedisService } from "../../src/common/redis/redis.service.js";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../../src/common/auth/session-cookie.js";
import { bootstrapAdmin } from "../../src/commands/bootstrap-admin.js";
import { type EnqueueSmsInput, SmsOutboxService } from "../../src/modules/sms/sms-outbox.service.js";
import { StudentsService } from "../../src/modules/students/students.service.js";

/**
 * api 패키지 디렉터리
 */
const apiDirectory = resolve(import.meta.dirname, "../..");

/**
 * 테스트 공개 기준 출처
 */
const publicOrigin = "http://public.test";

/**
 * 비재원생 예약 연락처
 */
const primaryContact = "01070001001";

/**
 * 두 번째 비재원생 연락처
 */
const secondaryContact = "01070002002";

/**
 * 재원생 어머니 연락처
 */
const enrolledMotherContact = "01070003003";

/**
 * 재원생 아버지 연락처
 */
const enrolledFatherContact = "01070004004";

/**
 * 다른 캠퍼스 재원생 연락처
 */
const crossCampusEnrolledContact = "01070005005";

/**
 * 테스트 중 바꾸고 복원하는 환경 변수
 */
const managedEnvironmentKeys = [
  "NODE_ENV", "APP_ENV", "PROCESS_ROLE", "PORT", "DATABASE_URL", "WORKER_DATABASE_URL", "REDIS_URL",
  "SESSION_SECRET", "PHONE_ENCRYPTION_KEY", "PHONE_HMAC_KEY", "OTP_PEPPER", "SCANNER_PAIRING_HMAC_KEY",
  "QR_ENCRYPTION_KEY",
  "PUBLIC_BASE_URL", "TRUST_PROXY", "SMS_ENABLED", "SMS_RECIPIENT_ALLOWLIST_ENABLED", "SMS_TEST_RECIPIENTS",
  "SMS_ALIGO_TEST_MODE", "ALIGO_IDENTIFIER", "ALIGO_KEY", "SMS_SENDER_CAMPUS_A", "SMS_SENDER_CAMPUS_B",
  "SMS_SENDER_CAMPUS_C", "GOOGLE_SHEETS_ENABLED", "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_APPLICATION_CREDENTIALS", "TONG_SYNC_ENABLED",
] as const;

/**
 * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
 */
function bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}

/**
 * 문자 대기열 대신 적재 요청을 메모리에 모으는 대역
 */
class CapturingSmsOutbox {
  /**
   * 적재 요청 목록
   */
  public readonly messages: EnqueueSmsInput[] = [];

  /**
   * 적재 요청 기록
   */
  public enqueue(_transaction: unknown, input: EnqueueSmsInput): Promise<void> {
    this.messages.push(input);
    return Promise.resolve();
  }

  /**
   * 연락처 끝 4자리로 가장 최근 OTP 문자의 6자리 코드 추출
   *
   * @throws {Error} 해당 OTP 문자가 없음
   */
  public latestOtpCode(contactLast4: string): string {
    const captured = [...this.messages].reverse().find((message) => message.source === "OTP" && message.recipientLast4 === contactLast4);
    const code = captured?.message.match(/\b\d{6}\b/u)?.[0];
    if (code === undefined) throw new Error(`OTP was not captured for contact ending ${contactLast4}`);
    return code;
  }
}

/**
 * 응답 Set-Cookie를 모아 다음 요청 Cookie 헤더로 보내는 쿠키 저장소
 */
class CookieJar {
  /**
   * 쿠키 이름별 값
   */
  private readonly values = new Map<string, string>();

  /**
   * 응답 쿠키 반영. 빈 값은 삭제
   */
  public capture(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0];
      if (pair === undefined) continue;
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === "") this.values.delete(name);
      else this.values.set(name, value);
    }
  }

  /**
   * Cookie 헤더 값
   */
  public header(): string {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

/**
 * 테스트 요청 옵션
 */
interface CallOptions {
  /**
   * 쿠키 저장소
   */
  readonly jar?: CookieJar;

  /**
   * x-csrf-token 값
   */
  readonly csrfToken?: string;

  /**
   * 추가 헤더
   */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * 테스트 요청 결과
 */
interface CallResult {
  /**
   * HTTP 상태
   */
  readonly status: number;

  /**
   * JSON 본문. 빈 본문은 null
   */
  readonly body: unknown;
}

/**
 * 비재원생 예약 응답 본문
 */
interface BookingBody {
  /**
   * 가족 예약 공개 ID
   */
  readonly familyBookingId: string;

  /**
   * 회차 공개 ID
   */
  readonly seminarSessionId: string;

  /**
   * 연락처
   */
  readonly contact: string;

  /**
   * 참석 보호자
   */
  readonly attendanceParty: "MOTHER" | "FATHER" | "BOTH";

  /**
   * 예약 인원
   */
  readonly seatCount: number;

  /**
   * 예약 상태
   */
  readonly status: string;

  /**
   * 예약 버전
   */
  readonly version: number;

  /**
   * 비재원생 참가자 1명
   */
  readonly students: readonly [{
    /**
     * 참여 유형
     */
    readonly participantType: "GUEST";

    /**
     * 학생 ID. 비재원생은 null
     */
    readonly studentId: null;

    /**
     * 비재원생 일련번호
     */
    readonly sourceStudentNo: string;

    /**
     * 이름
     */
    readonly name: string;

    /**
     * 캠퍼스
     */
    readonly branch: string;
  }];
}

// 공개 비재원생 예약 HTTP 수명 주기. PostgreSQL·Redis 컨테이너와 실제 Nest 서버로 검증
describe("public guest booking HTTP lifecycle", () => {
  // PostgreSQL 컨테이너
  let postgres: StartedTestContainer | undefined;

  // Redis 컨테이너
  let redis: StartedTestContainer | undefined;

  // 테스트 Nest 애플리케이션
  let app: INestApplication | undefined;

  // DB 클라이언트
  let prisma: PrismaService;

  // 테스트 서버 주소
  let baseUrl = "";

  // 문자 적재 기록
  let smsCapture: CapturingSmsOutbox;

  // 테스트 전 환경 변수 값
  const originalEnvironment = new Map<string, string | undefined>();

  // 컨테이너 기동, 마이그레이션, 환경 변수 설정, 문자 대기열 대역 주입 후 서버 기동
  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new GenericContainer("postgres:18-alpine")
        .withEnvironment({ POSTGRES_PASSWORD: "guest_http_only", POSTGRES_DB: "npr_guest_http" })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
        .start(),
      new GenericContainer("redis:7-alpine")
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .start(),
    ]);
    const databaseUrl = `postgresql://postgres:guest_http_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_guest_http`;
    const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    execFileSync(resolve(apiDirectory, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: apiDirectory,
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });

    for (const key of managedEnvironmentKeys) {
      originalEnvironment.set(key, process.env[key]);
      delete process.env[key];
    }
    Object.assign(process.env, {
      NODE_ENV: "production",
      APP_ENV: "test",
      PROCESS_ROLE: "api",
      PORT: "4000",
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      SESSION_SECRET: Buffer.alloc(32, 1).toString("base64"),
      PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
      PHONE_HMAC_KEY: Buffer.alloc(32, 3).toString("base64"),
      QR_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"),
      OTP_PEPPER: Buffer.alloc(32, 4).toString("base64"),
      SCANNER_PAIRING_HMAC_KEY: Buffer.alloc(32, 5).toString("base64"),
      PUBLIC_BASE_URL: publicOrigin,
      TRUST_PROXY: "1",
      SMS_ENABLED: "true",
      SMS_RECIPIENT_ALLOWLIST_ENABLED: "true",
      SMS_TEST_RECIPIENTS: `${primaryContact},${secondaryContact},${enrolledMotherContact},${enrolledFatherContact},${crossCampusEnrolledContact}`,
      SMS_ALIGO_TEST_MODE: "true",
      GOOGLE_SHEETS_ENABLED: "false",
      TONG_SYNC_ENABLED: "false",
    });

    smsCapture = new CapturingSmsOutbox();
    const moduleReference = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SmsOutboxService)
      .useValue(smsCapture)
      .compile();
    app = moduleReference.createNestApplication();
    const environment = app.get<AppEnvironment>("APP_ENVIRONMENT");
    const redisService = app.get(RedisService);
    const sessionOptions: SessionOptions = {
      name: SESSION_COOKIE_NAME,
      secret: environment.sessionSecret!,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new RedisStore({
        client: redisService.client,
        prefix: `${redisService.prefix}session:`,
        ttl: environment.sessionIdleTtlSeconds,
      }),
      cookie: {
        ...sessionCookieOptions(environment),
        maxAge: environment.sessionIdleTtlSeconds * 1_000,
      },
    };
    app.use(helmet());
    app.use(session(sessionOptions));
    app.getHttpAdapter().getInstance().set("trust proxy", environment.trustProxy);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);
  }, 120_000);

  // 서버·컨테이너 종료와 환경 변수 복원
  afterAll(async () => {
    await app?.close();
    await redis?.stop();
    await postgres?.stop();
    for (const key of managedEnvironmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // 테스트 서버 요청. Origin 헤더와 쿠키 저장소를 자동 처리
  async function call(method: string, path: string, body?: unknown, options: CallOptions = {}): Promise<CallResult> {
    const headers = new Headers(options.headers);
    headers.set("origin", publicOrigin);
    headers.set("x-forwarded-host", "public.test");
    headers.set("x-forwarded-proto", "http");
    if (body !== undefined) headers.set("content-type", "application/json");
    if (options.csrfToken !== undefined) headers.set("x-csrf-token", options.csrfToken);
    const cookie = options.jar?.header() ?? "";
    if (cookie !== "") headers.set("cookie", cookie);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    options.jar?.capture(response);
    const text = await response.text();
    return { status: response.status, body: text === "" ? null : JSON.parse(text) as unknown };
  }

  // CSRF 토큰 발급
  async function csrf(jar: CookieJar): Promise<string> {
    const response = await call("GET", "/api/v1/auth/csrf", undefined, { jar });
    expect(response.status).toBe(200);
    return (response.body as { csrfToken: string }).csrfToken;
  }

  /**
   * OTP 요청·확인으로 예약 증명 발급
   * @returns 예약 증명 원문
   */
  async function issueProof(
    jar: CookieJar,
    csrfToken: string,
    contact: string,
    purpose: "FAMILY_BOOKING" | "BOOKING_MANAGE",
    branch?: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C",
  ): Promise<string> {
    const challenge = await call("POST", "/api/v1/public/otp/challenges", {
      contact,
      purpose,
      ...(branch === undefined ? {} : { branch }),
    }, {
      jar,
      csrfToken,
      headers: { "idempotency-key": `otp-create-${randomUUID()}` },
    });
    expect(challenge.status).toBe(201);
    const challengeId = (challenge.body as { challengeId: string }).challengeId;
    const code = smsCapture.latestOtpCode(contact.slice(-4));
    const verified = await call("POST", `/api/v1/public/otp/challenges/${challengeId}/verify`, {
      oneTimeCode: code,
    }, {
      jar,
      csrfToken,
      headers: { "idempotency-key": `otp-verify-${randomUUID()}` },
    });
    expect(verified.status).toBe(200);
    return (verified.body as { bookingProof: string }).bookingProof;
  }

  // OTP부터 비재원생 생성·QR·변경·결정적 입장·취소 제약까지 공개 HTTP 흐름 전체
  it("runs OTP through guest create, QR, update, deterministic check-in, and cancellation constraints", async () => {
    const readiness = await call("GET", "/health/ready");
    expect(readiness).toMatchObject({
      status: 200,
      body: { status: "ok", dependencies: { postgres: "ok", redis: "ok" } },
    });
    const seminar = await prisma.seminar.findFirstOrThrow({ where: { status: "PUBLISHED" } });
    const campusA = await prisma.branch.findUniqueOrThrow({ where: { code: "CAMPUS_A" } });
    const campusB = await prisma.branch.findUniqueOrThrow({ where: { code: "CAMPUS_B" } });
    const createSession = async (title: string, scope: "ALL" | "BRANCH", branchId?: bigint) => prisma.seminarSession.create({
      data: {
        seminarId: seminar.id,
        title,
        place: "HTTP E2E",
        scope,
        ...(branchId === undefined ? {} : { branchId }),
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        bookingOpensAt: new Date(Date.now() - 3_600_000),
        bookingClosesAt: new Date(Date.now() + 80_000_000),
        status: "OPEN",
        guestBookingEnabled: true,
      },
    });
    const source = await createSession(`guest-source-${randomUUID()}`, "ALL");
    const target = await createSession(`guest-target-${randomUUID()}`, "ALL");
    const campusAOnly = await createSession(`guest-campusA-${randomUUID()}`, "BRANCH", campusA.id);
    const syncRun = await prisma.syncRun.create({ data: { runType: "MANUAL", status: "SUCCEEDED" } });
    const phoneProtector = app!.get(PhoneProtector);
    const motherPhone = phoneProtector.protect(enrolledMotherContact);
    const fatherPhone = phoneProtector.protect(enrolledFatherContact);
    const seededStudent = await prisma.student.create({ data: {
      sourceStudentNo: `XOR-${randomUUID()}`,
      branchId: campusA.id,
      name: "XOR 재원생",
      className: "테스트반",
      teacherName: " 신유진，다른담임 ",
      sourceHash: bytes(createHash("sha256").update(randomUUID()).digest()),
      firstSeenRunId: syncRun.id,
      lastSeenRunId: syncRun.id,
      motherPhoneCiphertext: bytes(motherPhone.ciphertext), motherPhoneDigest: bytes(motherPhone.digest), motherPhoneLast4: motherPhone.last4,
      fatherPhoneCiphertext: bytes(fatherPhone.ciphertext), fatherPhoneDigest: bytes(fatherPhone.digest), fatherPhoneLast4: fatherPhone.last4,
    } });
    const crossCampusPhone = phoneProtector.protect(crossCampusEnrolledContact);
    await prisma.student.create({ data: {
      sourceStudentNo: `XOR-CAMPUS_B-${randomUUID()}`,
      branchId: campusB.id,
      name: "타 캠퍼스 재원생",
      className: "테스트반",
      sourceHash: bytes(createHash("sha256").update(randomUUID()).digest()),
      firstSeenRunId: syncRun.id,
      lastSeenRunId: syncRun.id,
      motherPhoneCiphertext: bytes(crossCampusPhone.ciphertext),
      motherPhoneDigest: bytes(crossCampusPhone.digest),
      motherPhoneLast4: crossCampusPhone.last4,
    } });
    let studentCountBeforeGuests = await prisma.student.count();

    const otpJar = new CookieJar();
    const otpCsrf = await csrf(otpJar);
    const enrolledProof = await issueProof(otpJar, otpCsrf, enrolledMotherContact, "FAMILY_BOOKING", "CAMPUS_A");
    const familyProof = await issueProof(otpJar, otpCsrf, primaryContact, "FAMILY_BOOKING", "CAMPUS_A");
    const campusBFamilyProof = await issueProof(otpJar, otpCsrf, primaryContact, "FAMILY_BOOKING", "CAMPUS_B");
    const publicStudents = await call("GET", "/api/v1/public/students", undefined, {
      headers: { "x-booking-proof": enrolledProof },
    });
    expect(publicStudents.status).toBe(200);
    const publicStudent = (publicStudents.body as { items: Array<Record<string, unknown>> }).items[0]!;
    expect(publicStudent).toMatchObject({ studentId: seededStudent.publicId, name: "XOR 재원생" });
    expect(publicStudent).not.toHaveProperty("motherPhone");
    expect(publicStudent).not.toHaveProperty("fatherPhone");
    expect(publicStudent).not.toHaveProperty("contact");
    const commonGuest = {
      seminarSessionId: source.publicId,
      attendanceParty: "BOTH",
      participantType: "GUEST",
      guest: { name: "비재원 학생 1", branch: "CAMPUS_A", schoolName: "테스트중", grade: "중3" },
    };
    const createHeaders = (key: string) => ({ "x-booking-proof": familyProof, "idempotency-key": key });

    const enrolledGuestAttempt = await call("POST", "/api/v1/public/family-bookings", commonGuest, {
      headers: { "x-booking-proof": enrolledProof, "idempotency-key": `enrolled-as-guest-${randomUUID()}` },
    });
    expect(enrolledGuestAttempt).toMatchObject({
      status: 409,
      body: { code: "ENROLLED_CONTACT_MUST_USE_ENROLLED_FLOW" },
    });

    const crossCampusProof = await issueProof(
      otpJar,
      otpCsrf,
      crossCampusEnrolledContact,
      "FAMILY_BOOKING",
      "CAMPUS_A",
    );
    const crossCampusGuestAttempt = await call("POST", "/api/v1/public/family-bookings", commonGuest, {
      headers: {
        "x-booking-proof": crossCampusProof,
        "idempotency-key": `cross-campus-enrolled-as-guest-${randomUUID()}`,
      },
    });
    expect(crossCampusGuestAttempt).toMatchObject({
      status: 409,
      body: { code: "ENROLLED_CONTACT_MUST_USE_ENROLLED_FLOW" },
    });

    const siblingStudent = await prisma.student.create({ data: {
      sourceStudentNo: `XOR-SIBLING-${randomUUID()}`,
      branchId: campusA.id,
      name: "XOR 형제자매",
      className: "테스트반",
      sourceHash: bytes(createHash("sha256").update(randomUUID()).digest()),
      firstSeenRunId: syncRun.id,
      lastSeenRunId: syncRun.id,
      motherPhoneCiphertext: bytes(motherPhone.ciphertext),
      motherPhoneDigest: bytes(motherPhone.digest),
      motherPhoneLast4: motherPhone.last4,
    } });
    studentCountBeforeGuests = await prisma.student.count();
    const enrolledTarget = await createSession(`enrolled-target-${randomUUID()}`, "ALL");
    const enrolledCreateProof = await issueProof(otpJar, otpCsrf, enrolledMotherContact, "FAMILY_BOOKING", "CAMPUS_A");
    const enrolledCreated = await call("POST", "/api/v1/public/family-bookings", {
      seminarSessionId: enrolledTarget.publicId,
      attendanceParty: "MOTHER",
      participantType: "ENROLLED",
    }, {
      headers: {
        "x-booking-proof": enrolledCreateProof,
        "idempotency-key": `enrolled-family-create-${randomUUID()}`,
      },
    });
    expect(enrolledCreated).toMatchObject({
      status: 201,
      body: { booking: { attendanceParty: "MOTHER", seatCount: 1 } },
    });
    const enrolledFamilyBookingId = (enrolledCreated.body as {
      booking: { familyBookingId: string };
    }).booking.familyBookingId;
    expect((enrolledCreated.body as { booking: { students: readonly unknown[] } }).booking.students).toHaveLength(2);
    expect((await prisma.familyBooking.aggregate({
      where: { sessionId: enrolledTarget.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
      _sum: { seatCount: true },
    }))._sum.seatCount).toBe(1);

    const invalidBranch = await call("POST", "/api/v1/public/family-bookings", {
      ...commonGuest,
      guest: { ...commonGuest.guest, branch: "BUSAN" },
    }, { headers: createHeaders(`invalid-branch-${randomUUID()}`) });
    expect(invalidBranch).toMatchObject({ status: 400, body: { code: "HTTP_REQUEST_REJECTED" } });

    const blankName = await call("POST", "/api/v1/public/family-bookings", {
      ...commonGuest,
      guest: { ...commonGuest.guest, name: " " },
    }, { headers: createHeaders(`blank-name-${randomUUID()}`) });
    expect(blankName).toMatchObject({ status: 400, body: { code: "GUEST_NAME_REQUIRED" } });

    const longName = await call("POST", "/api/v1/public/family-bookings", {
      ...commonGuest,
      guest: { ...commonGuest.guest, name: "가".repeat(101) },
    }, { headers: createHeaders(`long-name-${randomUUID()}`) });
    expect(longName).toMatchObject({ status: 400, body: { code: "HTTP_REQUEST_REJECTED" } });

    const mixedParticipant = await call("POST", "/api/v1/public/family-bookings", {
      ...commonGuest,
      studentIds: [seededStudent.publicId],
    }, { headers: createHeaders(`mixed-input-${randomUUID()}`) });
    expect(mixedParticipant).toMatchObject({ status: 400, body: { code: "HTTP_REQUEST_REJECTED" } });

    await prisma.branch.update({ where: { id: campusB.id }, data: { active: false } });
    const inactiveBranch = await call("POST", "/api/v1/public/family-bookings", {
      ...commonGuest,
      guest: { ...commonGuest.guest, branch: "CAMPUS_B" },
    }, { headers: createHeaders(`inactive-branch-${randomUUID()}`) });
    await prisma.branch.update({ where: { id: campusB.id }, data: { active: true } });
    expect(inactiveBranch).toMatchObject({ status: 400, body: { code: "GUEST_CAMPUS_MISMATCH" } });

    const branchMismatch = await call("POST", "/api/v1/public/family-bookings", {
      ...commonGuest,
      seminarSessionId: campusAOnly.publicId,
      guest: { ...commonGuest.guest, branch: "CAMPUS_B" },
    }, {
      headers: { "x-booking-proof": campusBFamilyProof, "idempotency-key": `branch-mismatch-${randomUUID()}` },
    });
    expect(branchMismatch).toMatchObject({ status: 409, body: { code: "SESSION_BRANCH_MISMATCH" } });

    const created = await call("POST", "/api/v1/public/family-bookings", commonGuest, {
      headers: createHeaders(`guest-create-${randomUUID()}`),
    });
    expect(created.status).toBe(201);
    const createdBody = created.body as { booking: BookingBody; qrToken: string };
    expect(createdBody.booking).toMatchObject({ contact: primaryContact, attendanceParty: "BOTH", seatCount: 2, status: "RESERVED" });
    expect(createdBody.booking).not.toHaveProperty("maskedContact");
    expect(createdBody.booking.students[0]).toMatchObject({ participantType: "GUEST", studentId: null, branch: "CAMPUS_A" });
    expect(createdBody.booking.students[0].sourceStudentNo).toMatch(/^비재원-\d{6}$/u);
    expect(createdBody.qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect((await prisma.familyBooking.aggregate({
      where: { sessionId: source.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
      _sum: { seatCount: true },
    }))._sum.seatCount).toBe(2);

    const secondaryProof = await issueProof(otpJar, otpCsrf, secondaryContact, "FAMILY_BOOKING", "CAMPUS_A");
    const secondaryCreated = await call("POST", "/api/v1/public/family-bookings", {
      seminarSessionId: source.publicId,
      attendanceParty: "MOTHER",
      participantType: "GUEST",
      guest: { name: "비재원 학생 2", branch: "CAMPUS_A", schoolName: "테스트중", grade: "중3" },
    }, {
      headers: { "x-booking-proof": secondaryProof, "idempotency-key": `guest-create-2-${randomUUID()}` },
    });
    expect(secondaryCreated.status).toBe(201);
    const secondaryBody = secondaryCreated.body as { booking: BookingBody; qrToken: string };
    expect(secondaryBody.booking).toMatchObject({ contact: secondaryContact });
    expect(secondaryBody.booking.students[0].sourceStudentNo).toMatch(/^비재원-\d{6}$/u);
    expect(secondaryBody.booking.students[0].sourceStudentNo).not.toBe(createdBody.booking.students[0].sourceStudentNo);
    expect(await prisma.student.count()).toBe(studentCountBeforeGuests);

    const mainBooking = await prisma.familyBooking.findUniqueOrThrow({ where: { publicId: createdBody.booking.familyBookingId } });
    const mainGuest = await prisma.familyBookingStudent.findFirstOrThrow({ where: { familyBookingId: mainBooking.id } });
    expect(mainGuest).toMatchObject({ participantType: "GUEST", studentId: null });
    await expect(prisma.familyBookingStudent.update({ where: { id: mainGuest.id }, data: { participantType: "ENROLLED" } })).rejects.toThrow();
    await expect(prisma.familyBookingStudent.update({ where: { id: mainGuest.id }, data: { studentId: seededStudent.id } })).rejects.toThrow();
    expect(await prisma.student.count()).toBe(studentCountBeforeGuests);
    expect(await prisma.qrCredential.count({ where: { familyBookingId: mainBooking.id, status: "ACTIVE" } })).toBe(1);

    const firstQrPass = await call("GET", "/api/v1/public/qr-pass", undefined, { headers: { "x-qr-token": createdBody.qrToken } });
    expect(firstQrPass).toMatchObject({ status: 200, body: { attendanceParty: "BOTH", seatCount: 2, status: "RESERVED", maskedContact: "***-****-1001" } });
    expect(firstQrPass.body).not.toHaveProperty("contact");

    const detailAndQrProof = await issueProof(otpJar, otpCsrf, primaryContact, "BOOKING_MANAGE");
    const detail = await call("GET", `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}`, undefined, {
      headers: { "x-booking-proof": detailAndQrProof },
    });
    expect(detail).toMatchObject({
      status: 200,
      body: {
        familyBookingId: createdBody.booking.familyBookingId,
        maskedContact: "010-****-1001",
        seatCount: 2,
        participants: [{ participantType: "GUEST", maskedName: "비******1", branch: "CAMPUS_A" }],
      },
    });
    expect(detail.body).not.toHaveProperty("contact");
    expect(detail.body).not.toHaveProperty("students");
    const firstRecoveredQr = await call(
      "GET",
      `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}/qr`,
      undefined,
      { headers: { "x-booking-proof": detailAndQrProof } },
    );
    const secondRecoveredQr = await call(
      "GET",
      `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}/qr`,
      undefined,
      { headers: { "x-booking-proof": detailAndQrProof } },
    );
    expect(firstRecoveredQr).toMatchObject({
      status: 200,
      body: { familyBookingId: createdBody.booking.familyBookingId, version: 1, qrToken: createdBody.qrToken },
    });
    expect(secondRecoveredQr).toEqual(firstRecoveredQr);
    const publicRotation = await call(
      "POST",
      `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}/qr/rotation`,
      { reason: "public rotation must not exist" },
      {
        jar: otpJar,
        csrfToken: otpCsrf,
        headers: {
          "x-booking-proof": detailAndQrProof,
          "idempotency-key": `guest-rotate-${randomUUID()}`,
        },
      },
    );
    expect(publicRotation.status).toBe(404);
    expect(await prisma.qrCredential.count({ where: { familyBookingId: mainBooking.id, status: "ACTIVE" } })).toBe(1);
    expect(await prisma.qrCredential.count({ where: { familyBookingId: mainBooking.id } })).toBe(1);
    const unchangedQrPass = await call("GET", "/api/v1/public/qr-pass", undefined, {
      headers: { "x-qr-token": createdBody.qrToken },
    });
    expect(unchangedQrPass.status).toBe(200);

    const missingMutationProof = await call("PATCH", `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}`, {
      expectedVersion: createdBody.booking.version,
      seminarSessionId: target.publicId,
    }, {
      jar: otpJar,
      csrfToken: otpCsrf,
      headers: { "idempotency-key": `guest-update-missing-proof-${randomUUID()}` },
    });
    expect(missingMutationProof).toMatchObject({ status: 401, body: { code: "BOOKING_PROOF_INVALID" } });
    expect((await prisma.familyBooking.findUniqueOrThrow({ where: { id: mainBooking.id } })).version).toBe(1n);

    const updateProof = await issueProof(otpJar, otpCsrf, primaryContact, "BOOKING_MANAGE");
    const updated = await call("PATCH", `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}`, {
      expectedVersion: createdBody.booking.version,
      seminarSessionId: target.publicId,
    }, {
      jar: otpJar,
      csrfToken: otpCsrf,
      headers: { "x-booking-proof": updateProof, "idempotency-key": `guest-update-${randomUUID()}` },
    });
    expect(updated).toMatchObject({
      status: 200,
      body: { seminarSessionId: target.publicId, attendanceParty: "BOTH", seatCount: 2, version: 2 },
    });
    expect((await prisma.familyBooking.aggregate({
      where: { sessionId: source.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
      _sum: { seatCount: true },
    }))._sum.seatCount).toBe(1);
    expect((await prisma.familyBooking.aggregate({
      where: { sessionId: target.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
      _sum: { seatCount: true },
    }))._sum.seatCount).toBe(2);

    const secondaryManageProof = await issueProof(otpJar, otpCsrf, secondaryContact, "BOOKING_MANAGE");
    const forbiddenDetail = await call("GET", `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}`, undefined, {
      headers: { "x-booking-proof": secondaryManageProof },
    });
    expect(forbiddenDetail).toMatchObject({ status: 403, body: { code: "BOOKING_PROOF_CONTACT_MISMATCH" } });
    const secondaryCancelled = await call("POST", `/api/v1/public/family-bookings/${secondaryBody.booking.familyBookingId}/cancel`, {
      expectedVersion: secondaryBody.booking.version,
      reason: "HTTP E2E 취소",
    }, {
      jar: otpJar,
      csrfToken: otpCsrf,
      headers: { "x-booking-proof": secondaryManageProof, "idempotency-key": `guest-cancel-${randomUUID()}` },
    });
    expect(secondaryCancelled).toMatchObject({ status: 200, body: { status: "CANCELLED" } });
    expect(await prisma.familyBooking.count({
      where: { sessionId: source.id, status: { in: ["RESERVED", "CHECKED_IN"] } },
    })).toBe(0);
    const secondaryDb = await prisma.familyBooking.findUniqueOrThrow({ where: { publicId: secondaryBody.booking.familyBookingId } });
    expect(await prisma.qrCredential.count({ where: { familyBookingId: secondaryDb.id, status: "ACTIVE" } })).toBe(0);

    const phoneLookup = await call("POST", "/api/v1/public/family-bookings/lookup", {
      contact: "010-7000-1001",
    });
    expect(phoneLookup).toMatchObject({
      status: 200,
      body: {
        items: [expect.objectContaining({
          familyBookingId: createdBody.booking.familyBookingId,
          maskedContact: "010-****-1001",
          participants: [{ participantType: "GUEST", maskedName: "비******1", branch: "CAMPUS_A" }],
        })],
      },
    });
    expect(JSON.stringify(phoneLookup.body)).not.toContain(primaryContact);
    expect(JSON.stringify(phoneLookup.body)).not.toContain("비재원 학생");
    expect(JSON.stringify(phoneLookup.body)).not.toContain(createdBody.qrToken);

    const contactReadJar = new CookieJar();
    const contactReadCsrf = await csrf(contactReadJar);
    const contactReadSession = await call(
      "POST",
      `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}/read-session`,
      { contact: "010-7000-1001" },
      {
        jar: contactReadJar,
        csrfToken: contactReadCsrf,
        headers: { "idempotency-key": `contact-read-${randomUUID()}` },
      },
    );
    expect(contactReadSession).toMatchObject({
      status: 200,
      body: {
        familyBookingId: createdBody.booking.familyBookingId,
        csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
        expiresAt: expect.any(String),
      },
    });
    const contactReadDetail = await call(
      "GET",
      `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}`,
      undefined,
      { jar: contactReadJar },
    );
    expect(contactReadDetail).toMatchObject({
      status: 200,
      body: {
        familyBookingId: createdBody.booking.familyBookingId,
        maskedContact: "010-****-1001",
      },
    });
    const contactReadQr = await call(
      "GET",
      `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}/qr`,
      undefined,
      { jar: contactReadJar },
    );
    expect(contactReadQr).toMatchObject({
      status: 200,
      body: {
        familyBookingId: createdBody.booking.familyBookingId,
        qrToken: createdBody.qrToken,
      },
    });
    const sessionOnlyMutation = await call(
      "PATCH",
      `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}`,
      { expectedVersion: 2, attendanceParty: "MOTHER" },
      {
        jar: contactReadJar,
        csrfToken: (contactReadSession.body as { csrfToken: string }).csrfToken,
        headers: { "idempotency-key": `contact-read-mutation-${randomUUID()}` },
      },
    );
    expect(sessionOnlyMutation).toMatchObject({ status: 401, body: { code: "BOOKING_PROOF_INVALID" } });

    const invalidContactReadJar = new CookieJar();
    const invalidContactReadCsrf = await csrf(invalidContactReadJar);
    const invalidContactRead = await call(
      "POST",
      `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}/read-session`,
      { contact: "010-2999-9999" },
      {
        jar: invalidContactReadJar,
        csrfToken: invalidContactReadCsrf,
        headers: { "idempotency-key": `contact-read-invalid-${randomUUID()}` },
      },
    );
    expect(invalidContactRead).toMatchObject({
      status: 401,
      body: { code: "BOOKING_READ_SESSION_INVALID" },
    });

    const noMatchLookup = await call("POST", "/api/v1/public/family-bookings/lookup", {
      contact: "010-2999-9999",
    });
    expect(noMatchLookup).toEqual({ status: 200, body: { items: [] } });

    const adminPassword = "Npr!GuestHttp#2026";
    await bootstrapAdmin(prisma, {
      username: "guest-http-admin",
      displayName: "Guest HTTP Admin",
      password: adminPassword,
      rotate: false,
    });
    const adminJar = new CookieJar();
    const loginCsrf = await csrf(adminJar);
    const login = await call("POST", "/api/v1/auth/login", {
      username: "guest-http-admin",
      password: adminPassword,
    }, {
      jar: adminJar,
      csrfToken: loginCsrf,
      headers: { "idempotency-key": `admin-login-${randomUUID()}` },
    });
    expect(login.status).toBe(200);
    const adminStudentDetail = await call("GET", `/api/v1/admin/students/${seededStudent.publicId}`, undefined, { jar: adminJar });
    expect(adminStudentDetail).toMatchObject({
      status: 200,
      body: { motherPhone: enrolledMotherContact, fatherPhone: enrolledFatherContact },
    });
    expect(adminStudentDetail.body).not.toHaveProperty("maskedMotherContact");
    const adminStudents = await call(
      "GET",
      `/api/v1/admin/students?query=${encodeURIComponent(seededStudent.sourceStudentNo)}`,
      undefined,
      { jar: adminJar },
    );
    expect(adminStudents).toMatchObject({
      status: 200,
      body: {
        items: [{ motherPhone: enrolledMotherContact, fatherPhone: enrolledFatherContact }],
        page: { totalItems: 1 },
        summary: { uniqueStudentCount: 3 },
        facets: { teachers: [] },
      },
    });
    for (const enrolledStudent of [seededStudent, siblingStudent]) {
      const directlyProjected = await app!.get(StudentsService).list({
        query: enrolledStudent.sourceStudentNo,
        sourceActive: true,
        seminarSessionId: enrolledTarget.publicId,
        page: 1,
        pageSize: 50,
      });
      expect(directlyProjected.items[0]).toMatchObject({
        studentId: enrolledStudent.publicId,
        hasReservation: true,
        reservation: { familyBookingId: enrolledFamilyBookingId, status: "RESERVED" },
      });
      const projectedReservation = await call(
        "GET",
        `/api/v1/admin/students?query=${encodeURIComponent(enrolledStudent.sourceStudentNo)}`
          + `&seminarSessionId=${encodeURIComponent(enrolledTarget.publicId)}`,
        undefined,
        { jar: adminJar },
      );
      expect(projectedReservation).toMatchObject({
        status: 200,
        body: {
          items: [{
            studentId: enrolledStudent.publicId,
            hasReservation: true,
            reservation: {
              status: "RESERVED",
              hasReservation: true,
              familyBookingId: enrolledFamilyBookingId,
              attendanceParty: "MOTHER",
              bookingSource: "WEB_APP",
            },
          }],
          page: { totalItems: 1 },
        },
      });
    }
    const adminCsrf = await csrf(adminJar);
    const pairing = await call("POST", "/api/v1/admin/scanner-devices/pairing-codes", {
      branch: "CAMPUS_A",
      intendedDeviceName: "HTTP E2E Scanner",
      gateCode: "HTTP-GATE",
    }, {
      jar: adminJar,
      csrfToken: adminCsrf,
      headers: { "idempotency-key": `pairing-create-${randomUUID()}` },
    });
    expect(pairing.status).toBe(201);
    const pairingCode = (pairing.body as { pairingCode: string }).pairingCode;

    const scannerJar = new CookieJar();
    const scannerClaimCsrf = await csrf(scannerJar);
    const claimed = await call("POST", "/api/v1/public/scanner-pairing/claims", {
      pairingCode,
      deviceName: "HTTP E2E Scanner",
      clientPlatform: "vitest",
    }, {
      jar: scannerJar,
      csrfToken: scannerClaimCsrf,
      headers: { "idempotency-key": `pairing-claim-${randomUUID()}` },
    });
    expect(claimed.status).toBe(201);
    const scannerCsrf = (claimed.body as { csrfToken: string }).csrfToken;
    const shift = await call("POST", "/api/v1/scanner/shifts/current", {
      seminarSessionId: target.publicId,
    }, {
      jar: scannerJar,
      csrfToken: scannerCsrf,
      headers: { "idempotency-key": `scanner-shift-${randomUUID()}` },
    });
    expect(shift).toMatchObject({ status: 201, body: { locked: true, lock: { seminarSessionId: target.publicId } } });
    const checkedIn = await call("POST", "/api/v1/scanner/check-ins/qr", {
      qrToken: createdBody.qrToken,
    }, {
      jar: scannerJar,
      csrfToken: scannerCsrf,
      headers: { "idempotency-key": `guest-check-in-${randomUUID()}` },
    });
    expect(checkedIn).toMatchObject({
      status: 200,
      body: { result: "CHECKED_IN", familyBookingId: createdBody.booking.familyBookingId, familySeatCount: 2 },
    });
    expect((await prisma.familyBooking.aggregate({
      where: { sessionId: target.id, status: "CHECKED_IN" },
      _sum: { seatCount: true },
    }))._sum.seatCount).toBe(2);

    const checkedInManageProof = await issueProof(otpJar, otpCsrf, primaryContact, "BOOKING_MANAGE");
    const checkedInDetail = await call("GET", `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}`, undefined, {
      headers: { "x-booking-proof": checkedInManageProof },
    });
    const checkedInVersion = (checkedInDetail.body as BookingBody).version;
    expect(checkedInDetail).toMatchObject({ status: 200, body: { status: "CHECKED_IN", seatCount: 2 } });
    const rejectedCancel = await call("POST", `/api/v1/public/family-bookings/${createdBody.booking.familyBookingId}/cancel`, {
      expectedVersion: checkedInVersion,
      reason: "체크인 후 취소 거절",
    }, {
      jar: otpJar,
      csrfToken: otpCsrf,
      headers: { "x-booking-proof": checkedInManageProof, "idempotency-key": `checked-in-cancel-${randomUUID()}` },
    });
    expect(rejectedCancel).toMatchObject({ status: 409, body: { code: "CHECKED_IN_BOOKING_CANNOT_CANCEL" } });

    const scannerDeviceId = (claimed.body as { device: { deviceId: string } }).device.deviceId;
    const deleteCsrf = await csrf(adminJar);
    const deletedScanner = await call("DELETE", `/api/v1/admin/scanner-devices/${scannerDeviceId}`, undefined, {
      jar: adminJar,
      csrfToken: deleteCsrf,
      headers: { "idempotency-key": `scanner-delete-${randomUUID()}` },
    });
    expect(deletedScanner).toEqual({ status: 204, body: null });
    const repeatedDelete = await call("DELETE", `/api/v1/admin/scanner-devices/${scannerDeviceId}`, undefined, {
      jar: adminJar,
      csrfToken: deleteCsrf,
      headers: { "idempotency-key": `scanner-delete-repeated-${randomUUID()}` },
    });
    expect(repeatedDelete).toEqual({ status: 204, body: null });
    expect(await prisma.scannerDevice.findUnique({ where: { publicId: scannerDeviceId } })).toBeNull();
    const checkedInBooking = await prisma.familyBooking.findUniqueOrThrow({
      where: { publicId: createdBody.booking.familyBookingId },
    });
    const retainedCheckIn = await prisma.checkInEvent.findFirstOrThrow({
      where: { familyBookingId: checkedInBooking.id },
      select: { scannerDeviceId: true },
    });
    expect(retainedCheckIn.scannerDeviceId).toBeNull();
    expect(await prisma.student.count()).toBe(studentCountBeforeGuests);
    expect(smsCapture.messages.filter((message) => message.source === "OTP").length).toBeGreaterThanOrEqual(6);
  }, 120_000);
});
