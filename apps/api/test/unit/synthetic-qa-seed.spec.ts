import { describe, expect, it } from "vitest";
import {
  EXPECTED_QA_COUNTS,
  QA_BRANCH_STUDENT_COUNTS,
  buildSyntheticQaPlan,
  stableQaUuid,
} from "../../src/commands/synthetic-qa-data.js";
import {
  QA_RESET_CONFIRMATION,
  QA_SEED_CONFIRMATION,
  assertSyntheticQaSafety,
} from "../../src/commands/synthetic-qa-safety.js";

/**
 * 안전 조건을 모두 만족하는 환경 변수
 *
 * @param confirmation 확인 문구. 기본 적재 문구
 */
const safeEnvironment = (confirmation = QA_SEED_CONFIRMATION): NodeJS.ProcessEnv => ({
  APP_ENV: "staging",
  DATABASE_URL: "postgresql://npr_migrator:secret@127.0.0.1:55432/npr_seminar_qa",
  QA_DATA_CONFIRMATION: confirmation,
  SMS_ENABLED: "false",
  GOOGLE_SHEETS_ENABLED: "false",
  TONG_SYNC_ENABLED: "false",
});

// 합성 QA 안전 조건
describe("synthetic QA safety", () => {
  // 격리된 루프백 staging DB만 허용
  it("accepts only the isolated loopback staging database", () => {
    expect(assertSyntheticQaSafety(safeEnvironment(), "seed")).toMatchObject({
      databaseName: "npr_seminar_qa", action: "seed",
    });
    expect(assertSyntheticQaSafety(safeEnvironment(QA_RESET_CONFIRMATION), "reset")).toMatchObject({ action: "reset" });
  });

  // 운영 환경, 원격·기본 포트·다른 DB·다른 역할, 연동 활성, 확인 문구 오류는 거부
  it.each([
    ["production environment", { APP_ENV: "production" }],
    ["remote host", { DATABASE_URL: "postgresql://npr_migrator:secret@pve-release/npr_seminar_qa" }],
    ["default PostgreSQL port", { DATABASE_URL: "postgresql://npr_migrator:secret@127.0.0.1/npr_seminar_qa" }],
    ["wrong loopback port", { DATABASE_URL: "postgresql://npr_migrator:secret@127.0.0.1:5432/npr_seminar_qa" }],
    ["wrong database", { DATABASE_URL: "postgresql://npr_migrator:secret@127.0.0.1/npr_seminar" }],
    ["wrong role", { DATABASE_URL: "postgresql://npr_app:secret@127.0.0.1/npr_seminar_qa" }],
    ["enabled SMS", { SMS_ENABLED: "true" }],
    ["enabled Sheets", { GOOGLE_SHEETS_ENABLED: "true" }],
    ["enabled Tong", { TONG_SYNC_ENABLED: "true" }],
    ["wrong confirmation", { QA_DATA_CONFIRMATION: "yes" }],
  ])("rejects %s", (_name, override) => {
    expect(() => assertSyntheticQaSafety({ ...safeEnvironment(), ...override }, "seed")).toThrow();
  });
});

// 합성 QA 고정 계획
describe("synthetic QA fixed plan", () => {
  // 생성한 계획
  const plan = buildSyntheticQaPlan();

  // RFC 4122 v4 형식의 결정적 공개 ID
  it("creates deterministic RFC 4122 v4-shaped public identifiers", () => {
    const first = stableQaUuid("session", "POC");
    expect(first).toBe(stableQaUuid("session", "POC"));
    expect(first).not.toBe(stableQaUuid("session", "LOAD"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  // 운영 규모의 학생·수강 등록 수와 일치
  it("matches the production-shaped student and assignment counts", () => {
    expect(plan.students).toHaveLength(EXPECTED_QA_COUNTS.students);
    expect(plan.students.reduce((sum, student) => sum + student.assignments.length, 0)).toBe(EXPECTED_QA_COUNTS.assignments);
    expect(plan.students.filter((student) => student.assignments.length > 1)).toHaveLength(EXPECTED_QA_COUNTS.multiAssignmentStudents);
    for (const [branch, count] of Object.entries(QA_BRANCH_STUDENT_COUNTS)) {
      expect(plan.students.filter((student) => student.branchCode === branch)).toHaveLength(count);
    }
  });

  // 대표 반 판정과 회귀 확인용 고정 사례 포함
  it("contains the exact representative classification and regression fixtures", () => {
    expect(plan.students.filter((student) => student.classResolutionStatus === "ONE_REGULAR")).toHaveLength(2_991);
    expect(plan.students.filter((student) => student.classResolutionStatus === "SCIENCE_ONLY")).toHaveLength(387);
    expect(plan.students.filter((student) => student.classResolutionReason === "MULTIPLE_REGULAR")).toHaveLength(1);
    expect(plan.students.filter((student) => student.classResolutionReason === "NO_CLASS")).toHaveLength(3);
    const classes = plan.students.flatMap((student) => student.assignments.map((assignment) => assignment.className));
    expect(classes).toEqual(expect.arrayContaining(["5ZMA", "과고3생2[화2]", "과2내신[토10]", "기하[일1]", "수학특강"]));
  });

  // POC·부하 예약을 만들고 외부 발송 대기열 계획은 없음
  it("builds the POC/load reservations without any external outbox plan", () => {
    expect(plan.seminars).toHaveLength(4);
    expect(plan.sessions).toHaveLength(6);
    const poc = plan.bookings.filter((booking) => booking.sessionKey === "POC");
    expect(poc.filter((booking) => booking.status === "RESERVED")).toHaveLength(10);
    expect(poc.filter((booking) => booking.status === "CHECKED_IN")).toHaveLength(5);
    expect(poc.filter((booking) => booking.status === "CANCELLED")).toHaveLength(2);
    const load = plan.bookings.filter((booking) => booking.sessionKey === "LOAD");
    expect(load).toHaveLength(1_500);
    expect(load.filter((booking) => booking.status === "RESERVED")).toHaveLength(900);
    expect(load.filter((booking) => booking.status === "CHECKED_IN")).toHaveLength(300);
    expect(load.filter((booking) => booking.status === "CANCELLED")).toHaveLength(150);
    expect(load.filter((booking) => booking.status === "NO_SHOW")).toHaveLength(150);
  });
});
