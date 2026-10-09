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

/**
 * 지점 처리 순서
 */
const BRANCH_ORDER: readonly BranchCode[] = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"];

/**
 * 동기화 lease 이름
 */
const LEASE_NAME = "tongtontong-student-sync";

/**
 * 동기화 lease 유지 시간(밀리초). 30분
 */
const LEASE_MILLISECONDS = 30 * 60 * 1_000;

/**
 * 스테이징 행 일괄 저장 단위
 */
const BATCH_SIZE = 500;

/**
 * 통통통 학생 동기화 실행기
 *
 * 스냅샷 조회부터 검증·적재·원장 반영까지 실행하고 로그인 회로와 실행 lease 관리
 * 원천 로그인은 실행당 1회이며 자동 재시도하지 않음. 결과가 불명확하면 회로를 열어 운영자 확인 전까지 중단
 */
@Injectable()
export class StudentSyncOrchestratorService {
  /**
   * 비재원생 연결 실패 기록용 로거
   */
  private readonly logger = new Logger(StudentSyncOrchestratorService.name);

  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 수동 실행 멱등 처리
     */
    private readonly idempotency: IdempotencyService,

    /**
     * 통통통 게이트웨이
     */
    private readonly gateway: TongTongTongGateway,

    /**
     * 스냅샷 정규화
     */
    private readonly normalizer: StudentNormalizerService,

    /**
     * 원장 반영
     */
    private readonly promotion: StudentPromotionService,

    /**
     * 비재원생 예약 연결
     */
    private readonly guestReconciler: GuestBookingReconcilerService,
  ) {}

  /**
   * 관리자 수동 실행 접수
   *
   * claim 전에 DB·연동 설정·만료 lease를 확인. 회로가 열렸거나 실행 중이면 거부
   * 같은 멱등 키 재요청은 기존 실행 ID만 반환하고 다시 시작하지 않음
   *
   * @returns 실행 공개 ID
   * @throws {DomainError} 409 회로 열림·실행 중, 503 미설정
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

  /**
   * 예약 실행 1회 접수
   *
   * @returns 실행 공개 ID
   * @throws {DomainError} 409 회로 열림·실행 중
   */
  public async runScheduled(): Promise<string> {
    this.requireDatabase(); this.gateway.assertReady();
    await this.recoverAbandonedLease();
    const claimed = await this.prisma.$transaction((transaction) => this.claim(transaction, "SCHEDULED", "system:scheduler"),
      { timeout: 15_000, maxWait: 5_000 });
    this.startInBackground(claimed.runId);
    return claimed.runId;
  }

  /**
   * 관리자 상태 조회용 연동 설정 준비 여부
   *
   * TongTongTongGateway.assertReady만 호출하며 로그인이나 외부 요청은 하지 않음
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
   * 접수 응답과 실행 분리
   *
   * 밖으로 전파된 예외는 실패 기록을 먼저 시도하고, 그 단계가 성공하면 lease 해제 시도
   * 외부 결과가 불명확한 상태는 execute가 lease를 유지해 만료 복구에 맡김
   */
  private startInBackground(publicRunId: string): void {
    void this.execute(publicRunId).catch(async (error: unknown) => {
      try {
        const run = await this.prisma.syncRun.findUnique({ where: { publicId: publicRunId }, select: { id: true } });
        if (run !== null) await this.failValidation(run.id, this.errorCode(error, "TONG_BACKGROUND_EXECUTION_FAILED"));
        await this.releaseLease(publicRunId);
      } catch {
        // 이후 lease 복구가 실행을 실패로 정리함. 원천 자동 재시도는 없음
      }
    });
  }

  /**
   * 실행 접수
   *
   * 회로 행 잠금 후 OPEN이면 거부, 실행·지점 실행 생성, 30분 lease 획득, 대기 이벤트 기록
   * 호출자 트랜잭션 안에서 실행. lease를 얻지 못하면 409로 실행 생성까지 롤백
   *
   * @throws {DomainError} 409 회로 열림·이미 실행 중, 500 지점·회로 설정 누락
   */
  private async claim(transaction: Prisma.TransactionClient, runType: "MANUAL" | "SCHEDULED", actorSubject: string) {
    const circuit = await transaction.$queryRaw<Array<{ status: string }>>`
      select status from tong_auth_circuit where singleton_id=1 for update`;
    if (circuit[0] === undefined) this.fail(500, "SYNC_CIRCUIT_MISSING");
    if (circuit[0].status === "OPEN") this.fail(409, "TONG_AUTH_CIRCUIT_OPEN");
    const branches = await transaction.branch.findMany({ where: { code: { in: [...BRANCH_ORDER] }, active: true } });
    if (branches.length !== BRANCH_ORDER.length) this.fail(500, "BRANCH_CONFIGURATION_INVALID");
    const run = await transaction.syncRun.create({ data: { runType, status: "RUNNING", initiatedBy: actorSubject.slice(0, 160) } });
    // 비어 있거나 만료된 lease만 획득
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

  /**
   * 만료 lease의 실행 정리
   *
   * 로그인 시도 후 끝나지 않은 실행은 로그인 결과가 불명확하므로 회로를 열고 실패 처리해 자동 재시도 차단
   * 로그인 전에 버려진 실행은 취소 처리. 어느 경우든 lease 해제
   *
   * @throws {DomainError} 409 이번 정리로 회로가 열린 경우
   */
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
      // 로그인 시도 후 버려진 실행: 회로 열기, 지점·실행 실패, 감사 기록, lease 해제
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
      // 로그인 전 버려진 실행: 취소
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
   * 실행 본문
   *
   * 1. 로그인 시도 표식을 먼저 커밋
   * 2. 원천 로그인 후 세 지점을 순서대로 조회. 실패하면 회로를 열고 중단
   * 3. 지점별 행 수 급변 확인과 정규화. 충돌이 있으면 충돌 기록 후 중단
   * 4. 스테이징 적재 후 StudentPromotionService.promote로 원장 반영
   * 5. 비재원생 예약 연결. 실패해도 이미 끝난 원장 반영은 되돌리지 않음
   *
   * 로그인 시도 이후 외부 결과가 확정되기 전에는 회로 OPEN을 기록하기 전까지 lease를 놓지 않음
   */
  private async execute(publicRunId: string): Promise<void> {
    let leaseReleaseSafe = true;
    try {
      const run = await this.prisma.syncRun.findUniqueOrThrow({ where: { publicId: publicRunId }, include: {
        branchRuns: { include: { branch: true }, orderBy: { sequenceNo: "asc" } },
      } });
      try { await this.markLoginAttempt(run.id); }
      catch (error) { await this.failValidation(run.id, this.errorCode(error, "TONG_LOGIN_ATTEMPT_NOT_ALLOWED")); return; }
      // 로그인 시도 이후 외부 결과가 확정되기 전에는 회로 OPEN을 기록한 뒤에만 lease를 놓음
      // OPEN 기록도 실패하면 만료 lease 복구가 RUNNING·loginAttempted를 보고 회로를 엶
      leaseReleaseSafe = false;
      let session: Awaited<ReturnType<TongTongTongGateway["login"]>>;
      try { session = await this.gateway.login(); }
      catch (error) {
        await this.openCircuitAndFail(run.id, null, run.initiatedBy ?? "system:tong-sync", this.errorCode(error, "TONG_AUTH_FAILED_STOPPED"));
        leaseReleaseSafe = true;
        return;
      }

      // 지점별 조회. 각 지점 전에 lease 연장
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

      // 행 수 급변 확인과 정규화. 실패는 검증 실패로 기록
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
        // 학생 원장이 최신이 된 직후 비재원생 예약 연결
        // 실패해도 동기화 자체는 성공이므로 원장 갱신을 되돌리지 않음. 다음 동기화가 같은 후보를 다시 확인
        try {
          await this.guestReconciler.reconcile(run.initiatedBy ?? "system:tong-sync");
        } catch (error) {
          this.logger.error(`guest booking reconciliation failed: ${error instanceof Error ? error.message : "unknown"}`);
        }
      } catch (error) { await this.failValidation(run.id, this.errorCode(error, "TONG_PROMOTION_FAILED")); }
    // lease를 놓으면 안 되는 구간의 예외는 삼키고 만료 복구에 맡김
    } catch (error) {
      if (!leaseReleaseSafe) return;
      throw error;
    } finally {
      if (leaseReleaseSafe) await this.releaseLease(publicRunId);
    }
  }

  /**
   * 로그인 시도 표식 커밋
   *
   * 외부 로그인 전에 회로와 실행 행을 잠그고, 회로 CLOSED·실행 RUNNING·미시도일 때만 표식
   *
   * @throws {DomainError} 409 회로 열림·이미 시도함
   */
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

  /**
   * 회로 열기와 실행 실패 기록
   *
   * 외부 인증·조회 결과가 불명확할 때 회로 OPEN, 지점·실행 실패, 감사를 한 트랜잭션에 기록
   *
   * @param failedBranchRunId 실패한 지점 실행. 로그인 실패면 null
   */
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

  /**
   * 정규화 스냅샷 스테이징 적재
   *
   * 스테이징 행, 지점별 검증 결과, 실행의 해시·지표를 한 트랜잭션에 기록. 학생 원장은 아직 변경하지 않음
   *
   * @throws {DomainError} 409 실행이 RUNNING이 아님
   */
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

  /**
   * 정규화 충돌을 저장하고 원장 반영 없이 실행을 CONFLICT로 종료
   */
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

  /**
   * 검증·반영 실패 기록
   *
   * RUNNING·PUBLISHING 실행만 실패 처리. 이미 종료된 실행은 그대로 둠
   */
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

  /**
   * 지점별 행 수 급변 확인
   *
   * 직전 성공 조회가 20행 이상인 지점에서 절반 미만 또는 1.5배 초과로 바뀌면 거부
   *
   * @throws {DomainError} 422 TONG_ROW_COUNT_DRIFT
   */
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

  /**
   * 스테이징 행 저장 데이터
   *
   * 제외 행은 개인정보 없이 순번·해시·제외 사유만 저장
   */
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

  /**
   * 현재 실행이 소유한 lease만 30분 연장. 소유권을 잃으면 갱신 0건
   */
  private heartbeat(publicRunId: string): Promise<unknown> {
    return this.prisma.syncLease.updateMany({ where: { lockName: LEASE_NAME, holderRunPublicId: publicRunId }, data: {
      lockedUntil: new Date(Date.now() + LEASE_MILLISECONDS), updatedAt: new Date(),
    } });
  }

  /**
   * 현재 실행이 소유한 lease만 해제. 다른 실행의 lease는 유지
   */
  private async releaseLease(publicRunId: string): Promise<void> {
    if (!this.prisma.configured) return;
    await this.prisma.syncLease.updateMany({ where: { lockName: LEASE_NAME, holderRunPublicId: publicRunId }, data: {
      holderRunPublicId: null, lockedUntil: null, updatedAt: new Date(),
    } });
  }

  /**
   * 저장 가능한 오류 코드
   *
   * @returns DomainError 코드가 형식에 맞으면 그 코드, 아니면 대체 코드
   */
  private errorCode(error: unknown, fallback: string): string {
    const code = error instanceof DomainError ? error.code : fallback;
    return /^[A-Z0-9_]{3,100}$/.test(code) ? code : fallback;
  }

  /**
   * JSON 왕복으로 Prisma JSON 입력값 생성
   */
  private json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> { const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy; }

  /**
   * DB 연결 설정 확인
   *
   * @throws {DomainError} 503 DATABASE_NOT_CONFIGURED
   */
  private requireDatabase(): void { if (!this.prisma.configured) this.fail(503, "DATABASE_NOT_CONFIGURED"); }

  /**
   * 동기화 작업 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The student sync operation could not be completed."); }
}
