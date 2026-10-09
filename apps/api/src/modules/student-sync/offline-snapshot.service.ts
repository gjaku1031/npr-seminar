import { Injectable } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { OfflineSnapshotParser } from "./offline-snapshot.parser.js";
import { type BranchCode, type SnapshotSafeSummary, type StagedSnapshotRow } from "./offline-snapshot.types.js";

/**
 * 지점 처리 순서
 */
const BRANCH_ORDER: readonly BranchCode[] = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"];

/**
 * 스테이징 행 일괄 저장 단위
 */
const BATCH_SIZE = 500;

/**
 * 초기 스냅샷 점검·반영 결과
 */
export interface OfflineImportResult {
  /**
   * 동기화 실행 공개 ID
   */
  readonly runId: string;

  /**
   * 실행 상태
   */
  readonly status: string;

  /**
   * 개인정보 없는 요약. 해시는 base64url
   */
  readonly summary: Omit<SnapshotSafeSummary, "snapshotHash"> & { snapshotHash: string };
}

/**
 * 초기 학생 스냅샷 이관
 *
 * 사전 점검(dryRun)으로 스테이징에 적재한 뒤, 같은 파일을 다시 해석해 스테이징과 일치할 때만 반영(publish)
 * 학생·수강 등록·예약이 모두 비어 있는 DB에서 한 번만 허용
 */
@Injectable()
export class OfflineSnapshotService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 스냅샷 해석기
     */
    private readonly parser: OfflineSnapshotParser,
  ) {}

  /**
   * 초기 스냅샷 사전 점검
   *
   * advisory lock 아래 빈 DB·미반영 상태 확인 후 실행·지점 실행·스테이징 행을 한 트랜잭션으로 저장
   * 성공하면 실행은 READY_TO_PUBLISH·반영 가능 상태
   *
   * @throws {DomainError} 409 DB가 비어 있지 않거나 이미 반영됨, 422 스냅샷 검증 실패, 503 DB 미설정
   */
  public async dryRun(snapshotPath: string, actorSubject: string): Promise<OfflineImportResult> {
    this.requireConfigured();
    const parsed = await this.parser.parse(snapshotPath);
    const stagingHash = this.stagingIntegrityHash(parsed.rows);
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(hashtext('npr-offline-initial-dry-run'))`;
      await this.requireInitialStudentDataEmpty(transaction);
      const existingPublished = await transaction.syncRun.count({ where: { status: "PUBLISHED" } });
      if (existingPublished > 0) this.fail(409, "INITIAL_LOAD_ALREADY_PUBLISHED");
      const run = await transaction.syncRun.create({
        data: {
          runType: "OFFLINE_INITIAL_DRY_RUN",
          status: "RUNNING",
          initiatedBy: actorSubject.slice(0, 160),
          snapshotId: parsed.summary.snapshotId,
          snapshotHash: this.bytes(parsed.summary.snapshotHash),
          stagingHash: this.bytes(stagingHash),
          rawRowCount: parsed.summary.rawRows,
          includedAssignmentCount: parsed.summary.includedAssignments,
          uniqueStudentCount: parsed.summary.uniqueStudents,
          excludedCount: parsed.summary.excludedRows,
          ambiguityCount: parsed.summary.ambiguousStudents,
        },
      });
      const branches = await transaction.branch.findMany({ where: { code: { in: [...BRANCH_ORDER] } } });
      if (branches.length !== BRANCH_ORDER.length) this.fail(500, "BRANCH_CONFIGURATION_INVALID");
      const branchIds = new Map(branches.map((branch) => [branch.code as BranchCode, branch.id]));
      await transaction.syncBranchRun.createMany({
        data: BRANCH_ORDER.map((branch, index) => {
          const counts = parsed.summary.branchCounts[branch];
          return {
            syncRunId: run.id,
            branchId: branchIds.get(branch)!,
            sequenceNo: index + 1,
            status: "READY_TO_PUBLISH",
            fetchedCount: counts.raw,
            stagedCount: counts.raw,
            includedCount: counts.assignments,
            excludedCount: counts.raw - counts.assignments,
            snapshotHash: this.bytes(parsed.summary.snapshotHash),
            finishedAt: new Date(),
          };
        }),
      });
      // 스테이징 행을 500건 단위로 저장
      for (let offset = 0; offset < parsed.rows.length; offset += BATCH_SIZE) {
        const batch = parsed.rows.slice(offset, offset + BATCH_SIZE);
        await transaction.stagingStudent.createMany({
          data: batch.map((row) => this.stagingData(row, run.id, branchIds.get(row.branchCode)!)),
        });
      }
      return transaction.syncRun.update({
        where: { id: run.id },
        data: { status: "READY_TO_PUBLISH", publishable: true, finishedAt: new Date() },
      });
    }, { timeout: 120_000, maxWait: 10_000 });
    return this.safeResult(result.publicId, result.status, parsed.summary);
  }

  /**
   * 초기 스냅샷 반영
   *
   * 1. 확인 문구 확인 후 스냅샷 재해석
   * 2. advisory lock과 실행 행 잠금 후 반영 가능 상태·스냅샷 해시·스테이징 무결성 해시 대조
   * 3. 빈 DB·다른 반영 실행 없음 재확인
   * 4. 대표 수강 등록으로 학생 생성, 포함 등록 전체로 수강 등록 생성, 스냅샷에 없는 기존 행 비활성화, 생성 이력 기록
   * 5. 실행 PUBLISHED 전환 후 스테이징 정리. 모두 한 트랜잭션
   * 6. 커밋 후 통계 갱신(analyze_student_import)
   *
   * @throws {DomainError} 400 확인 문구 불일치, 409 반영 불가 상태·불일치·이미 반영됨
   */
  public async publish(
    snapshotPath: string,
    runId: string,
    confirmation: string,
    actorSubject: string,
  ): Promise<OfflineImportResult> {
    this.requireConfigured();
    if (confirmation !== `PUBLISH INITIAL SNAPSHOT ${runId}`) this.fail(400, "INITIAL_PUBLISH_CONFIRMATION_REQUIRED");
    const parsed = await this.parser.parse(snapshotPath);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(hashtext('npr-initial-snapshot-publish'))`;
      const locked = await transaction.$queryRaw<Array<{
        id: bigint;
        status: string;
        publishable: boolean;
        snapshot_hash: Uint8Array;
        staging_hash: Uint8Array;
        snapshot_id: string | null;
      }>>`select id,status,publishable,snapshot_hash,staging_hash,snapshot_id from sync_runs where public_id=${runId}::uuid for update`;
      const run = locked[0];
      if (run === undefined || run.status !== "READY_TO_PUBLISH" || !run.publishable) {
        this.fail(409, "INITIAL_RUN_NOT_PUBLISHABLE");
      }
      // 사전 점검 이후 파일이 바뀌지 않았는지 스냅샷 해시로 확인
      const persistedHash = Buffer.from(run.snapshot_hash);
      if (persistedHash.length !== parsed.summary.snapshotHash.length
        || !timingSafeEqual(persistedHash, parsed.summary.snapshotHash)
        || run.snapshot_id !== parsed.summary.snapshotId) this.fail(409, "INITIAL_SNAPSHOT_MISMATCH");
      // 저장된 스테이징 행이 점검 당시와 같은지 무결성 해시로 확인
      const stagedRows = await transaction.$queryRaw<Array<{
        source_ordinal: number; row_hash: Uint8Array; included: boolean; primary_candidate: boolean;
        primary_selected: boolean; class_resolution_status: string | null; class_resolution_reason: string | null;
      }>>`select source_ordinal,row_hash,included,primary_candidate,primary_selected,
                 class_resolution_status,class_resolution_reason
            from staging_students where sync_run_id=${run.id} order by source_ordinal`;
      const actualStagingHash = this.stagingIntegrityHash(stagedRows.map((row) => ({
        sourceOrdinal: row.source_ordinal,
        rowHash: Buffer.from(row.row_hash),
        included: row.included,
        primaryCandidate: row.primary_candidate,
        primarySelected: row.primary_selected,
        classResolutionStatus: row.class_resolution_status,
        classResolutionReason: row.class_resolution_reason,
      })));
      const expectedStagingHash = Buffer.from(run.staging_hash);
      if (stagedRows.length !== parsed.summary.rawRows || expectedStagingHash.length !== actualStagingHash.length
        || !timingSafeEqual(expectedStagingHash, actualStagingHash)) this.fail(409, "INITIAL_STAGING_INTEGRITY_MISMATCH");
      await this.requireInitialStudentDataEmpty(transaction);
      const priorPublished = await transaction.syncRun.count({ where: { status: "PUBLISHED", id: { not: run.id } } });
      if (priorPublished > 0) this.fail(409, "INITIAL_LOAD_ALREADY_PUBLISHED");
      await transaction.syncRun.update({ where: { id: run.id }, data: { status: "PUBLISHING" } });

      // 학생 생성. 과학 반만이면 반 이름을 `과학`, 반 없음이면 `미분류`로 표시
      await transaction.$executeRaw`
        insert into students(
          public_id,source_student_no,branch_id,name,class_name,school_name,grade,teacher_name,unit_name,
          mother_phone_ciphertext,mother_phone_digest,mother_phone_last4,
          father_phone_ciphertext,father_phone_digest,father_phone_last4,source_status,source_active,
          source_hash,class_resolution_status,class_resolution_reason,first_seen_run_id,last_seen_run_id,
          source_inactivated_at,created_at,updated_at
        )
        select gen_random_uuid(),st.source_student_no,st.branch_id,st.name,
               case when st.class_resolution_status='SCIENCE_ONLY' then '과학'
                    when st.class_resolution_reason='NO_CLASS' then '미분류'
                    else st.class_name end,
               st.school_name,st.grade,st.teacher_name,st.unit_name,st.mother_phone_ciphertext,
               st.mother_phone_digest,st.mother_phone_last4,st.father_phone_ciphertext,
               st.father_phone_digest,st.father_phone_last4,st.source_status,true,st.row_hash,
               st.class_resolution_status,st.class_resolution_reason,${run.id},${run.id},null,now(),now()
          from staging_students st
         where st.sync_run_id=${run.id} and st.included and st.primary_selected
        on conflict(source_student_no) do update set
          branch_id=excluded.branch_id,name=excluded.name,class_name=excluded.class_name,
          school_name=excluded.school_name,grade=excluded.grade,teacher_name=excluded.teacher_name,
          unit_name=excluded.unit_name,mother_phone_ciphertext=excluded.mother_phone_ciphertext,
          mother_phone_digest=excluded.mother_phone_digest,mother_phone_last4=excluded.mother_phone_last4,
          father_phone_ciphertext=excluded.father_phone_ciphertext,
          father_phone_digest=excluded.father_phone_digest,father_phone_last4=excluded.father_phone_last4,
          source_status=excluded.source_status,source_active=true,source_hash=excluded.source_hash,
          class_resolution_status=excluded.class_resolution_status,class_resolution_reason=excluded.class_resolution_reason,
          last_seen_run_id=excluded.last_seen_run_id,source_inactivated_at=null,updated_at=now()`;

      // 포함된 모든 수강 등록 생성
      await transaction.$executeRaw`
        insert into student_class_assignments(
          public_id,student_id,source_unique_no,class_registration_no,class_name,teacher_name,unit_name,
          school_name,grade,source_hash,source_active,first_seen_run_id,last_seen_run_id,
          source_inactivated_at,created_at,updated_at
        )
        select gen_random_uuid(),s.id,st.source_unique_no,st.class_registration_no,st.class_name,
               st.teacher_name,st.unit_name,st.school_name,st.grade,st.row_hash,true,${run.id},${run.id},null,now(),now()
          from staging_students st join students s on s.source_student_no=st.source_student_no
         where st.sync_run_id=${run.id} and st.included
        on conflict(student_id,source_unique_no,class_registration_no) do update set
          class_name=excluded.class_name,teacher_name=excluded.teacher_name,unit_name=excluded.unit_name,
          school_name=excluded.school_name,grade=excluded.grade,source_hash=excluded.source_hash,
          source_active=true,last_seen_run_id=excluded.last_seen_run_id,source_inactivated_at=null,updated_at=now()`;

      // 이번 스냅샷에 없는 기존 수강 등록·학생 비활성화
      await transaction.$executeRaw`
        update student_class_assignments a set source_active=false,source_inactivated_at=now(),updated_at=now()
         where a.source_active and not exists(
           select 1 from staging_students st join students s on s.source_student_no=st.source_student_no
            where st.sync_run_id=${run.id} and st.included and s.id=a.student_id
              and st.source_unique_no=a.source_unique_no and st.class_registration_no=a.class_registration_no)`;
      await transaction.$executeRaw`
        update students s set source_active=false,source_inactivated_at=now(),updated_at=now()
         where s.source_active and not exists(
           select 1 from staging_students st where st.sync_run_id=${run.id} and st.included
             and st.source_student_no=s.source_student_no)`;
      // 이번 실행에서 처음 생긴 학생의 생성 이력
      await transaction.$executeRaw`
        insert into student_history(
          student_id,sync_run_id,change_type,current_snapshot,
          father_phone_ciphertext,father_phone_digest,father_phone_last4
        )
        select s.id,${run.id},'CREATED',jsonb_build_object(
          'branchId',s.branch_id,'classResolutionStatus',s.class_resolution_status),
          s.father_phone_ciphertext,s.father_phone_digest,s.father_phone_last4
          from students s where s.first_seen_run_id=${run.id}`;
      await transaction.syncBranchRun.updateMany({
        where: { syncRunId: run.id },
        data: { status: "PROMOTED", finishedAt: new Date() },
      });
      await transaction.syncRun.update({
        where: { id: run.id },
        data: {
          status: "PUBLISHED",
          publishable: false,
          publishedAt: new Date(),
          finishedAt: new Date(),
          publishedBy: actorSubject.slice(0, 160),
        },
      });
      // 스테이징 개인정보 정리
      await transaction.$queryRaw`select purge_sync_staging(${run.id})`;
    }, { timeout: 120_000, maxWait: 10_000 });
    await this.prisma.$queryRaw`select analyze_student_import()`;
    return this.safeResult(runId, "PUBLISHED", parsed.summary);
  }

  /**
   * 스테이징 행 저장 데이터
   *
   * 제외 행은 개인정보 없이 순번·해시·제외 사유만 저장
   */
  private stagingData(row: StagedSnapshotRow, syncRunId: bigint, branchId: bigint) {
    if (!row.included) {
      return {
        syncRunId,
        branchId,
        sourceOrdinal: row.sourceOrdinal,
        sourceUniqueNo: `excluded:${row.sourceOrdinal}`,
        classRegistrationNo: `excluded:${row.sourceOrdinal}`,
        sourceStudentNo: null,
        name: null,
        className: null,
        schoolName: null,
        grade: null,
        teacherName: null,
        unitName: null,
        motherPhoneCiphertext: null,
        motherPhoneDigest: null,
        motherPhoneLast4: null,
        fatherPhoneCiphertext: null,
        fatherPhoneDigest: null,
        fatherPhoneLast4: null,
        fatherPhoneObserved: row.fatherPhoneObserved,
        sourceStatus: null,
        rowHash: this.bytes(row.rowHash),
        included: false,
        exclusionReason: row.exclusionReason,
        primaryCandidate: false,
        primarySelected: false,
        classResolutionStatus: null,
        classResolutionReason: null,
      };
    }
    return {
      syncRunId,
      branchId,
      sourceOrdinal: row.sourceOrdinal,
      sourceUniqueNo: row.sourceUniqueNo,
      classRegistrationNo: row.classRegistrationNo,
      sourceStudentNo: row.sourceStudentNo,
      name: row.name,
      className: row.className,
      schoolName: row.schoolName,
      grade: row.grade,
      teacherName: row.teacherName,
      unitName: row.unitName,
      motherPhoneCiphertext: row.motherPhoneCiphertext === null ? null : this.bytes(row.motherPhoneCiphertext),
      motherPhoneDigest: row.motherPhoneDigest === null ? null : this.bytes(row.motherPhoneDigest),
      motherPhoneLast4: row.motherPhoneLast4,
      fatherPhoneCiphertext: row.fatherPhoneCiphertext === null ? null : this.bytes(row.fatherPhoneCiphertext),
      fatherPhoneDigest: row.fatherPhoneDigest === null ? null : this.bytes(row.fatherPhoneDigest),
      fatherPhoneLast4: row.fatherPhoneLast4,
      fatherPhoneObserved: row.fatherPhoneObserved,
      sourceStatus: row.sourceStatus,
      rowHash: this.bytes(row.rowHash),
      included: row.included,
      exclusionReason: row.exclusionReason,
      primaryCandidate: row.primaryCandidate,
      primarySelected: row.primarySelected,
      classResolutionStatus: row.classResolutionStatus,
      classResolutionReason: row.classResolutionReason,
    };
  }

  /**
   * 스테이징 무결성 해시
   *
   * 순번 오름차순으로 순번·행 해시·포함·대표 후보·대표 선택·판정 상태·사유를 이어 SHA-256
   */
  private stagingIntegrityHash(rows: ReadonlyArray<{
    readonly sourceOrdinal: number;
    readonly rowHash: Uint8Array;
    readonly included: boolean;
    readonly primaryCandidate: boolean;
    readonly primarySelected: boolean;
    readonly classResolutionStatus: string | null;
    readonly classResolutionReason: string | null;
  }>): Buffer {
    const hash = createHash("sha256");
    for (const row of [...rows].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal)) {
      hash.update([
        row.sourceOrdinal,
        Buffer.from(row.rowHash).toString("base64url"),
        Number(row.included),
        Number(row.primaryCandidate),
        Number(row.primarySelected),
        row.classResolutionStatus ?? "",
        row.classResolutionReason ?? "",
      ].join("\u0000"));
      hash.update("\n");
    }
    return hash.digest();
  }

  /**
   * 학생·수강 등록·예약이 모두 비어 있는지 확인
   *
   * @throws {DomainError} 409 INITIAL_DATABASE_NOT_EMPTY
   */
  private async requireInitialStudentDataEmpty(transaction: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0]): Promise<void> {
    const counts = await transaction.$queryRaw<Array<{ students: bigint; assignments: bigint; bookings: bigint }>>`
      select (select count(*) from students) students,
             (select count(*) from student_class_assignments) assignments,
             (select count(*) from family_bookings) bookings`;
    const count = counts[0];
    if (count === undefined || count.students !== 0n || count.assignments !== 0n || count.bookings !== 0n) {
      this.fail(409, "INITIAL_DATABASE_NOT_EMPTY");
    }
  }

  /**
   * 결과 응답 조립. 해시를 base64url 문자열로 변환
   */
  private safeResult(runId: string, status: string, summary: SnapshotSafeSummary): OfflineImportResult {
    return {
      runId,
      status,
      summary: { ...summary, snapshotHash: summary.snapshotHash.toString("base64url") },
    };
  }

  /**
   * DB 연결 설정 확인
   *
   * @throws {DomainError} 503 DATABASE_NOT_CONFIGURED
   */
  private requireConfigured(): void {
    if (!this.prisma.configured) this.fail(503, "DATABASE_NOT_CONFIGURED");
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
    copy.set(value);
    return copy;
  }

  /**
   * 초기 이관 작업 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The offline snapshot operation could not be completed.");
  }
}
