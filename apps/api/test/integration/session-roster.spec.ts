import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { SessionRosterService } from "../../src/modules/family-bookings/session-roster.service.js";
import { SessionStatisticsService } from "../../src/modules/family-bookings/session-statistics.service.js";
import { StudentsService } from "../../src/modules/students/students.service.js";

/**
 * api 패키지 디렉터리
 */
const apiDirectory = resolve(import.meta.dirname, "../..");

/**
 * 테스트 회차 공개 ID
 */
const sessionPublicId = "00000000-0000-4000-8000-000000000102";

/**
 * 관리자 주체
 */
const adminSubject = "00000000-0000-4000-8000-000000000901";

/**
 * 스캐너 주체
 */
const scannerSubject = "scanner:integration-roster";

/**
 * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
 */
function bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}

/**
 * 기준 시각(2026-07-17 01:00 UTC)에서 분 단위로 떨어진 시각
 */
function at(minute: number): Date {
  return new Date(Date.UTC(2026, 6, 17, 1, minute));
}

/**
 * 테스트 학생
 */
type TestStudent = {
  /**
   * 학생 ID
   */
  readonly id: bigint;

  /**
   * 학생 공개 ID
   */
  readonly publicId: string;

  /**
   * 학번
   */
  readonly sourceStudentNo: string;

  /**
   * 이름
   */
  readonly name: string;

  /**
   * 대표 반
   */
  readonly className: string;

  /**
   * 학교
   */
  readonly schoolName: string | null;

  /**
   * 학년
   */
  readonly grade: string | null;

  /**
   * 담임
   */
  readonly teacherName: string | null;

  /**
   * 단위
   */
  readonly unitName: string | null;
};

/**
 * 예약 상태
 */
type BookingStatus = "RESERVED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";

/**
 * 예약 이벤트 종류
 */
type BookingEventType = "CREATED" | "UPDATED" | "CANCELLED" | "QR_ISSUED" | "CHECKED_IN" | "MARKED_NO_SHOW";

/**
 * 예약 참가자 입력
 */
interface TestChild {
  /**
   * 참여 유형
   */
  readonly participantType: "ENROLLED" | "GUEST";

  /**
   * 재원생 학생
   */
  readonly student?: TestStudent;

  /**
   * 비재원생 이름
   */
  readonly name?: string;

  /**
   * 캠퍼스
   */
  readonly branch?: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 학번 표시
   */
  readonly sourceStudentNo?: string;

  /**
   * 반
   */
  readonly className?: string;

  /**
   * 학교
   */
  readonly schoolName?: string;

  /**
   * 학년
   */
  readonly grade?: string;

  /**
   * 담임 스냅샷
   */
  readonly teacherName?: string;

  /**
   * 단위 스냅샷
   */
  readonly unitName?: string;
}

/**
 * 예약 이벤트 입력
 */
interface TestEvent {
  /**
   * 이벤트 종류
   */
  readonly eventType: BookingEventType;

  /**
   * 처리 주체
   */
  readonly actorSubject?: string | null;

  /**
   * 발생 시각
   */
  readonly occurredAt: Date;
}

// 관리자 회차 명단 통합 테스트. PostgreSQL 컨테이너 사용
describe("ADMIN seminar session roster", () => {
  // PostgreSQL 컨테이너
  let postgres: StartedTestContainer;

  // DB 클라이언트
  let prisma: PrismaService;

  // 연락처 보호
  let protector: PhoneProtector;

  // 명단 서비스
  let service: SessionRosterService;

  // 통계 서비스
  let statisticsService: SessionStatisticsService;

  // 학생 서비스
  let studentsService: StudentsService;

  // DB 연결 URL
  let databaseUrl: string;

  // 테스트 회차 ID
  let sessionInternalId: bigint;

  // 동기화 실행 ID
  let syncRunId: bigint;

  // A 지점 ID
  let campusABranchId: bigint;

  // B 지점 ID
  let campusBBranchId: bigint;

  // C 지점 ID
  let campusCBranchId: bigint;

  // 키별 테스트 학생
  const students = new Map<string, TestStudent>();

  // 키별 테스트 예약
  const bookings = new Map<string, Awaited<ReturnType<typeof createBooking>>>();

  // 예약 없는 학생의 어머니 연락처
  const unbookedMother = "01021110001";

  // 예약 없는 학생의 아버지 연락처
  const unbookedFather = "01021110002";

  // 비재원생 예약 연락처
  const guestContact = "01027778888";

  // 컨테이너 기동, 마이그레이션, 학생·예약·이벤트 시나리오 데이터 구성
  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_PASSWORD: "integration_only", POSTGRES_DB: "npr_roster" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();
    databaseUrl = `postgresql://postgres:integration_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_roster`;
    execFileSync(resolve(apiDirectory, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: apiDirectory,
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
    const environment: AppEnvironment = {
      appEnv: "test",
      processRole: "api",
      port: 4000,
      databaseUrl,
      phoneEncryptionKey: "BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=",
      phoneHmacKey: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=",
      publicBaseUrl: "https://public.test",
      trustProxy: 0,
      tongSyncEnabled: false,
      smsEnabled: false,
      smsRecipientAllowlistEnabled: true,
      smsTestRecipients: new Set(),
      smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined },
      smsAligoTestMode: true,
      googleSheetsEnabled: false,
      sessionIdleTtlSeconds: 28_800,
      sessionAbsoluteTtlSeconds: 86_400,
    };
    prisma = new PrismaService(environment);
    protector = new PhoneProtector(environment);
    service = new SessionRosterService(prisma, protector);
    statisticsService = new SessionStatisticsService(prisma);
    studentsService = new StudentsService(prisma, {} as never, protector);
    sessionInternalId = (await prisma.seminarSession.findUniqueOrThrow({ where: { publicId: sessionPublicId } })).id;
    campusABranchId = (await prisma.branch.findUniqueOrThrow({ where: { code: "CAMPUS_A" } })).id;
    campusBBranchId = (await prisma.branch.findUniqueOrThrow({ where: { code: "CAMPUS_B" } })).id;
    campusCBranchId = (await prisma.branch.findUniqueOrThrow({ where: { code: "CAMPUS_C" } })).id;
    syncRunId = (await prisma.syncRun.create({ data: {
      runType: "OFFLINE_INITIAL_DRY_RUN",
      status: "RUNNING",
      publishable: true,
      loginAttempted: true,
    } })).id;

    students.set("unbooked", await createStudent({
      sourceStudentNo: "ROSTER-001",
      name: "미예약 학생",
      className: "１A",
      teacherName: "　미예약교사　， 한종보 ",
      unitName: "원본단위",
      motherPhone: unbookedMother,
      fatherPhone: unbookedFather,
    }));
    students.set("siblingOne", await createStudent({
      sourceStudentNo: "ROSTER-002", name: "형제 하나", className: "고1A", teacherName: " 이교사, 다른교사 ", unitName: "원본단위",
      motherPhone: "01023334444", fatherPhone: "01025556666",
    }));
    students.set("siblingTwo", await createStudent({
      sourceStudentNo: "ROSTER-003", name: "형제 둘", className: "고1B", teacherName: "이교사,다른교사", unitName: "원본단위",
    }));
    students.set("rebooked", await createStudent({
      sourceStudentNo: "ROSTER-004", name: "재예약 학생", className: "미분류", teacherName: " 김수민 ,한종보 ", unitName: "원본단위",
    }));
    students.set("publicCancelled", await createStudent({
      sourceStudentNo: "ROSTER-005", name: "웹 취소", className: "2A", teacherName: "취소교사", unitName: "원본단위",
    }));
    students.set("adminCancelled", await createStudent({
      sourceStudentNo: "ROSTER-006", name: "수동 취소", className: "3A", teacherName: "취소교사", unitName: "원본단위",
    }));
    students.set("noShow", await createStudent({
      sourceStudentNo: "ROSTER-007", name: "미참석 학생", className: "초6S", teacherName: "취소교사", unitName: "원본단위",
    }));
    students.set("otherBranch", await createStudent({
      sourceStudentNo: "2050929", name: "강민진", className: "과고2역학SKY[일5]", teacherName: "박세영", unitName: "원본단위", branchId: campusBBranchId,
    }));
    students.set("scienceSortFirst", await createStudent({
      sourceStudentNo: "ROSTER-013", name: "정렬 과학", className: "과고3힣", teacherName: "B추적교사", unitName: "원본단위", branchId: campusBBranchId,
    }));
    students.set("campusC", await createStudent({
      sourceStudentNo: "ROSTER-012", name: "C 초등", className: "4A", teacherName: "C교사", unitName: "원본단위", branchId: campusCBranchId,
    }));
    students.set("highNameFirst", await createStudent({
      sourceStudentNo: "ROSTER-010", name: "가학생", className: "고2Z", teacherName: "정렬교사", unitName: "원본단위",
    }));
    students.set("highNameSecond", await createStudent({
      sourceStudentNo: "ROSTER-011", name: "나학생", className: "고2Z", teacherName: "정렬교사", unitName: "원본단위",
    }));
    await createAssignment(students.get("highNameFirst")!, "고2Z", "정렬교사");
    await createAssignment(students.get("highNameFirst")!, "과2B", "과학교사");
    await createAssignment(students.get("highNameFirst")!, "과1A", "과학교사");
    await createAssignment(students.get("highNameFirst")!, "물리심화", "과학교사");
    await createAssignment(students.get("highNameSecond")!, "고2Z", "정렬교사");
    await createAssignment(students.get("siblingOne")!, "고1A[토3]", "이교사");
    await createAssignment(students.get("siblingOne")!, "과1특A[일4]", "과학교사");
    await createAssignment(students.get("siblingTwo")!, "고1B", "이교사");
    await createAssignment(students.get("otherBranch")!, "과고2역학SKY[일5]", "박세영");
    await createAssignment(students.get("otherBranch")!, "과고2화학SKY[일4]", "김성현");
    await createAssignment(students.get("scienceSortFirst")!, "과1A", "B추적교사");
    await createStudent({
      sourceStudentNo: "ROSTER-009", name: "비활성 학생", className: "1A", teacherName: "비활성교사", unitName: "원본단위", sourceActive: false,
    });

    const unbooked = students.get("unbooked")!;
    await prisma.studentClassAssignment.create({ data: {
      studentId: unbooked.id,
      sourceUniqueNo: "RAW-ASSIGNMENT-001",
      classRegistrationNo: "RAW-CLASS-001",
      className: unbooked.className,
      teacherName: "　미예약교사　， 한종보 ",
      unitName: "원본단위",
      sourceHash: bytes(randomBytes(32)),
      firstSeenRunId: syncRunId,
      lastSeenRunId: syncRunId,
    } });
    await prisma.stagingStudent.create({ data: {
      syncRunId,
      branchId: campusABranchId,
      sourceOrdinal: 1,
      sourceUniqueNo: "RAW-STAGING-001",
      classRegistrationNo: "RAW-STAGING-CLASS-001",
      sourceStudentNo: unbooked.sourceStudentNo,
      name: unbooked.name,
      className: unbooked.className,
      teacherName: "　미예약교사　， 한종보 ",
      unitName: "원본단위",
      rowHash: bytes(randomBytes(32)),
      included: true,
      primaryCandidate: true,
      primarySelected: true,
    } });
    await prisma.syncRun.update({
      where: { id: syncRunId },
      data: { status: "PUBLISHED", publishedAt: at(1), publishedBy: "integration:roster" },
    });

    bookings.set("siblings", await createBooking({
      phone: "01022220001",
      status: "CHECKED_IN",
      createdAt: at(10),
      children: [students.get("siblingOne")!, students.get("siblingTwo")!].map((student) => ({
        participantType: "ENROLLED" as const,
        student,
        teacherName: ` ${student.teacherName} `,
        unitName: "원본단위",
      })),
      events: [
        { eventType: "CREATED", actorSubject: null, occurredAt: at(10) },
        { eventType: "CHECKED_IN", actorSubject: scannerSubject, occurredAt: at(11) },
        { eventType: "QR_ISSUED", actorSubject: null, occurredAt: at(12) },
      ],
    }));
    bookings.set("rebookedOld", await createBooking({
      phone: "01022220002", status: "CANCELLED", createdAt: at(20), children: [enrolledChild(students.get("rebooked")!)],
      events: [
        { eventType: "CREATED", actorSubject: null, occurredAt: at(20) },
        { eventType: "CANCELLED", actorSubject: null, occurredAt: at(21) },
      ],
    }));
    bookings.set("rebookedNew", await createBooking({
      phone: "01022220002", status: "RESERVED", createdAt: at(30), children: [enrolledChild(students.get("rebooked")!)],
      events: [{ eventType: "CREATED", actorSubject: null, occurredAt: at(30) }],
    }));
    bookings.set("publicCancelled", await createBooking({
      phone: "01022220003", status: "CANCELLED", createdAt: at(40), children: [enrolledChild(students.get("publicCancelled")!)],
      events: [{ eventType: "CANCELLED", actorSubject: null, occurredAt: at(41) }],
    }));
    bookings.set("adminCancelled", await createBooking({
      phone: "01022220004", status: "CANCELLED", createdAt: at(50), bookingSource: "PHONE",
      children: [enrolledChild(students.get("adminCancelled")!)],
      events: [{ eventType: "CANCELLED", actorSubject: adminSubject, occurredAt: at(51) }],
    }));
    bookings.set("noShow", await createBooking({
      phone: "01022220005", status: "NO_SHOW", createdAt: at(60), children: [enrolledChild(students.get("noShow")!)],
      events: [{ eventType: "MARKED_NO_SHOW", actorSubject: adminSubject, occurredAt: at(61) }],
    }));
    bookings.set("otherBranch", await createBooking({
      phone: "01022220006", status: "RESERVED", createdAt: at(65),
      children: [{ ...enrolledChild(students.get("otherBranch")!), branch: "CAMPUS_B" }],
      events: [{ eventType: "CREATED", actorSubject: adminSubject, occurredAt: at(65) }],
      bookingSource: "TEACHER",
    }));
    bookings.set("scienceSortFirst", await createBooking({
      phone: "01022220008", status: "RESERVED", createdAt: at(64),
      children: [{ ...enrolledChild(students.get("scienceSortFirst")!), branch: "CAMPUS_B" }],
      events: [{ eventType: "CREATED", actorSubject: adminSubject, occurredAt: at(64) }],
      bookingSource: "TEACHER",
    }));
    bookings.set("campusC", await createBooking({
      phone: "01022220007", status: "RESERVED", createdAt: at(66),
      children: [{ ...enrolledChild(students.get("campusC")!), branch: "CAMPUS_C" }],
      events: [{ eventType: "CREATED", actorSubject: adminSubject, occurredAt: at(66) }],
      bookingSource: "TEACHER",
    }));
    bookings.set("guestOld", await createBooking({
      phone: guestContact, status: "CANCELLED", createdAt: at(70),
      children: [{ participantType: "GUEST", name: "　게스트학생　", sourceStudentNo: "GUEST-OLD" }],
      events: [{ eventType: "CANCELLED", actorSubject: null, occurredAt: at(71) }],
    }));
    bookings.set("guestNew", await createBooking({
      phone: guestContact, status: "CHECKED_IN", createdAt: at(80),
      children: [{ participantType: "GUEST", name: "게스트학생", sourceStudentNo: "GUEST-NEW" }],
      events: [
        { eventType: "CREATED", actorSubject: adminSubject, occurredAt: at(80) },
        { eventType: "CHECKED_IN", actorSubject: scannerSubject, occurredAt: at(81) },
      ],
      bookingSource: "PHONE",
    }));

    const canonicalMigration = readFileSync(resolve(
      apiDirectory,
      "prisma/migrations/20260717231000_canonical_roster_display_fields/migration.sql",
    ), "utf8");
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await pool.query(canonicalMigration);
      await pool.query(canonicalMigration);
    } finally {
      await pool.end();
    }
  });

  // 연결 종료와 컨테이너 정지
  afterAll(async () => {
    await prisma?.$disconnect();
    await postgres?.stop();
  });

  // 재원생 참가자 입력. 단위 스냅샷은 원본 값으로 둠
  function enrolledChild(student: TestStudent): TestChild {
    return {
      participantType: "ENROLLED",
      student,
      ...(student.teacherName === null ? {} : { teacherName: student.teacherName }),
      unitName: "원본단위",
    };
  }

  // 학생 원장 행 생성
  async function createStudent(input: {
    readonly sourceStudentNo: string;
    readonly name: string;
    readonly className: string;
    readonly teacherName: string;
    readonly unitName: string;
    readonly motherPhone?: string;
    readonly fatherPhone?: string;
    readonly branchId?: bigint;
    readonly sourceActive?: boolean;
  }): Promise<TestStudent> {
    const mother = input.motherPhone === undefined ? null : protector.protect(input.motherPhone);
    const father = input.fatherPhone === undefined ? null : protector.protect(input.fatherPhone);
    return prisma.student.create({ data: {
      sourceStudentNo: input.sourceStudentNo,
      branchId: input.branchId ?? campusABranchId,
      name: input.name,
      className: input.className,
      schoolName: "통합테스트학교",
      grade: "3",
      teacherName: input.teacherName,
      unitName: input.unitName,
      sourceHash: bytes(randomBytes(32)),
      sourceActive: input.sourceActive ?? true,
      ...((input.sourceActive ?? true) ? {} : { sourceInactivatedAt: at(0) }),
      firstSeenRunId: syncRunId,
      lastSeenRunId: syncRunId,
      ...(mother === null ? {} : {
        motherPhoneCiphertext: bytes(mother.ciphertext),
        motherPhoneDigest: bytes(mother.digest),
        motherPhoneLast4: mother.last4,
      }),
      ...(father === null ? {} : {
        fatherPhoneCiphertext: bytes(father.ciphertext),
        fatherPhoneDigest: bytes(father.digest),
        fatherPhoneLast4: father.last4,
      }),
    } });
  }

  // 학생의 활성 수강 등록 생성
  async function createAssignment(student: TestStudent, className: string, teacherName: string) {
    return prisma.studentClassAssignment.create({ data: {
      studentId: student.id,
      sourceUniqueNo: `RAW-${randomUUID()}`,
      classRegistrationNo: `CLASS-${randomUUID()}`,
      className,
      teacherName,
      unitName: "원본단위",
      schoolName: student.schoolName,
      grade: student.grade,
      sourceHash: bytes(randomBytes(32)),
      firstSeenRunId: syncRunId,
      lastSeenRunId: syncRunId,
    } });
  }

  // 참가자·이벤트를 포함한 예약 생성
  async function createBooking(input: {
    readonly phone: string;
    readonly status: BookingStatus;
    readonly createdAt: Date;
    readonly children: readonly TestChild[];
    readonly events: readonly TestEvent[];
    readonly bookingSource?: "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE";
  }) {
    const contact = protector.protect(input.phone);
    const proof = await prisma.otpProofAudit.create({ data: {
      proofDigest: bytes(randomBytes(32)),
      purpose: "FAMILY_BOOKING",
      contactDigest: bytes(contact.digest),
      contactCiphertext: bytes(contact.ciphertext),
      contactLast4: contact.last4,
      status: "VERIFIED",
      expiresAt: new Date(input.createdAt.getTime() + 600_000),
      verifiedAt: input.createdAt,
    } });
    const terminal = input.status === "CANCELLED" || input.status === "NO_SHOW";
    const releasedAt = terminal ? new Date(input.createdAt.getTime() + 60_000) : null;
    return prisma.familyBooking.create({
      data: {
        sessionId: sessionInternalId,
        contactDigest: bytes(contact.digest),
        contactCiphertext: bytes(contact.ciphertext),
        contactLast4: contact.last4,
        attendanceParty: "MOTHER",
        seatCount: 1,
        status: input.status,
        bookingSource: input.bookingSource ?? "WEB_APP",
        otpProofAuditId: proof.id,
        createdAt: input.createdAt,
        ...(input.status === "CHECKED_IN" ? { checkedInAt: new Date(input.createdAt.getTime() + 60_000) } : {}),
        ...(input.status === "CANCELLED" ? { cancelledAt: releasedAt } : {}),
        students: { create: input.children.map((child) => {
          const student = child.student;
          return {
            participantType: child.participantType,
            studentId: student?.id ?? null,
            active: !terminal,
            releasedAt,
            branchCodeAtBooking: child.branch ?? "CAMPUS_A",
            sourceStudentNoSnapshot: child.sourceStudentNo ?? student?.sourceStudentNo ?? `GUEST-${randomUUID()}`,
            studentNameSnapshot: child.name ?? student?.name ?? "게스트",
            classNameSnapshot: child.className ?? student?.className ?? "비재원생",
            schoolNameSnapshot: child.schoolName ?? student?.schoolName ?? null,
            gradeSnapshot: child.grade ?? student?.grade ?? null,
            unitNameSnapshot: child.unitName ?? student?.unitName ?? null,
            teacherNameSnapshot: child.teacherName ?? student?.teacherName ?? null,
          };
        }) },
        bookingEvents: { create: input.events.map((event) => ({
          eventType: event.eventType,
          actorSubject: event.actorSubject ?? null,
          ...(event.eventType === "CANCELLED" ? {
            cancellationType: event.actorSubject === null || event.actorSubject === undefined ? "SELF_SERVICE" : "OTHER",
          } : {}),
          occurredAt: event.occurredAt,
          safeMetadata: {},
        })) },
      },
      include: { students: { orderBy: { id: "asc" } } },
    });
  }

  // 운영 표시 열 백필은 표시 열만 채우고 재실행해도 결과 동일
  it("backfills only operational display columns and remains idempotent", async () => {
    const unbooked = await prisma.student.findUniqueOrThrow({
      where: { sourceStudentNo: "ROSTER-001" },
      include: { assignments: true },
    });
    expect(unbooked).toMatchObject({ teacherName: "미예약교사", unitName: "중등1", className: "１A" });
    expect(unbooked.assignments).toHaveLength(1);
    expect(unbooked.assignments[0]).toMatchObject({ teacherName: "미예약교사", unitName: "중등1", className: "１A" });

    const siblingSnapshot = await prisma.familyBookingStudent.findFirstOrThrow({
      where: { familyBookingId: bookings.get("siblings")!.id },
      orderBy: { id: "asc" },
    });
    expect(siblingSnapshot).toMatchObject({ teacherNameSnapshot: "이교사", unitNameSnapshot: "고등" });

    const staging = await prisma.stagingStudent.findFirstOrThrow({ where: { syncRunId } });
    expect(staging.teacherName).toBe("　미예약교사　， 한종보 ");
    expect(staging.unitName).toBe("원본단위");
  });

  // 예약과 연결된 형제·종료·재예약·중복 제거된 비재원생 행만 반환하고 QR 이벤트는 제외
  it("returns only booking-linked sibling, terminal, rebooked, and deduplicated guest rows without QR noise", async () => {
    const result = await service.list(sessionPublicId, {
      branch: "CAMPUS_A", unitGroup: "ALL", page: 1, pageSize: 100,
    });
    expect(result.page).toEqual({ page: 1, pageSize: 100, totalItems: 7, totalPages: 1 });
    expect(result.monitoring).toEqual({
      studentCount: 4,
      familyBookingCount: 3,
      attendeeCount: 3,
    });
    expect(result.facets.teachers).toEqual(["이교사"]);
    expect(result.facets.unmatchedUnitCount).toBe(1);
    expect(result.items.some((row) => row.studentId === students.get("unbooked")!.publicId)).toBe(false);
    expect(result.items.every((row) => row.booking !== null && row.familyBookingStudentId !== null
      && row.bookingHistory.length > 0)).toBe(true);
    expect(result.items.map((row) => row.name)).toEqual([
      "웹 취소", "수동 취소", "미참석 학생", "형제 하나", "형제 둘", "게스트학생", "재예약 학생",
    ]);

    const siblingOne = result.items.find((row) => row.studentId === students.get("siblingOne")!.publicId)!;
    const siblingTwo = result.items.find((row) => row.studentId === students.get("siblingTwo")!.publicId)!;
    expect(siblingOne.booking?.familyBookingId).toBe(bookings.get("siblings")!.publicId);
    expect(siblingTwo.booking?.familyBookingId).toBe(bookings.get("siblings")!.publicId);
    expect(siblingOne.familyBookingStudentId).toBe(siblingOne.booking?.familyBookingStudentId);
    expect(siblingOne.latestOperationalEvent).toMatchObject({
      type: "CHECKED_IN", actorType: "SCANNER", label: "입장 완료",
    });
    expect(siblingOne).toMatchObject({
      mathClassName: "고1A[토3]",
      scienceClassNames: ["과1특A[일4]"],
    });
    expect(siblingOne.latestOperationalEvent).not.toHaveProperty("actorSubject");

    const rebooked = result.items.find((row) => row.studentId === students.get("rebooked")!.publicId)!;
    expect(rebooked.booking?.familyBookingId).toBe(bookings.get("rebookedNew")!.publicId);
    expect(rebooked.booking?.status).toBe("RESERVED");
    expect(rebooked.bookingHistory).toHaveLength(2);
    expect(new Set(rebooked.bookingHistory.map((entry) => entry.familyBookingId))).toEqual(new Set([
      bookings.get("rebookedOld")!.publicId,
      bookings.get("rebookedNew")!.publicId,
    ]));
    expect(rebooked.bookingHistory.every((entry) => entry.eventsPath === `/api/v1/admin/family-bookings/${entry.familyBookingId}/events`)).toBe(true);
    expect(rebooked.latestOperationalEvent).toMatchObject({ type: "CREATED", actorType: "PUBLIC_PROOF", label: "웹앱 예약" });

    const publicCancelled = result.items.find((row) => row.studentId === students.get("publicCancelled")!.publicId)!;
    expect(publicCancelled.latestOperationalEvent).toMatchObject({
      type: "CANCELLED", actorType: "PUBLIC_PROOF", label: "웹앱 예약 취소",
    });
    const adminCancelled = result.items.find((row) => row.studentId === students.get("adminCancelled")!.publicId)!;
    expect(adminCancelled.latestOperationalEvent).toMatchObject({
      type: "CANCELLED", actorType: "ADMIN", label: "수동 예약 취소",
    });
    const noShow = result.items.find((row) => row.studentId === students.get("noShow")!.publicId)!;
    expect(noShow.latestOperationalEvent).toMatchObject({
      type: "MARKED_NO_SHOW", actorType: "ADMIN", label: "미참석 처리",
    });

    const guestRows = result.items.filter((row) => row.participantType === "GUEST");
    expect(guestRows).toHaveLength(1);
    const guest = guestRows[0]!;
    expect(guest.rosterEntryId).toBe(bookings.get("guestOld")!.students[0]!.publicId);
    expect(guest.familyBookingStudentId).toBe(bookings.get("guestNew")!.students[0]!.publicId);
    expect(guest.booking?.familyBookingId).toBe(bookings.get("guestNew")!.publicId);
    expect(guest.booking?.bookingSource).toBe("PHONE");
    expect(guest.latestOperationalEvent).toMatchObject({ type: "CHECKED_IN", actorType: "SCANNER", label: "입장 완료" });
    expect(guest.bookingHistory).toHaveLength(2);
    expect(guest.motherPhone).toBeNull();
    expect(guest.fatherPhone).toBeNull();
    expect(guest.guestContact === guestContact).toBe(true);
  });

  // 캠퍼스·단위·담임·검색어·연락처·비재원생·페이지 필터가 부작용 없이 적용
  it("applies branch, unit, teacher, text/contact, guest, and pagination filters without side effects", async () => {
    const middleOne = await service.list(sessionPublicId, { branch: "CAMPUS_A", unitGroup: "MIDDLE_1", page: 1, pageSize: 100 });
    expect(middleOne.items).toEqual([]);

    const high = await service.list(sessionPublicId, { branch: "CAMPUS_A", unitGroup: "HIGH", page: 1, pageSize: 100 });
    expect(new Set(high.items.map((row) => row.studentId))).toEqual(new Set([
      students.get("siblingOne")!.publicId, students.get("siblingTwo")!.publicId,
    ]));

    const teacher = await service.list(sessionPublicId, {
      branch: "CAMPUS_A", unitGroup: "ALL", teacherName: " 이교사，다른교사 ", page: 1, pageSize: 100,
    });
    expect(teacher.items.map((row) => row.studentId)).toEqual([
      students.get("siblingOne")!.publicId,
      students.get("siblingTwo")!.publicId,
    ]);
    expect(teacher.facets.teachers).toEqual(["이교사"]);

    const byContact = await service.list(sessionPublicId, {
      branch: "CAMPUS_A", unitGroup: "ALL", query: unbookedMother.slice(-4), page: 1, pageSize: 100,
    });
    expect(byContact.items).toEqual([]);

    const guest = await service.list(sessionPublicId, { branch: "CAMPUS_A", unitGroup: "GUEST", page: 1, pageSize: 100 });
    expect(guest.items).toHaveLength(1);
    expect(guest.items[0]!.participantType).toBe("GUEST");

    const campusB = await service.list(sessionPublicId, { branch: "CAMPUS_B", unitGroup: "SCIENCE", page: 1, pageSize: 100 });
    expect(campusB.items.map((row) => row.studentId)).toEqual([
      students.get("scienceSortFirst")!.publicId,
      students.get("otherBranch")!.publicId,
    ]);
    expect(campusB.items.every((row) => row.primaryTeacher === null)).toBe(true);
    expect(campusB.items.find((row) => row.studentId === students.get("otherBranch")!.publicId)).toMatchObject({
      sourceStudentNo: "2050929",
      name: "강민진",
      mathClassName: null,
      scienceClassNames: ["과고2역학SKY[일5]", "과고2화학SKY[일4]"],
      primaryTeacher: null,
    });
    expect(campusB.facets).toEqual({ teachers: [], unmatchedUnitCount: 0 });
    const scienceTeacher = await service.list(sessionPublicId, {
      branch: "CAMPUS_B", unitGroup: "ALL", teacherName: "박세영", page: 1, pageSize: 100,
    });
    expect(scienceTeacher.items).toEqual([]);
    expect(scienceTeacher.facets.teachers).toEqual([]);

    const allCampuses = await service.list(sessionPublicId, { unitGroup: "ALL", page: 1, pageSize: 100 });
    expect([...new Set(allCampuses.items.map((item) => item.branch))]).toEqual(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]);
    expect(allCampuses.monitoring).toEqual({
      studentCount: 7,
      familyBookingCount: 6,
      attendeeCount: 6,
    });

    const paged = await service.list(sessionPublicId, { branch: "CAMPUS_A", unitGroup: "ALL", page: 2, pageSize: 3 });
    expect(paged.items).toHaveLength(3);
    expect(paged.page).toEqual({ page: 2, pageSize: 3, totalItems: 7, totalPages: 3 });
    expect(await prisma.smsOutbox.count()).toBe(0);
    expect(await prisma.sheetOutbox.count()).toBe(0);
  });

  // 비재원생 가족 예약은 요약·경로·전체 단위에 포함하고 개별 단위는 재원생만
  it("counts guest family bookings in summary, channels, and the ALL unit while concrete units stay enrolled-only", async () => {
    const operations = await statisticsService.operationsSummary(sessionPublicId);
    expect(operations).toEqual({
      activeBookingCount: 6,
      checkedInBookingCount: 2,
      uncheckedBookingCount: 4,
      cancelledBookingCount: 4,
      noShowBookingCount: 1,
      attendeeCount: 6,
    });

    const all = await statisticsService.statistics(sessionPublicId);
    expect(all).toMatchObject({
      branch: null,
      summary: {
        activeBookingCount: 6,
        reservedBookingCount: 4,
        checkedInBookingCount: 2,
        cancelledBookingCount: 4,
        noShowBookingCount: 1,
        monitoring: { studentCount: 7, familyBookingCount: 6, attendeeCount: 6 },
      },
    });
    expect(all.units).toHaveLength(8);
    expect(all.units.find((row) => row.unitGroup === "ALL")).toEqual({
      unitGroup: "ALL",
      activeBookingCount: 6,
      reservedBookingCount: 4,
      checkedInBookingCount: 2,
      monitoring: { studentCount: 7, familyBookingCount: 6, attendeeCount: 6 },
    });
    expect(all.units.find((row) => row.unitGroup === "HIGH")).toEqual({
      unitGroup: "HIGH",
      activeBookingCount: 1,
      reservedBookingCount: 0,
      checkedInBookingCount: 1,
      monitoring: { studentCount: 2, familyBookingCount: 1, attendeeCount: 1 },
    });
    expect(all.summary.activeBookingCount).toBe(
      all.summary.reservedBookingCount + all.summary.checkedInBookingCount,
    );
    expect(operations.uncheckedBookingCount).toBe(all.summary.reservedBookingCount);
    expect(all.units.some((row) => (row.unitGroup as string) === "GUEST")).toBe(false);
    const allUnit = all.units.find((row) => row.unitGroup === "ALL")!;
    expect(allUnit.activeBookingCount).toBe(all.summary.activeBookingCount);
    expect(allUnit.reservedBookingCount).toBe(all.summary.reservedBookingCount);
    expect(allUnit.checkedInBookingCount).toBe(all.summary.checkedInBookingCount);
    expect(await prisma.familyBooking.count({
      where: {
        sessionId: sessionInternalId,
        status: "CHECKED_IN",
        students: { some: { participantType: "GUEST" } },
      },
    })).toBe(1);
    expect(all.channels).toEqual([
      {
        channel: "MOBILE",
        bookingSources: ["WEB_APP"],
        activeBookingCount: 2,
        reservedBookingCount: 1,
        checkedInBookingCount: 1,
        cancelledBookingCount: 3,
        noShowBookingCount: 1,
          monitoring: { studentCount: 3, familyBookingCount: 2, attendeeCount: 2 },
      },
      {
        channel: "MANUAL",
        bookingSources: ["PHONE", "TEACHER", "ON_SITE"],
        activeBookingCount: 4,
        reservedBookingCount: 3,
        checkedInBookingCount: 1,
        cancelledBookingCount: 1,
        noShowBookingCount: 0,
        monitoring: { studentCount: 4, familyBookingCount: 4, attendeeCount: 4 },
      },
    ]);
    for (const field of [
      "activeBookingCount",
      "reservedBookingCount",
      "checkedInBookingCount",
      "cancelledBookingCount",
      "noShowBookingCount",
    ] as const) {
      expect(all.channels.reduce((total, channel) => total + channel[field], 0)).toBe(all.summary[field]);
    }

    const campusA = await statisticsService.statistics(sessionPublicId, "CAMPUS_A");
    expect(campusA.summary).toEqual({
      activeBookingCount: 3,
      reservedBookingCount: 1,
      checkedInBookingCount: 2,
      cancelledBookingCount: 4,
      noShowBookingCount: 1,
      monitoring: { studentCount: 4, familyBookingCount: 3, attendeeCount: 3 },
    });
  });

  // 엑셀은 화면 페이지와 무관하게 필터 결과 전체와 운영 열·전체 연락처를 포함
  it("exports every filtered row independently of UI pagination with operational columns and full parent phones", async () => {
    const output = await service.exportXlsx(sessionPublicId, {
      branch: "CAMPUS_A",
      unitGroup: "HIGH",
      teacherName: "이교사",
      query: "형제",
      page: 2,
      pageSize: 1,
    } as never);
    const workbook = new ExcelJS.Workbook();
    const workbookBytes = new Uint8Array(new ArrayBuffer(output.byteLength));
    workbookBytes.set(output);
    await workbook.xlsx.load(Buffer.from(workbookBytes.buffer) as never);
    const worksheet = workbook.getWorksheet("예약명단");
    expect(worksheet).toBeDefined();
    expect((worksheet!.getRow(1).values as unknown[]).slice(1)).toEqual([
      "예약일시", "예약번호", "참여유형", "학번", "캠퍼스", "학생명", "대표반", "수학반",
      "과학반", "단위", "학교", "학년", "담임", "학부모HP (모)", "학부모HP (부)",
      "예약경로", "참석자", "예약인원", "입장인원", "예약상태", "체크인상태", "체크인일시",
      "최근이벤트", "최근이벤트코드", "최근이벤트일시",
    ]);
    expect(worksheet!.rowCount).toBe(3);
    const exportedRows = [worksheet!.getRow(2), worksheet!.getRow(3)];
    const siblingOne = exportedRows.find((row) => row.getCell(6).text === "형제 하나");
    expect(siblingOne?.getCell(3).text).toBe("재원생");
    expect(siblingOne?.getCell(5).text).toBe("A");
    expect(siblingOne?.getCell(8).text).toBe("고1A[토3]");
    expect(siblingOne?.getCell(9).text).toBe("과1특A[일4]");
    expect(siblingOne?.getCell(10).text).toBe("고등");
    expect(siblingOne?.getCell(14).text).toBe("01023334444");
    expect(siblingOne?.getCell(15).text).toBe("01025556666");
    expect(siblingOne?.getCell(20).text).toBe("예약");
    expect(siblingOne?.getCell(21).text).toBe("입장 완료");
    expect(siblingOne?.getCell(22).text).toBe("2026-07-17 10:11:00");
    expect(siblingOne?.getCell(23).text).toBe("입장 완료");
    expect(siblingOne?.getCell(24).text).toBe("CHECKED_IN");
    expect(siblingOne?.getCell(25).text).toBe("2026-07-17 10:11:00");

    const contactOutput = await service.exportXlsx(sessionPublicId, {
      branch: "CAMPUS_A",
      unitGroup: "ALL",
      query: "4444",
    });
    const contactWorkbook = new ExcelJS.Workbook();
    await contactWorkbook.xlsx.load(contactOutput as never);
    const contactSheet = contactWorkbook.getWorksheet("예약명단")!;
    expect(contactSheet.rowCount).toBe(2);
    expect(contactSheet.getRow(2).getCell(6).text).toBe("형제 하나");
  });

  // 학생 상태 정렬을 페이지 전에 적용하고 공통 단위 그룹 필터 사용
  it("sorts student status before pagination and applies the shared unit-group filter", async () => {
    const result = await studentsService.list({ unitGroup: "ALL", sourceActive: true, page: 1, pageSize: 100 });
    expect(result.facets.teachers).toEqual([
      "미예약교사", "이교사", "정렬교사",
    ]);
    expect(result.summary.uniqueStudentCount).toBe(12);
    const branchOrder: Readonly<Record<string, number>> = { CAMPUS_A: 1, CAMPUS_B: 2, CAMPUS_C: 3 };
    const branchRanks = result.items.map((item) => branchOrder[item.branch] ?? 4);
    expect(branchRanks).toEqual([...branchRanks].sort((left, right) => left - right));

    const unitOrder: Readonly<Record<string, number>> = {
      "초등": 1, "중등1": 2, "중등2": 3, "중등3": 4, "특목": 5, "예중1": 5, "예고1": 5,
      "고등": 6, "과학": 7,
    };
    const campusAUnitRanks = result.items.filter((item) => item.branch === "CAMPUS_A")
      .map((item) => unitOrder[item.unitName ?? ""] ?? 9);
    expect(campusAUnitRanks).toEqual([...campusAUnitRanks].sort((left, right) => left - right));

    const sameClassNames = result.items
      .filter((item) => item.representativeClass.displayName === "고2Z")
      .map((item) => item.name);
    expect(sameClassNames).toEqual(["가학생", "나학생"]);

    const high = await studentsService.list({ unitGroup: "HIGH", sourceActive: true, page: 1, pageSize: 100 });
    expect(high.items.every((item) => item.unitName === "고등")).toBe(true);
    expect(high.page.totalItems).toBe(4);
    expect(high.summary).toMatchObject({
      uniqueStudentCount: 4,
      eligibleUniqueStudentCount: 4,
      mathStudentCount: 4,
      scienceOnlyStudentCount: 0,
    });
    expect(high.items.find((item) => item.name === "가학생")).toMatchObject({
      mathClassName: "고2Z",
      scienceClassNames: ["과1A", "과2B", "물리심화"],
    });

    const teacher = await studentsService.list({
      unitGroup: "ALL", teacherName: "정렬교사", sourceActive: true, page: 1, pageSize: 100,
    });
    expect(teacher.page.totalItems).toBe(2);
    expect(teacher.summary).toEqual(result.summary);
    expect(teacher.facets.teachers).toEqual(result.facets.teachers);
    const campusABaseline = await studentsService.list({
      branch: "CAMPUS_A", unitGroup: "ALL", sourceActive: true, page: 1, pageSize: 100,
    });
    expect(campusABaseline.summary.uniqueStudentCount).toBe(9);
    const normalizedTeacher = await studentsService.list({
      branch: "CAMPUS_A", unitGroup: "ALL", teacherName: " 이교사，다른교사 ", sourceActive: true,
      page: 1, pageSize: 1,
    });
    expect(normalizedTeacher.items.map((item) => item.name)).toEqual(["형제 하나"]);
    expect(normalizedTeacher.page.totalItems).toBe(2);
    expect(normalizedTeacher.summary).toEqual(campusABaseline.summary);
    expect(normalizedTeacher.facets.teachers).toEqual([
      "미예약교사", "이교사", "정렬교사",
    ]);
    const secondPage = await studentsService.list({
      branch: "CAMPUS_A", unitGroup: "ALL", sourceActive: true, page: 2, pageSize: 1,
    });
    expect(secondPage.facets).toEqual(normalizedTeacher.facets);
    expect(secondPage.summary).toEqual(campusABaseline.summary);
    const byQuery = await studentsService.list({
      unitGroup: "ALL", query: "가학생", sourceActive: true, page: 1, pageSize: 100,
    });
    expect(byQuery.page.totalItems).toBe(1);
    expect(byQuery.summary).toEqual(result.summary);
    expect(byQuery.facets.teachers).toEqual(["정렬교사"]);
    const byBranch = await studentsService.list({
      branch: "CAMPUS_B", unitGroup: "ALL", sourceActive: true, page: 1, pageSize: 100,
    });
    expect(byBranch.summary).toMatchObject({
      uniqueStudentCount: 2,
      mathRegularStudentCount: 0,
      scienceRegularStudentCount: 2,
    });
    expect(byBranch.facets.teachers).toEqual([]);
    expect(byBranch.items.map((item) => item.name)).toEqual(["정렬 과학", "강민진"]);
    const minjin = byBranch.items.find((item) => item.sourceStudentNo === "2050929")!;
    expect(minjin).toMatchObject({
      name: "강민진",
      teacherName: null,
      mathClassName: null,
      scienceClassNames: ["과고2역학SKY[일5]", "과고2화학SKY[일4]"],
    });
    expect(new Set(minjin.assignments.map((assignment: { teacherName: string | null }) => assignment.teacherName)))
      .toEqual(new Set(["김성현", "박세영"]));
    const byScienceTeacher = await studentsService.list({
      branch: "CAMPUS_B", unitGroup: "ALL", teacherName: "박세영", sourceActive: true,
      page: 1, pageSize: 100,
    });
    expect(byScienceTeacher.items).toEqual([]);
    expect(byScienceTeacher.page.totalItems).toBe(0);
    expect(byScienceTeacher.facets.teachers).toEqual([]);
    const guests = await studentsService.list({ unitGroup: "GUEST", sourceActive: true, page: 1, pageSize: 100 });
    expect(guests.page.totalItems).toBe(0);
    expect(guests.items).toEqual([]);
    expect(guests.summary).toMatchObject({
      uniqueStudentCount: 0,
      eligibleUniqueStudentCount: 0,
      mathStudentCount: 0,
      scienceOnlyStudentCount: 0,
      reviewRequiredStudentCount: 5,
    });
    const inactive = await studentsService.list({
      unitGroup: "ALL", sourceActive: false, page: 1, pageSize: 100,
    });
    expect(inactive.page.totalItems).toBe(1);
    expect(inactive.facets.teachers).toEqual([]);
    expect(inactive.summary).toEqual(result.summary);
  });
});
