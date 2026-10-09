import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { StudentSyncOrchestratorService } from "./student-sync-orchestrator.service.js";

/**
 * 화면 비교용 기준 건수. 2026-07-17 초기 스냅샷 값
 */
const CANONICAL_REFERENCE = {
  snapshotDate: "2026-07-17", rawFetchedAssignmentCount: 10021, bracketExcludedAssignmentCount: 6222,
  includedAssignmentCount: 3799, uniqueStudentCount: 3377, multiAssignmentStudentCount: 371,
  regularRepresentativeCount: 2986, scienceAliasRepresentativeCount: 387,
  multipleRegularAmbiguousCount: 1, noClassAmbiguousCount: 3, ambiguousStudentCount: 4,
};

/**
 * 학생 동기화 상태·이력 조회와 수동 실행·회로 초기화
 */
@Injectable()
export class StudentSyncAdminService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 멱등 처리
     */
    private readonly idempotency: IdempotencyService,

    /**
     * 동기화 실행기
     */
    private readonly orchestrator: StudentSyncOrchestratorService,
  ) {}

  /**
   * 동기화 상태 요약
   *
   * 원천 기준·서울 6시간 주기·지점 순서·회로 상태·최근 실행·기준 건수
   */
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

  /**
   * 실행 목록. 시작 시각 최신순
   *
   * @param status 상태 필터. 생략하면 전체
   */
  public async list(status?: string, page = 1, pageSize = 50) {
    const where = status === undefined ? {} : { status };
    const [rows, totalItems] = await Promise.all([
      this.prisma.syncRun.findMany({ where, include: { branchRuns: { include: { branch: true }, orderBy: { sequenceNo: "asc" } }, conflicts: true }, orderBy: { startedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.syncRun.count({ where }),
    ]);
    return { items: rows.map((row) => this.run(row)), page: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) } };
  }

  /**
   * 실행 1건
   *
   * @throws {DomainError} 404 SYNC_RUN_NOT_FOUND
   */
  public async get(runId: string) {
    const row = await this.prisma.syncRun.findUnique({
      where: { publicId: runId }, include: { branchRuns: { include: { branch: true }, orderBy: { sequenceNo: "asc" } }, conflicts: true },
    });
    if (row === null) this.fail(404, "SYNC_RUN_NOT_FOUND");
    return this.run(row);
  }

  /**
   * 수동 실행 후 실행 정보 반환
   */
  public async manual(reason: string, actorSubject: string, key: string) {
    const runId = await this.orchestrator.runManual(reason, actorSubject, key);
    return this.get(runId);
  }

  /**
   * 로그인 회로 상태
   *
   * @returns 응답 버전은 저장 버전+1
   * @throws {DomainError} 500 회로 행 누락
   */
  public async circuit() {
    const row = await this.prisma.tongAuthCircuit.findUnique({ where: { singletonId: 1 }, include: { openedRun: true } });
    if (row === null) this.fail(500, "SYNC_CIRCUIT_MISSING");
    return {
      status: row.status, version: Number(row.version) + 1, openedAt: row.openedAt,
      openedReasonCode: row.openedReasonCode, openedRunId: row.openedRun?.publicId ?? null,
      lastResetAt: row.lastResetAt, lastResetBy: row.lastResetBy,
    };
  }

  /**
   * 로그인 회로 수동 초기화
   *
   * 운영자가 원천 로그인 정상을 확인했다는 확인 문구가 정확해야 함. 회로 행 잠금 후 CLOSED 전환과 감사 기록
   *
   * @throws {DomainError} 400 확인 문구 불일치, 500 회로 행 누락
   */
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

  /**
   * 회로 감사 이벤트 커서 조회
   *
   * @param afterSequence 이 순번 다음부터. 생략하면 처음부터
   * @param requestedLimit 1~200, 기본 50
   */
  public async circuitEvents(afterSequence?: string, requestedLimit?: number) {
    const after = afterSequence === undefined ? 0n : BigInt(afterSequence);
    const limit = Math.min(Math.max(requestedLimit ?? 50, 1), 200);
    const rows = await this.prisma.tongAuthCircuitAudit.findMany({ where: { id: { gt: after } }, orderBy: { id: "asc" }, take: limit + 1, include: { syncRun: true } });
    // UUID 주체는 관리자, 그 외는 시스템 주체로 표시
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

  /**
   * 실행 감사 이벤트 커서 조회
   *
   * @param runId 실행 필터. 생략하면 전체
   * @param afterSequence 이 순번 다음부터. 생략하면 처음부터
   * @param requestedLimit 1~200, 기본 50
   */
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

  /**
   * 실행 행을 응답 형태로 변환
   *
   * 지표 JSON이 없던 이전 실행은 실행 행 건수로 기본값 채움. 충돌 학번은 마스킹
   * 초기 스냅샷 사전 점검 실행 유형은 INITIAL_SNAPSHOT_DRY_RUN으로 통일
   */
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

  /**
   * 학번 마스킹. 4자 이하는 첫 글자만, 그 외는 앞뒤 2자만 표시
   */
  private mask(value: string | null): string {
    if (value === null || value.length === 0) return "***";
    if (value.length <= 4) return `${value[0] ?? ""}***`;
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  /**
   * 동기화 관리 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never { throw new DomainError(status, code, "The student sync operation could not be completed."); }
}
