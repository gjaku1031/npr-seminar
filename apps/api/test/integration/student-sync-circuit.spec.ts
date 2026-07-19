import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { DomainError } from "../../src/common/errors/domain-error.js";
import { IdempotencyService } from "../../src/common/idempotency/idempotency.service.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import { StudentNormalizerService } from "../../src/modules/student-sync/student-normalizer.service.js";
import { StudentPromotionService } from "../../src/modules/student-sync/student-promotion.service.js";
import { StudentSyncAdminService } from "../../src/modules/student-sync/student-sync-admin.service.js";
import { StudentSyncOrchestratorService } from "../../src/modules/student-sync/student-sync-orchestrator.service.js";
import { TongTongTongGateway, type TongBranchDescriptor, type TongBranchSnapshot, type TongSession } from "../../src/modules/student-sync/tongtontong.gateway.js";

const apiDirectory = resolve(import.meta.dirname, "../..");
const bytes = (value: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
};

class FailingLoginGateway extends TongTongTongGateway {
  public ready = true;
  public failLogin = true;
  public failFetch = false;
  public loginBarrier: Promise<void> | undefined;
  public fatherPhone: string | undefined;
  public duplicateCampusAAssignment = false;
  public loginCalls = 0;
  public branchCalls = 0;
  public assertReady(): void {
    if (!this.ready) throw new DomainError(503, "TONG_SYNC_DISABLED", "Live sync is disabled.");
  }
  public async login(): Promise<TongSession> {
    this.loginCalls += 1;
    if (this.loginBarrier !== undefined) await this.loginBarrier;
    if (this.failLogin) throw new DomainError(502, "TONG_AUTH_RESULT_INDETERMINATE", "Indeterminate login result.");
    return { opaque: {} };
  }
  public async fetchBranch(_session: TongSession, branch: TongBranchDescriptor): Promise<TongBranchSnapshot> {
    this.branchCalls += 1;
    if (this.failFetch) throw new DomainError(502, "TONG_BRANCH_RESULT_INDETERMINATE", "Indeterminate branch result.");
    const sequence = branch.code === "CAMPUS_A" ? 1 : branch.code === "CAMPUS_B" ? 2 : 3;
    const assignment = {
      sourceUniqueNo: `unique-${sequence}`, classRegistrationNo: `registration-${sequence}`, studentNo: `student-${sequence}`,
      name: `학생${sequence}`, className: sequence === 1 ? "3T3A" : sequence === 2 ? "화학 심화" : "여름 TEST 특강",
      motherPhone: "", schoolName: "학교", grade: "3", teacherName: "담임", unitName: "고등부", sourceStatus: "재원생",
      ...(this.fatherPhone === undefined ? {} : { fatherPhone: this.fatherPhone }),
    };
    return {
      branch: branch.code, snapshotHash: Buffer.alloc(32, sequence),
      assignments: branch.code === "CAMPUS_A" && this.duplicateCampusAAssignment ? [assignment, { ...assignment }] : [assignment],
    };
  }
}

describe("durable TongTongTong authentication circuit", () => {
  let postgres: StartedTestContainer;
  let prisma: PrismaService;
  let gateway: FailingLoginGateway;
  let orchestrator: StudentSyncOrchestratorService;
  let admin: StudentSyncAdminService;
  let protector: PhoneProtector;

  async function terminalRun(runId: string) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const run = await prisma.syncRun.findUniqueOrThrow({ where: { publicId: runId }, include: {
        branchRuns: { orderBy: { sequenceNo: "asc" } }, syncAuditEvents: { orderBy: { id: "asc" } },
      } });
      if (["SUCCEEDED", "NO_CHANGES", "FAILED", "CONFLICT", "CANCELLED"].includes(run.status)) return run;
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
    throw new Error(`sync run ${runId} did not reach a terminal state`);
  }

  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_PASSWORD: "integration_only", POSTGRES_DB: "npr_sync" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
      .start();
    const databaseUrl = `postgresql://postgres:integration_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_sync`;
    execFileSync(resolve(apiDirectory, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: apiDirectory, env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl }, stdio: "pipe",
    });
    const environment: AppEnvironment = {
      appEnv: "test", processRole: "api", port: 4000, databaseUrl,
      smsEnabled: false, smsRecipientAllowlistEnabled: true, smsTestRecipients: new Set(),
      smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined }, smsAligoTestMode: true,
      googleSheetsEnabled: false, trustProxy: 0, tongSyncEnabled: true,
      phoneEncryptionKey: "BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=",
      phoneHmacKey: "BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU=",
      sessionIdleTtlSeconds: 28_800, sessionAbsoluteTtlSeconds: 86_400,
    };
    prisma = new PrismaService(environment);
    gateway = new FailingLoginGateway();
    const idempotency = new IdempotencyService(prisma);
    protector = new PhoneProtector(environment);
    orchestrator = new StudentSyncOrchestratorService(
      prisma, idempotency, gateway,
      new StudentNormalizerService(protector), new StudentPromotionService(prisma),
    );
    admin = new StudentSyncAdminService(prisma, idempotency, orchestrator);
  });

  afterAll(async () => { await prisma?.$disconnect(); await postgres?.stop(); });

  it("reports local live-source readiness without making an upstream login call", async () => {
    gateway.ready = false;
    expect(await admin.status()).toMatchObject({ liveSourceReady: false });
    expect(gateway.loginCalls).toBe(0);
    gateway.ready = true;
    expect(await admin.status()).toMatchObject({ liveSourceReady: true });
    expect(gateway.loginCalls).toBe(0);
  });

  it("opens the circuit after exactly one attempt, cancels all branches, and blocks later runs without external calls", async () => {
    const runId = await orchestrator.runManual("operator requested sync", "admin:test", "sync-login-failure-1");
    const run = await terminalRun(runId);
    expect(run).toMatchObject({ status: "FAILED", loginAttempted: true, errorCode: "TONG_AUTH_RESULT_INDETERMINATE" });
    expect(run.branchRuns).toHaveLength(3);
    expect(run.branchRuns.every((branch) => branch.status === "CANCELLED")).toBe(true);
    expect(gateway.loginCalls).toBe(1);
    expect(gateway.branchCalls).toBe(0);
    await expect(orchestrator.runManual("another request", "admin:test", "sync-login-failure-2"))
      .rejects.toMatchObject({ code: "TONG_AUTH_CIRCUIT_OPEN" });
    expect(gateway.loginCalls).toBe(1);
    expect(await prisma.tongAuthCircuitAudit.count({ where: { eventType: "OPENED" } })).toBe(1);
  });

  it("idempotently replays the failed run and resets the circuit without probing upstream", async () => {
    const replayed = await orchestrator.runManual("operator requested sync", "admin:test", "sync-login-failure-1");
    expect(replayed).toBe((await prisma.syncRun.findFirstOrThrow({ orderBy: { startedAt: "asc" } })).publicId);
    expect(gateway.loginCalls).toBe(1);
    const reset = await admin.resetCircuit(
      "I CONFIRM UPSTREAM LOGIN IS NORMAL", "Operator independently confirmed and cleared the upstream failure counter.",
      "admin:test", "sync-circuit-reset-1",
    );
    expect(reset.status).toBe("CLOSED");
    expect(gateway.loginCalls).toBe(1);
    expect(await prisma.tongAuthCircuitAudit.count({ where: { eventType: "RESET" } })).toBe(1);
  });

  it("runs all branches sequentially and promotes one validated all-or-nothing snapshot after reset", async () => {
    gateway.failLogin = false;
    let releaseLogin!: () => void;
    gateway.loginBarrier = new Promise<void>((resolveBarrier) => { releaseLogin = resolveBarrier; });
    const runId = await orchestrator.runManual("validated wire contract sync", "admin:test", "sync-success-1");
    expect(await prisma.syncRun.findUniqueOrThrow({ where: { publicId: runId } })).toMatchObject({ status: "RUNNING" });
    releaseLogin(); gateway.loginBarrier = undefined;
    const run = await terminalRun(runId);
    expect(run.status).toBe("SUCCEEDED");
    expect(run.branchRuns.map((branch) => branch.status)).toEqual(["PROMOTED", "PROMOTED", "PROMOTED"]);
    expect(gateway.loginCalls).toBe(2);
    expect(gateway.branchCalls).toBe(3);
    expect(await prisma.student.count({ where: { sourceActive: true } })).toBe(3);
    expect(await prisma.studentClassAssignment.count({ where: { sourceActive: true } })).toBe(3);
    expect(await prisma.student.findUniqueOrThrow({ where: { sourceStudentNo: "student-1" } })).toMatchObject({ className: "3T3A" });
    expect(await prisma.student.findUniqueOrThrow({ where: { sourceStudentNo: "student-2" } })).toMatchObject({ className: "과학" });
    expect(await prisma.student.findUniqueOrThrow({ where: { sourceStudentNo: "student-3" } })).toMatchObject({
      className: "미분류", classResolutionReason: "NO_CLASS",
    });
    expect(run.syncAuditEvents.map((event) => event.eventType)).toContain("RUN_SUCCEEDED");
    const readyEvents = run.syncAuditEvents.filter((event) => event.eventType === "RUN_READY_TO_PUBLISH");
    expect(readyEvents).toHaveLength(1);
    expect(readyEvents[0]).toMatchObject({ errorCode: null });
    expect(run.syncAuditEvents.some((event) => event.eventType === "CONFLICT_DETECTED")).toBe(false);
    const response = await admin.get(runId);
    expect(response).toMatchObject({ runId, automaticLoginRetryCount: 0, loginAttempted: true });
    expect(response.branches).toHaveLength(3);
  });

  it("records a counted conflict audit event and never marks a conflicting snapshot ready to publish", async () => {
    gateway.duplicateCampusAAssignment = true;
    const runId = await orchestrator.runManual("duplicate assignment conflict", "admin:test", "sync-conflict-audit-1");
    const run = await terminalRun(runId);
    gateway.duplicateCampusAAssignment = false;

    expect(run.status).toBe("CONFLICT");
    expect(run.branchRuns.map((branch) => branch.status)).toEqual(["CONFLICT", "CONFLICT", "CONFLICT"]);
    const conflictEvents = run.syncAuditEvents.filter((event) => event.eventType === "CONFLICT_DETECTED");
    expect(conflictEvents).toHaveLength(1);
    expect(conflictEvents[0]).toMatchObject({
      errorCode: "TONG_SNAPSHOT_CONFLICT",
      safeMetadata: { conflictCount: 1 },
    });
    expect(conflictEvents[0]!.counts).toMatchObject({ fetchedAssignmentCount: 4, includedAssignmentCount: 4 });
    expect(run.syncAuditEvents.some((event) => event.eventType === "RUN_READY_TO_PUBLISH")).toBe(false);
    expect(await prisma.syncConflict.count({ where: { syncRunId: run.id } })).toBe(1);
  });

  it("preserves an existing father contact when the optional column is absent and clears it only when an empty value is observed", async () => {
    const protectedFather = protector.protect("01099998888");
    await prisma.student.update({ where: { sourceStudentNo: "student-1" }, data: {
      fatherPhoneCiphertext: bytes(protectedFather.ciphertext), fatherPhoneDigest: bytes(protectedFather.digest),
      fatherPhoneLast4: protectedFather.last4,
    } });
    gateway.fatherPhone = undefined;
    const absentRunId = await orchestrator.runManual("father column absent", "admin:test", "sync-father-absent-1");
    await terminalRun(absentRunId);
    const preserved = await prisma.student.findUniqueOrThrow({ where: { sourceStudentNo: "student-1" } });
    expect(Buffer.from(preserved.fatherPhoneDigest!)).toEqual(protectedFather.digest);
    expect(preserved.fatherPhoneLast4).toBe("8888");

    gateway.fatherPhone = "";
    const emptyRunId = await orchestrator.runManual("father column explicitly empty", "admin:test", "sync-father-empty-1");
    await terminalRun(emptyRunId);
    const cleared = await prisma.student.findUniqueOrThrow({ where: { sourceStudentNo: "student-1" } });
    expect(cleared.fatherPhoneCiphertext).toBeNull();
    expect(cleared.fatherPhoneDigest).toBeNull();
    expect(cleared.fatherPhoneLast4).toBeNull();
    gateway.fatherPhone = undefined;
  });

  it("retains the lease when OPEN persistence rolls back after login or fetch and permits zero later login attempts", async () => {
    const execution = orchestrator as unknown as { execute(publicRunId: string): Promise<void> };
    const branches = await prisma.branch.findMany({ orderBy: { code: "asc" } });

    for (const failurePoint of ["login", "fetch"] as const) {
      gateway.failLogin = failurePoint === "login";
      gateway.failFetch = failurePoint === "fetch";
      const run = await prisma.syncRun.create({ data: {
        runType: "MANUAL", status: "RUNNING", initiatedBy: "admin:test",
        branchRuns: { create: branches.map((branch, index) => ({
          branchId: branch.id, sequenceNo: index + 1, status: "PENDING",
        })) },
      } });
      await prisma.syncLease.update({ where: { lockName: "tongtontong-student-sync" }, data: {
        holderRunPublicId: run.publicId, lockedUntil: new Date(Date.now() + 30 * 60 * 1_000),
      } });

      await prisma.$executeRawUnsafe(`
        alter table tong_auth_circuit_audits
        add constraint test_tong_open_persistence_rollback
        check (reason_code not in ('TONG_AUTH_RESULT_INDETERMINATE','TONG_BRANCH_RESULT_INDETERMINATE'))
        not valid
      `);
      const loginCallsBefore = gateway.loginCalls;
      const branchCallsBefore = gateway.branchCalls;
      try {
        await expect(execution.execute(run.publicId)).resolves.toBeUndefined();
      } finally {
        await prisma.$executeRawUnsafe(`
          alter table tong_auth_circuit_audits
          drop constraint if exists test_tong_open_persistence_rollback
        `);
      }

      const attemptsAfterRollback = gateway.loginCalls;
      expect(attemptsAfterRollback).toBe(loginCallsBefore + 1);
      expect(gateway.branchCalls).toBe(branchCallsBefore + (failurePoint === "fetch" ? 1 : 0));
      expect(await prisma.tongAuthCircuit.findUniqueOrThrow({ where: { singletonId: 1 } })).toMatchObject({ status: "CLOSED" });
      expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
        status: "RUNNING", loginAttempted: true,
      });
      expect(await prisma.syncLease.findUniqueOrThrow({ where: { lockName: "tongtontong-student-sync" } })).toMatchObject({
        holderRunPublicId: run.publicId,
      });

      await expect(orchestrator.runManual(
        `blocked after ${failurePoint} rollback`, "admin:test", `sync-${failurePoint}-rollback-manual`,
      )).rejects.toMatchObject({ code: "STUDENT_SYNC_ALREADY_RUNNING" });
      await expect(orchestrator.runScheduled()).rejects.toMatchObject({ code: "STUDENT_SYNC_ALREADY_RUNNING" });
      expect(gateway.loginCalls).toBe(attemptsAfterRollback);

      await prisma.syncLease.update({ where: { lockName: "tongtontong-student-sync" }, data: {
        lockedUntil: new Date(Date.now() - 1_000),
      } });
      await expect(orchestrator.runScheduled()).rejects.toMatchObject({ code: "TONG_AUTH_CIRCUIT_OPEN" });
      await expect(orchestrator.runManual(
        `still blocked after ${failurePoint} recovery`, "admin:test", `sync-${failurePoint}-rollback-open`,
      )).rejects.toMatchObject({ code: "TONG_AUTH_CIRCUIT_OPEN" });
      expect(gateway.loginCalls).toBe(attemptsAfterRollback);
      expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
        status: "FAILED", errorCode: "TONG_PREVIOUS_LOGIN_RESULT_INDETERMINATE",
      });

      await admin.resetCircuit(
        "I CONFIRM UPSTREAM LOGIN IS NORMAL", `Test cleanup after ${failurePoint} rollback recovery.`,
        "admin:test", `sync-${failurePoint}-rollback-reset`,
      );
    }
    gateway.failLogin = false;
    gateway.failFetch = false;
  });

  it("treats an expired lease after a durable login-attempt marker as indeterminate and never relogs automatically", async () => {
    const branches = await prisma.branch.findMany({ orderBy: { code: "asc" } });
    const abandoned = await prisma.syncRun.create({ data: {
      runType: "MANUAL", status: "RUNNING", initiatedBy: "admin:test", loginAttempted: true,
      branchRuns: { create: branches.map((branch, index) => ({
        branchId: branch.id, sequenceNo: index + 1, status: "PENDING",
      })) },
    } });
    await prisma.syncLease.update({ where: { lockName: "tongtontong-student-sync" }, data: {
      holderRunPublicId: abandoned.publicId, lockedUntil: new Date(Date.now() - 1_000),
    } });
    const callsBeforeRecovery = gateway.loginCalls;
    await expect(orchestrator.runManual("must recover abandoned login", "admin:test", "sync-abandoned-1"))
      .rejects.toMatchObject({ code: "TONG_AUTH_CIRCUIT_OPEN" });
    expect(gateway.loginCalls).toBe(callsBeforeRecovery);
    expect(await prisma.syncRun.findUniqueOrThrow({ where: { id: abandoned.id } })).toMatchObject({
      status: "FAILED", errorCode: "TONG_PREVIOUS_LOGIN_RESULT_INDETERMINATE",
    });
    expect(await prisma.tongAuthCircuit.findUniqueOrThrow({ where: { singletonId: 1 } })).toMatchObject({
      status: "OPEN", openedReasonCode: "TONG_PREVIOUS_LOGIN_RESULT_INDETERMINATE",
    });
  });
});
