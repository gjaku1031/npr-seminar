import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { StudentSyncOrchestratorService } from "./student-sync-orchestrator.service.js";

const CANONICAL_REFERENCE = {
  snapshotDate: "2026-07-17", rawFetchedAssignmentCount: 10021, bracketExcludedAssignmentCount: 6222,
  includedAssignmentCount: 3799, uniqueStudentCount: 3377, multiAssignmentStudentCount: 371,
  regularRepresentativeCount: 2986, scienceAliasRepresentativeCount: 387,
  multipleRegularAmbiguousCount: 1, noClassAmbiguousCount: 3, ambiguousStudentCount: 4,
};

@Injectable()
export class StudentSyncAdminService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly orchestrator: StudentSyncOrchestratorService,
  ) {}

  public async status() {
    const [circuit, latest] = await Promise.all([this.circuit(), this.prisma.syncRun.findFirst({
      include: { branchRuns: { include: { branch: true }, orderBy: { sequenceNo: "asc" } }, conflicts: true }, orderBy: { startedAt: "desc" },
    })]);
    return {
      studentSourceOfTruth: "POSTGRESQL", scheduleZone: "Asia/Seoul", scheduleIntervalHours: 6,
      liveSourceReady: this.orchestrator.liveSourceReady(),
      branchOrder: ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"], circuit,
      latestRun: latest === null ? null : this.run(latest), canonicalReference: CANONICAL_REFERENCE,
    };
  }

  public async list(status?: string, page = 1, pageSize = 50) {
    const where = status === undefined ? {} : { status };
    const [rows, totalItems] = await Promise.all([
      this.prisma.syncRun.findMany({ where, include: { branchRuns: { include: { branch: true }, orderBy: { sequenceNo: "asc" } }, conflicts: true }, orderBy: { startedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.syncRun.count({ where }),
    ]);
    return { items: rows.map((row) => this.run(row)), page: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
  }

  public async get(runId: string) {
    const row = await this.prisma.syncRun.findUnique({
      where: { publicId: runId }, include: { branchRuns: { include: { branch: true }, orderBy: { sequenceNo: "asc" } }, conflicts: true },
    });
    if (row === null) this.fail(404, "SYNC_RUN_NOT_FOUND");
    return this.run(row);
  }

  public async manual(reason: string, actorSubject: string, key: string) {
    const runId = await this.orchestrator.runManual(reason, actorSubject, key);
    return this.get(runId);
  }

  public async circuit() {
    const row = await this.prisma.tongAuthCircuit.findUnique({ where: { singletonId: 1 }, include: { openedRun: true } });
    if (row === null) this.fail(500, "SYNC_CIRCUIT_MISSING");
    return {
      status: row.status, version: Number(row.version) + 1, openedAt: row.openedAt,
      openedReasonCode: row.openedReasonCode, openedRunId: row.openedRun?.publicId ?? null,
      lastResetAt: row.lastResetAt, lastResetBy: row.lastResetBy,
    };
  }

  public resetCircuit(confirmationText: string, reason: string, actorSubject: string, key: string) {
    if (confirmationText !== "I CONFIRM UPSTREAM LOGIN IS NORMAL") this.fail(400, "CIRCUIT_RESET_CONFIRMATION_INVALID");
    return this.idempotency.execute("SYNC_CIRCUIT_RESET", key, { confirmationText, reason, actorSubject }, async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ status: string }>>`select status from tong_auth_circuit where singleton_id=1 for update`;
      if (rows[0] === undefined) this.fail(500, "SYNC_CIRCUIT_MISSING");
      await transaction.tongAuthCircuit.update({
        where: { singletonId: 1 }, data: {
          status: "CLOSED", openedAt: null, openedReasonCode: null, openedRunId: null,
          lastResetAt: new Date(), lastResetBy: actorSubject, version: { increment: 1 },
        },
      });
      await transaction.tongAuthCircuitAudit.create({
        data: { eventType: "RESET", actorSubject, reasonCode: "OPERATOR_CONFIRMED_UPSTREAM_RECOVERY", reason: reason.slice(0, 1000) },
      });
      const row = await transaction.tongAuthCircuit.findUniqueOrThrow({ where: { singletonId: 1 } });
      return { status: row.status, version: Number(row.version) + 1, openedAt: null, openedReasonCode: null, openedRunId: null, lastResetAt: row.lastResetAt, lastResetBy: row.lastResetBy };
    });
  }

  public async circuitEvents(afterSequence?: string, requestedLimit?: number) {
    const after = afterSequence === undefined ? 0n : BigInt(afterSequence);
    const limit = Math.min(Math.max(requestedLimit ?? 50, 1), 200);
    const rows = await this.prisma.tongAuthCircuitAudit.findMany({ where: { id: { gt: after } }, orderBy: { id: "asc" }, take: limit + 1, include: { syncRun: true } });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return { items: rows.slice(0, limit).map((row) => ({
      sequence: row.id.toString(), eventId: row.eventId, runId: row.syncRun?.publicId ?? null,
      type: row.eventType, reasonCode: row.reasonCode, reason: row.reason,
      actor: uuid.test(row.actorSubject)
        ? { type: "ADMIN", subjectId: row.actorSubject, displayName: null }
        : { type: "SYSTEM", subjectId: null, displayName: row.actorSubject.slice(0, 100) },
      occurredAt: row.occurredAt,
    })), page: { nextAfterSequence: rows.length > limit ? rows[limit - 1]!.id.toString() : null, hasMore: rows.length > limit } };
  }

  public async events(runId?: string, afterSequence?: string, requestedLimit?: number) {
    const after = afterSequence === undefined ? 0n : BigInt(afterSequence);
    const limit = Math.min(Math.max(requestedLimit ?? 50, 1), 200);
    const rows = await this.prisma.syncAuditEvent.findMany({
      where: { id: { gt: after }, ...(runId === undefined ? {} : { syncRun: { publicId: runId } }) },
      include: { syncRun: true }, orderBy: { id: "asc" }, take: limit + 1,
    });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return {
      items: rows.slice(0, limit).map((row) => ({
        eventId: row.eventId, sequence: row.id.toString(), runId: row.syncRun.publicId, branch: row.branchCode,
        type: row.eventType,
        actor: uuid.test(row.actorSubject)
          ? { type: "ADMIN", subjectId: row.actorSubject, displayName: null }
          : { type: "SYSTEM", subjectId: null, displayName: row.actorSubject.slice(0, 100) },
        counts: row.counts, errorCode: row.errorCode, metadata: row.safeMetadata, occurredAt: row.occurredAt,
      })),
      page: { nextAfterSequence: rows.length > limit ? rows[limit - 1]!.id.toString() : null, hasMore: rows.length > limit },
    };
  }

  private run(row: any) {
    const emptyCounts = {
      fetchedAssignmentCount: 0, bracketExcludedAssignmentCount: 0, includedAssignmentCount: 0,
      uniqueStudentCount: 0, multiAssignmentStudentCount: 0, regularRepresentativeCount: 0,
      scienceAliasRepresentativeCount: 0, multipleRegularAmbiguousCount: 0, noClassAmbiguousCount: 0,
      ambiguousStudentCount: 0, insertedStudentCount: 0, updatedStudentCount: 0, inactivatedStudentCount: 0,
      insertedAssignmentCount: 0, updatedAssignmentCount: 0, inactivatedAssignmentCount: 0,
    };
    const metrics = row.metrics !== null && typeof row.metrics === "object" && !Array.isArray(row.metrics) ? row.metrics : {};
    const counts = metrics.counts !== null && typeof metrics.counts === "object" && !Array.isArray(metrics.counts)
      ? { ...emptyCounts, ...metrics.counts }
      : { ...emptyCounts, fetchedAssignmentCount: row.rawRowCount, includedAssignmentCount: row.includedAssignmentCount,
        uniqueStudentCount: row.uniqueStudentCount, ambiguousStudentCount: row.ambiguityCount };
    const branchMetrics = metrics.branches !== null && typeof metrics.branches === "object" && !Array.isArray(metrics.branches)
      ? metrics.branches : {};
    const conflicts = (row.conflicts ?? []).map((conflict: any) => {
      const details = conflict.safeDetails !== null && typeof conflict.safeDetails === "object" && !Array.isArray(conflict.safeDetails)
        ? conflict.safeDetails : {};
      return {
        type: conflict.conflictType, branch: conflict.branchCode, studentNoMasked: this.mask(conflict.sourceStudentNo),
        sourceAssignmentKeyDigest: typeof details.sourceAssignmentKeyDigest === "string" ? details.sourceAssignmentKeyDigest : null,
        detail: typeof details.detail === "string" ? details.detail : "A student snapshot conflict was detected.",
      };
    });
    return {
      runId: row.publicId,
      runType: row.runType === "OFFLINE_INITIAL_DRY_RUN" || row.runType === "INITIAL_DRY_RUN" ? "INITIAL_SNAPSHOT_DRY_RUN" : row.runType,
      status: row.status, publishable: row.publishable, loginAttempted: row.loginAttempted,
      automaticLoginRetryCount: 0, branchOrder: ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"],
      branches: row.branchRuns.map((branch: any) => ({
        branch: branch.branch.code, sequence: branch.sequenceNo, status: branch.status,
        counts: { ...emptyCounts, ...(branchMetrics[branch.branch.code] ?? {}),
          fetchedAssignmentCount: branch.fetchedCount, includedAssignmentCount: branch.includedCount },
        startedAt: branch.startedAt, finishedAt: branch.finishedAt, errorCode: branch.errorCode,
      })),
      counts, conflicts, requestedAt: row.startedAt, startedAt: row.startedAt, finishedAt: row.finishedAt,
      publishedAt: row.publishedAt, requestedBy: row.initiatedBy ?? "system", errorCode: row.errorCode,
    };
  }
  private mask(value: string | null): string {
    if (value === null || value.length === 0) return "***";
    if (value.length <= 4) return `${value[0] ?? ""}***`;
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The student sync operation could not be completed."); }
}
