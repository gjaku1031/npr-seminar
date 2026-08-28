import { Injectable, Logger } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { BranchCode, StagedSnapshotRow } from "./offline-snapshot.types.js";
import { StudentNormalizerService, type NormalizedLiveSnapshot } from "./student-normalizer.service.js";
import { GuestBookingReconcilerService } from "./guest-booking-reconciler.service.js";
import { StudentPromotionService } from "./student-promotion.service.js";
import { TongTongTongGateway, type TongBranchDescriptor, type TongBranchSnapshot } from "./tongtontong.gateway.js";

const BRANCH_ORDER: readonly BranchCode[] = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"];
const LEASE_NAME = "tongtontong-student-sync";
const LEASE_MILLISECONDS = 30 * 60 * 1_000;
const BATCH_SIZE = 500;

/** 통통통 학생 스냅샷 조회부터 검증·승격까지 실행하고 인증 회로와 실행 lease를 관리한다. */
@Injectable()
export class StudentSyncOrchestratorService {
  private readonly logger = new Logger(StudentSyncOrchestratorService.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly gateway: TongTongTongGateway,
    private readonly normalizer: StudentNormalizerService,
    private readonly promotion: StudentPromotionService,
    private readonly guestReconciler: GuestBookingReconcilerService,
  ) {}

  /**
   * 관리자 수동 실행을 접수하고 공개 실행 ID를 반환한다. 같은 멱등 키의 재요청은 기존 실행을 돌려준다.
   * {@link claim} 전에 DB·외부 설정·만료 lease를 확인하며 회로가 열렸거나 실행 중이면 거절한다.
   */
  public async runManual(reason: string, actorSubject: string, idempotencyKey: string): Promise<string> {
    this.requireDatabase(); this.gateway.assertReady();
    await this.recoverAbandonedLease();
    const claimed = await this.idempotency.executeWithReplay(
      "STUDENT_SYNC_MANUAL", idempotencyKey, { reason, actorSubject },
      (transaction) => this.claim(transaction, "MANUAL", actorSubject), 202,
    );
    if (!claimed.replayed) this.startInBackground(claimed.value.runId);
    return claimed.value.runId;
  }

  /** 예약 실행을 한 번 접수하고 공개 실행 ID를 반환한다. 중복 실행은 {@link claim}에서 거절한다. */
  public async runScheduled(): Promise<string> {
    this.requireDatabase(); this.gateway.assertReady();
    await this.recoverAbandonedLease();
    const claimed = await this.prisma.$transaction((transaction) => this.claim(transaction, "SCHEDULED", "system:scheduler"),
      { timeout: 15_000, maxWait: 5_000 });
    this.startInBackground(claimed.runId);
    return claimed.runId;
  }

  /**
   * 관리자 상태 조회에 쓸 외부 연동 설정 준비 여부를 반환한다.
   * {@link TongTongTongGateway.assertReady}만 호출하고 로그인이나 외부 요청은 하지 않는다.
   */
  public liveSourceReady(): boolean {
    try {
      this.gateway.assertReady();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 접수 응답과 실행을 분리한다. 안전하게 밖으로 전파된 예외에는 가능한 실패 기록을 먼저 시도하고,
   * 그 단계에서 예외가 없을 때 lease 해제를 시도한다. 외부 결과 불명확 상태는 {@link execute}가 lease를
   * 보존해 만료 복구에 맡긴다.
   */
  private startInBackground(publicRunId: string): void {
    void this.execute(publicRunId).catch(async (error: unknown) => {
      try {
        const run = await this.prisma.syncRun.findUnique({ where: { publicId: publicRunId }, select: { id: true } });
        if (run !== null) await this.failValidation(run.id, this.errorCode(error, "TONG_BACKGROUND_EXECUTION_FAILED"));
        await this.releaseLease(publicRunId);
      } catch {
        // A later lease-recovery pass fails the run closed; there is never an automatic upstream retry.
      }
    });
  }

  /** 실행·지점 행과 30분 lease를 한 트랜잭션에서 만들며 중복 실행을 409로 거절한다. */
  private async claim(transaction: Prisma.TransactionClient, runType: "MANUAL" | "SCHEDULED", actorSubject: string) {
    const circuit = await transaction.$queryRaw<Array<{ status: string }>>`
      select status from tong_auth_circuit where singleton_id=1 for update`;
    if (circuit[0] === undefined) this.fail(500, "SYNC_CIRCUIT_MISSING");
    if (circuit[0].status === "OPEN") this.fail(409, "TONG_AUTH_CIRCUIT_OPEN");
    const branches = await transaction.branch.findMany({ where: { code: { in: [...BRANCH_ORDER] }, active: true } });
    if (branches.length !== BRANCH_ORDER.length) this.fail(500, "BRANCH_CONFIGURATION_INVALID");
    const run = await transaction.syncRun.create({ data: { runType, status: "RUNNING", initiatedBy: actorSubject.slice(0, 160) } });
    const lease = await transaction.$queryRaw<Array<{ lock_name: string }>>`
      update sync_leases set holder_run_public_id=${run.publicId}::uuid,
             locked_until=${new Date(Date.now() + LEASE_MILLISECONDS)},updated_at=now()
       where lock_name=${LEASE_NAME} and (locked_until is null or locked_until < now())
       returning lock_name`;
    if (lease.length !== 1) this.fail(409, "STUDENT_SYNC_ALREADY_RUNNING");
    const byCode = new Map(branches.map((branch) => [branch.code as BranchCode, branch]));
    await transaction.syncBranchRun.createMany({ data: BRANCH_ORDER.map((code, index) => ({
      syncRunId: run.id, branchId: byCode.get(code)!.id, sequenceNo: index + 1, status: "PENDING",
    })) });
    await transaction.syncAuditEvent.create({ data: {
      syncRunId: run.id, eventType: "RUN_QUEUED", actorSubject: actorSubject.slice(0, 160), safeMetadata: { runType },
    } });
    return { runId: run.publicId };
  }

  /** 만료 lease의 실행을 정리한다. 로그인 시도 후 결과가 불명확하면 인증 회로를 열고 자동 재시도를 막는다. */
  private async recoverAbandonedLease(): Promise<void> {
    const opened = await this.prisma.$transaction(async (transaction) => {
      const circuit = await transaction.$queryRaw<Array<{ status: string }>>`
        select status from tong_auth_circuit where singleton_id=1 for update`;
      if (circuit[0] === undefined) this.fail(500, "SYNC_CIRCUIT_MISSING");
      if (circuit[0].status === "OPEN") return false;
      const leases = await transaction.$queryRaw<Array<{
        holder_run_public_id: string | null; locked_until: Date | null; expired: boolean;
      }>>`select holder_run_public_id,locked_until,(locked_until is not null and locked_until <= now()) expired
            from sync_leases where lock_name=${LEASE_NAME} for update`;
      const lease = leases[0];
      if (lease === undefined) this.fail(500, "SYNC_LEASE_MISSING");
      if (lease.holder_run_public_id === null || !lease.expired) return false;
      const run = await transaction.syncRun.findUnique({ where: { publicId: lease.holder_run_public_id } });
      if (run?.status === "RUNNING" && run.loginAttempted) {
        const reasonCode = "TONG_PREVIOUS_LOGIN_RESULT_INDETERMINATE";
        await transaction.tongAuthCircuit.update({ where: { singletonId: 1 }, data: {
          status: "OPEN", openedAt: new Date(), openedReasonCode: reasonCode, openedRunId: run.id, version: { increment: 1 },
        } });
        await transaction.tongAuthCircuitAudit.create({ data: {
          syncRunId: run.id, eventType: "OPENED", actorSubject: "system:lease-recovery", reasonCode,
        } });
        await transaction.syncBranchRun.updateMany({ where: { syncRunId: run.id }, data: {
          status: "CANCELLED", errorCode: reasonCode, finishedAt: new Date(),
        } });
        await transaction.syncRun.update({ where: { id: run.id }, data: {
          status: "FAILED", errorCode: reasonCode, finishedAt: new Date(), publishable: false,
        } });
        await transaction.syncAuditEvent.create({ data: {
          syncRunId: run.id, eventType: "RUN_FAILED", actorSubject: "system:lease-recovery", errorCode: reasonCode,
          safeMetadata: { circuitOpened: true, automaticRetryCount: 0, abandonedLeaseRecovered: true },
        } });
        await transaction.authAudit.create({ data: {
          actorSubject: "system:lease-recovery", eventType: "TONG_SYNC_CIRCUIT_OPEN", resultCode: reasonCode,
          safeMetadata: { runId: run.publicId },
        } });
        await transaction.syncLease.update({ where: { lockName: LEASE_NAME }, data: {
          holderRunPublicId: null, lockedUntil: null, updatedAt: new Date(),
        } });
        return true;
      }
      if (run?.status === "RUNNING") {
        await transaction.syncBranchRun.updateMany({ where: { syncRunId: run.id }, data: {
          status: "CANCELLED", errorCode: "SYNC_ABANDONED_BEFORE_LOGIN", finishedAt: new Date(),
        } });
        await transaction.syncRun.update({ where: { id: run.id }, data: {
          status: "CANCELLED", errorCode: "SYNC_ABANDONED_BEFORE_LOGIN", finishedAt: new Date(),
        } });
        await transaction.syncAuditEvent.create({ data: {
          syncRunId: run.id, eventType: "RUN_CANCELLED", actorSubject: "system:lease-recovery",
          errorCode: "SYNC_ABANDONED_BEFORE_LOGIN", safeMetadata: { abandonedLeaseRecovered: true },
        } });
      }
      await transaction.syncLease.update({ where: { lockName: LEASE_NAME }, data: {
        holderRunPublicId: null, lockedUntil: null, updatedAt: new Date(),
      } });
      return false;
    }, { timeout: 15_000, maxWait: 5_000 });
    if (opened) this.fail(409, "TONG_AUTH_CIRCUIT_OPEN");
  }

  /**
   * 로그인 시도를 먼저 영속화한 뒤 외부 로그인·세 지점 조회를 순서대로 수행한다.
   * 외부 결과가 불명확하면 회로를 영속적으로 열기 전에는 lease를 놓지 않는다.
   * 세 스냅샷 검증·적재 뒤 {@link StudentPromotionService.promote}를 호출하며, 이후 예약 연결 실패는 이미 끝난 승격을 되돌리지 않는다.
   */
  private async execute(publicRunId: string): Promise<void> {
    let leaseReleaseSafe = true;
    try {
      const run = await this.prisma.syncRun.findUniqueOrThrow({ where: { publicId: publicRunId }, include: {
        branchRuns: { include: { branch: true }, orderBy: { sequenceNo: "asc" } },
      } });
      try { await this.markLoginAttempt(run.id); }
      catch (error) { await this.failValidation(run.id, this.errorCode(error, "TONG_LOGIN_ATTEMPT_NOT_ALLOWED")); return; }
      // 로그인 시도 이후 외부 결과가 확정되기 전에는 회로 OPEN을 기록한 뒤에만 lease를 놓는다.
      // OPEN 기록도 실패하면 만료 lease 복구가 RUNNING·loginAttempted를 보고 회로를 연다.
      leaseReleaseSafe = false;
      let session: Awaited<ReturnType<TongTongTongGateway["login"]>>;
      try { session = await this.gateway.login(); }
      catch (error) {
        await this.openCircuitAndFail(run.id, null, run.initiatedBy ?? "system:tong-sync", this.errorCode(error, "TONG_AUTH_FAILED_STOPPED"));
        leaseReleaseSafe = true;
        return;
      }

      const snapshots: TongBranchSnapshot[] = [];
      for (const branchRun of run.branchRuns) {
        const descriptor: TongBranchDescriptor = { code: branchRun.branch.code as BranchCode, sourceCode: branchRun.branch.sourceCode };
        await this.heartbeat(publicRunId);
        await this.prisma.syncBranchRun.update({ where: { id: branchRun.id }, data: { status: "FETCHING", errorCode: null } });
        await this.prisma.syncAuditEvent.create({ data: {
          syncRunId: run.id, branchCode: descriptor.code, eventType: "BRANCH_STARTED",
          actorSubject: run.initiatedBy ?? "system:tong-sync",
        } });
        try {
          const snapshot = await this.gateway.fetchBranch(session, descriptor);
          if (snapshot.branch !== descriptor.code) throw new DomainError(502, "TONG_BRANCH_CONTEXT_INDETERMINATE", "Branch context did not match.");
          snapshots.push(snapshot);
          await this.prisma.syncBranchRun.update({ where: { id: branchRun.id }, data: {
            fetchedCount: snapshot.assignments.length, snapshotHash: this.bytes(snapshot.snapshotHash),
          } });
        } catch (error) {
          await this.openCircuitAndFail(run.id, branchRun.id, run.initiatedBy ?? "system:tong-sync", this.errorCode(error, "TONG_FETCH_FAILED_STOPPED"));
          leaseReleaseSafe = true;
          return;
        }
      }
      leaseReleaseSafe = true;

      let normalized: NormalizedLiveSnapshot;
      try {
        await this.validateRowCounts(run.id, run.branchRuns.map((branch) => ({ id: branch.id, branchId: branch.branchId, fetched: snapshots[branch.sequenceNo - 1]!.assignments.length })));
        normalized = this.normalizer.normalize(snapshots);
      } catch (error) { await this.failValidation(run.id, this.errorCode(error, "TONG_SNAPSHOT_VALIDATION_FAILED")); return; }
      if (normalized.conflicts.length > 0) { await this.persistConflicts(run.id, normalized); return; }

      const branchIds = new Map(run.branchRuns.map((branch) => [branch.branch.code as BranchCode, branch.branchId]));
      try {
        await this.stage(run.id, normalized, branchIds);
        await this.heartbeat(publicRunId);
        await this.promotion.promote(run.id, normalized, branchIds);
        // 학생 원장이 최신이 된 직후에 잇는다. 예약할 때는 비재원생이었다가 그 뒤 등록한
        // 가정을 여기서 재원생 예약으로 돌린다. 실패해도 동기화 자체는 이미 성공이므로
        // 원장 갱신을 되돌리지 않는다 — 다음 갱신이 같은 후보를 다시 본다.
        try {
          await this.guestReconciler.reconcile(run.initiatedBy ?? "system:tong-sync");
        } catch (error) {
          this.logger.error(`guest booking reconciliation failed: ${error instanceof Error ? error.message : "unknown"}`);
        }
      } catch (error) { await this.failValidation(run.id, this.errorCode(error, "TONG_PROMOTION_FAILED")); }
    } catch (error) {
      if (!leaseReleaseSafe) return;
      throw error;
    } finally {
      if (leaseReleaseSafe) await this.releaseLease(publicRunId);
    }
  }

  /** 외부 로그인 전에 회로와 실행 행을 잠그고 단 한 번의 로그인 시도 표식을 커밋한다. */
  private async markLoginAttempt(runId: bigint): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const circuit = await transaction.$queryRaw<Array<{ status: string }>>`
        select status from tong_auth_circuit where singleton_id=1 for update`;
      const run = await transaction.$queryRaw<Array<{ login_attempted: boolean; status: string; initiated_by: string | null }>>`
        select login_attempted,status,initiated_by from sync_runs where id=${runId} for update`;
      if (circuit[0]?.status !== "CLOSED") this.fail(409, "TONG_AUTH_CIRCUIT_OPEN");
      if (run[0] === undefined || run[0].status !== "RUNNING" || run[0].login_attempted) this.fail(409, "TONG_LOGIN_ATTEMPT_NOT_ALLOWED");
      await transaction.syncRun.update({ where: { id: runId }, data: { loginAttempted: true } });
      await transaction.syncAuditEvent.create({ data: {
        syncRunId: runId, eventType: "LOGIN_ATTEMPTED", actorSubject: run[0].initiated_by ?? "system:tong-sync",
        safeMetadata: { automaticRetryCount: 0 },
      } });
    }, { timeout: 10_000, maxWait: 5_000 });
  }

  /** 외부 인증·조회 결과가 불명확할 때 회로 OPEN과 실행 실패·감사를 한 트랜잭션에 기록한다. */
  private async openCircuitAndFail(runId: bigint, failedBranchRunId: bigint | null, actor: string, reasonCode: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const circuit = await transaction.$queryRaw<Array<{ status: string }>>`
        select status from tong_auth_circuit where singleton_id=1 for update`;
      if (circuit[0] === undefined) this.fail(500, "SYNC_CIRCUIT_MISSING");
      if (circuit[0].status === "CLOSED") {
        await transaction.tongAuthCircuit.update({ where: { singletonId: 1 }, data: {
          status: "OPEN", openedAt: new Date(), openedReasonCode: reasonCode, openedRunId: runId, version: { increment: 1 },
        } });
        await transaction.tongAuthCircuitAudit.create({ data: {
          syncRunId: runId, eventType: "OPENED", actorSubject: actor.slice(0, 160), reasonCode,
        } });
      }
      await transaction.syncBranchRun.updateMany({ where: { syncRunId: runId }, data: {
        status: "CANCELLED", finishedAt: new Date(), errorCode: "TONG_AUTH_CIRCUIT_OPEN",
      } });
      if (failedBranchRunId !== null) await transaction.syncBranchRun.update({ where: { id: failedBranchRunId }, data: {
        status: "FAILED", errorCode: reasonCode, finishedAt: new Date(),
      } });
      await transaction.syncRun.update({ where: { id: runId }, data: {
        status: "FAILED", publishable: false, errorCode: reasonCode, finishedAt: new Date(),
      } });
      await transaction.syncAuditEvent.create({ data: {
        syncRunId: runId, eventType: "RUN_FAILED", actorSubject: actor.slice(0, 160), errorCode: reasonCode,
        safeMetadata: { circuitOpened: true, automaticRetryCount: 0 },
      } });
      const publicRun = await transaction.syncRun.findUniqueOrThrow({ where: { id: runId }, select: { publicId: true } });
      await transaction.authAudit.create({ data: {
        actorSubject: actor.slice(0, 160), eventType: "TONG_SYNC_CIRCUIT_OPEN", resultCode: reasonCode,
        safeMetadata: { runId: publicRun.publicId },
      } });
    }, { timeout: 15_000, maxWait: 5_000 });
  }

  /** 정규화된 전체 스냅샷과 해시·지점별 검증 기록을 원자적으로 적재한다. 아직 학생 원장을 바꾸지 않는다. */
  private async stage(runId: bigint, snapshot: NormalizedLiveSnapshot, branchIds: ReadonlyMap<BranchCode, bigint>): Promise<void> {
    const metrics = this.json({ counts: snapshot.counts, branches: snapshot.branchCounts });
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ status: string }>>`select status from sync_runs where id=${runId} for update`;
      if (locked[0]?.status !== "RUNNING") this.fail(409, "SYNC_RUN_NOT_STAGEABLE");
      for (let offset = 0; offset < snapshot.rows.length; offset += BATCH_SIZE) {
        await transaction.stagingStudent.createMany({ data: snapshot.rows.slice(offset, offset + BATCH_SIZE)
          .map((row) => this.stagingData(row, runId, branchIds.get(row.branchCode)!)) });
      }
      for (const branch of BRANCH_ORDER) {
        const counts = snapshot.branchCounts[branch];
        await transaction.syncBranchRun.update({ where: { syncRunId_branchId: { syncRunId: runId, branchId: branchIds.get(branch)! } }, data: {
          status: "VALIDATED", stagedCount: counts.fetchedAssignmentCount, includedCount: counts.includedAssignmentCount,
          excludedCount: counts.fetchedAssignmentCount - counts.includedAssignmentCount,
        } });
        await transaction.syncAuditEvent.createMany({ data: ["BRANCH_STAGED", "BRANCH_VALIDATED"].map((eventType) => ({
          syncRunId: runId, branchCode: branch, eventType, actorSubject: "system:tong-sync",
          counts: this.json(counts),
        })) });
      }
      await transaction.syncRun.update({ where: { id: runId }, data: {
        snapshotHash: this.bytes(snapshot.snapshotHash), stagingHash: this.bytes(snapshot.stagingHash), metrics,
        rawRowCount: snapshot.counts.fetchedAssignmentCount, includedAssignmentCount: snapshot.counts.includedAssignmentCount,
        uniqueStudentCount: snapshot.counts.uniqueStudentCount,
        excludedCount: snapshot.counts.fetchedAssignmentCount - snapshot.counts.includedAssignmentCount,
        ambiguityCount: snapshot.counts.ambiguousStudentCount,
      } });
      const run = await transaction.syncRun.findUniqueOrThrow({ where: { id: runId }, select: { initiatedBy: true } });
      await transaction.syncAuditEvent.create({ data: {
        syncRunId: runId, eventType: "RUN_READY_TO_PUBLISH", actorSubject: run.initiatedBy ?? "system:tong-sync",
        counts: this.json(snapshot.counts),
      } });
    }, { timeout: 120_000, maxWait: 10_000 });
  }

  /** 정규화 충돌을 저장하고 승격 없이 실행을 CONFLICT로 마무리한다. */
  private async persistConflicts(runId: bigint, snapshot: NormalizedLiveSnapshot): Promise<void> {
    const metrics = this.json({ counts: snapshot.counts, branches: snapshot.branchCounts });
    await this.prisma.$transaction(async (transaction) => {
      await transaction.syncConflict.createMany({ data: snapshot.conflicts.map((conflict) => ({
        syncRunId: runId, conflictType: conflict.type, branchCode: conflict.branch,
        sourceStudentNo: conflict.sourceStudentNo,
        safeDetails: { sourceAssignmentKeyDigest: conflict.sourceAssignmentKeyDigest, detail: conflict.detail },
      })) });
      await transaction.syncBranchRun.updateMany({ where: { syncRunId: runId }, data: { status: "CONFLICT", finishedAt: new Date(), errorCode: "TONG_SNAPSHOT_CONFLICT" } });
      await transaction.syncRun.update({ where: { id: runId }, data: {
        status: "CONFLICT", errorCode: "TONG_SNAPSHOT_CONFLICT", finishedAt: new Date(), metrics,
        rawRowCount: snapshot.counts.fetchedAssignmentCount, includedAssignmentCount: snapshot.counts.includedAssignmentCount,
        uniqueStudentCount: snapshot.counts.uniqueStudentCount,
        excludedCount: snapshot.counts.fetchedAssignmentCount - snapshot.counts.includedAssignmentCount,
        ambiguityCount: snapshot.counts.ambiguousStudentCount,
      } });
      const run = await transaction.syncRun.findUniqueOrThrow({ where: { id: runId }, select: { initiatedBy: true } });
      await transaction.syncAuditEvent.create({ data: {
        syncRunId: runId, eventType: "CONFLICT_DETECTED", actorSubject: run.initiatedBy ?? "system:tong-sync",
        counts: this.json(snapshot.counts), errorCode: "TONG_SNAPSHOT_CONFLICT",
        safeMetadata: { conflictCount: snapshot.conflicts.length },
      } });
    }, { timeout: 15_000, maxWait: 5_000 });
  }

  /** 검증·승격 실패를 실행 상태와 감사에 기록한다. 종료된 실행은 다시 실패 처리하지 않는다. */
  private async failValidation(runId: bigint, code: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const run = await transaction.syncRun.findUnique({ where: { id: runId }, select: { initiatedBy: true, status: true } });
      if (run === null || !["RUNNING", "PUBLISHING"].includes(run.status)) return;
      await transaction.syncBranchRun.updateMany({ where: { syncRunId: runId, status: { notIn: ["FAILED", "CANCELLED"] } }, data: {
        status: "CONFLICT", errorCode: code, finishedAt: new Date(),
      } });
      await transaction.syncRun.updateMany({ where: { id: runId, status: { in: ["RUNNING", "PUBLISHING"] } }, data: {
        status: "FAILED", publishable: false, errorCode: code, finishedAt: new Date(),
      } });
      await transaction.syncAuditEvent.create({ data: {
        syncRunId: runId, eventType: "RUN_FAILED", actorSubject: run.initiatedBy ?? "system:tong-sync", errorCode: code,
      } });
    }, { timeout: 15_000, maxWait: 5_000 });
  }

  /** 직전 성공 조회가 20행 이상인 지점의 행 수가 절반 미만 또는 1.5배 초과로 변하면 거절한다. */
  private async validateRowCounts(runId: bigint, branches: readonly { id: bigint; branchId: bigint; fetched: number }[]): Promise<void> {
    for (const branch of branches) {
      const previous = await this.prisma.syncBranchRun.findFirst({ where: {
        id: { not: branch.id }, branchId: branch.branchId, status: { in: ["PROMOTED", "NO_CHANGES"] },
        syncRun: { status: { in: ["SUCCEEDED", "NO_CHANGES", "PUBLISHED"] } },
      }, orderBy: { startedAt: "desc" } });
      if (previous !== null && previous.fetchedCount >= 20
        && (branch.fetched < previous.fetchedCount * 0.5 || branch.fetched > previous.fetchedCount * 1.5)) {
        throw new DomainError(422, "TONG_ROW_COUNT_DRIFT", "The upstream row count changed too sharply.");
      }
    }
    void runId;
  }

  private stagingData(row: StagedSnapshotRow, syncRunId: bigint, branchId: bigint) {
    if (!row.included) return {
      syncRunId, branchId, sourceOrdinal: row.sourceOrdinal, sourceUniqueNo: `excluded:${row.sourceOrdinal}`,
      classRegistrationNo: `excluded:${row.sourceOrdinal}`, sourceStudentNo: null, name: null, className: null,
      schoolName: null, grade: null, teacherName: null, unitName: null, motherPhoneCiphertext: null,
      motherPhoneDigest: null, motherPhoneLast4: null, fatherPhoneCiphertext: null, fatherPhoneDigest: null,
      fatherPhoneLast4: null, fatherPhoneObserved: row.fatherPhoneObserved,
      sourceStatus: null, rowHash: this.bytes(row.rowHash), included: false,
      exclusionReason: row.exclusionReason, primaryCandidate: false, primarySelected: false,
      classResolutionStatus: null, classResolutionReason: null,
    };
    return {
      syncRunId, branchId, sourceOrdinal: row.sourceOrdinal, sourceUniqueNo: row.sourceUniqueNo,
      classRegistrationNo: row.classRegistrationNo, sourceStudentNo: row.sourceStudentNo, name: row.name,
      className: row.className, schoolName: row.schoolName, grade: row.grade, teacherName: row.teacherName,
      unitName: row.unitName, motherPhoneCiphertext: row.motherPhoneCiphertext === null ? null : this.bytes(row.motherPhoneCiphertext),
      motherPhoneDigest: row.motherPhoneDigest === null ? null : this.bytes(row.motherPhoneDigest),
      motherPhoneLast4: row.motherPhoneLast4,
      fatherPhoneCiphertext: row.fatherPhoneCiphertext === null ? null : this.bytes(row.fatherPhoneCiphertext),
      fatherPhoneDigest: row.fatherPhoneDigest === null ? null : this.bytes(row.fatherPhoneDigest),
      fatherPhoneLast4: row.fatherPhoneLast4, fatherPhoneObserved: row.fatherPhoneObserved,
      sourceStatus: row.sourceStatus, rowHash: this.bytes(row.rowHash), included: true, exclusionReason: null,
      primaryCandidate: row.primaryCandidate, primarySelected: row.primarySelected,
      classResolutionStatus: row.classResolutionStatus, classResolutionReason: row.classResolutionReason,
    };
  }

  /** 현재 실행이 소유한 lease만 30분 연장한다. 소유권을 잃으면 갱신 수는 0이다. */
  private heartbeat(publicRunId: string): Promise<unknown> {
    return this.prisma.syncLease.updateMany({ where: { lockName: LEASE_NAME, holderRunPublicId: publicRunId }, data: {
      lockedUntil: new Date(Date.now() + LEASE_MILLISECONDS), updatedAt: new Date(),
    } });
  }
  /** 현재 실행이 소유한 lease만 해제한다. 다른 실행의 lease는 건드리지 않는다. */
  private async releaseLease(publicRunId: string): Promise<void> {
    if (!this.prisma.configured) return;
    await this.prisma.syncLease.updateMany({ where: { lockName: LEASE_NAME, holderRunPublicId: publicRunId }, data: {
      holderRunPublicId: null, lockedUntil: null, updatedAt: new Date(),
    } });
  }
  private errorCode(error: unknown, fallback: string): string {
    const code = error instanceof DomainError ? error.code : fallback;
    return /^[A-Z0-9_]{3,100}$/.test(code) ? code : fallback;
  }
  private json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> { const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy; }
  private requireDatabase(): void { if (!this.prisma.configured) this.fail(503, "DATABASE_NOT_CONFIGURED"); }
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The student sync operation could not be completed."); }
}
