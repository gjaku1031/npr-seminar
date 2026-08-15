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

const safeEnvironment = (confirmation = QA_SEED_CONFIRMATION): NodeJS.ProcessEnv => ({
  APP_ENV: "staging",
  DATABASE_URL: "postgresql://npr_migrator:secret@127.0.0.1:55432/npr_seminar_qa",
  QA_DATA_CONFIRMATION: confirmation,
  SMS_ENABLED: "false",
  GOOGLE_SHEETS_ENABLED: "false",
  TONG_SYNC_ENABLED: "false",
});

describe("synthetic QA safety", () => {
  it("accepts only the isolated loopback staging database", () => {
    expect(assertSyntheticQaSafety(safeEnvironment(), "seed")).toMatchObject({
      databaseName: "npr_seminar_qa", action: "seed",
    });
    expect(assertSyntheticQaSafety(safeEnvironment(QA_RESET_CONFIRMATION), "reset")).toMatchObject({ action: "reset" });
  });

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

describe("synthetic QA fixed plan", () => {
  const plan = buildSyntheticQaPlan();

  it("creates deterministic RFC 4122 v4-shaped public identifiers", () => {
    const first = stableQaUuid("session", "POC");
    expect(first).toBe(stableQaUuid("session", "POC"));
    expect(first).not.toBe(stableQaUuid("session", "LOAD"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it("matches the production-shaped student and assignment counts", () => {
    expect(plan.students).toHaveLength(EXPECTED_QA_COUNTS.students);
    expect(plan.students.reduce((sum, student) => sum + student.assignments.length, 0)).toBe(EXPECTED_QA_COUNTS.assignments);
    expect(plan.students.filter((student) => student.assignments.length > 1)).toHaveLength(EXPECTED_QA_COUNTS.multiAssignmentStudents);
    for (const [branch, count] of Object.entries(QA_BRANCH_STUDENT_COUNTS)) {
      expect(plan.students.filter((student) => student.branchCode === branch)).toHaveLength(count);
    }
  });

  it("contains the exact representative classification and regression fixtures", () => {
    expect(plan.students.filter((student) => student.classResolutionStatus === "ONE_REGULAR")).toHaveLength(2_991);
    expect(plan.students.filter((student) => student.classResolutionStatus === "SCIENCE_ONLY")).toHaveLength(387);
    expect(plan.students.filter((student) => student.classResolutionReason === "MULTIPLE_REGULAR")).toHaveLength(1);
    expect(plan.students.filter((student) => student.classResolutionReason === "NO_CLASS")).toHaveLength(3);
    const classes = plan.students.flatMap((student) => student.assignments.map((assignment) => assignment.className));
    expect(classes).toEqual(expect.arrayContaining(["5ZMA", "과고3생2[화2]", "과2내신[토10]", "기하[일1]", "수학특강"]));
  });

  it("builds the POC/load reservations and surveys without any external outbox plan", () => {
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
    expect(plan.surveys).toHaveLength(506);
  });
});
