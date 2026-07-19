import { Injectable } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { BranchCode, StagedSnapshotRow } from "./offline-snapshot.types.js";
import type { LiveSyncCounts, NormalizedLiveSnapshot } from "./student-normalizer.service.js";

interface MutationCounts {
  readonly insertedStudentCount: number;
  readonly updatedStudentCount: number;
  readonly inactivatedStudentCount: number;
  readonly insertedAssignmentCount: number;
  readonly updatedAssignmentCount: number;
  readonly inactivatedAssignmentCount: number;
}

const BRANCH_ORDER: readonly BranchCode[] = ["SONGPA", "WIRYE", "GWANGJIN"];

@Injectable()
export class StudentPromotionService {
  public constructor(private readonly prisma: PrismaService) {}

  public async promote(
    runId: bigint,
    snapshot: NormalizedLiveSnapshot,
    branchIds: ReadonlyMap<BranchCode, bigint>,
  ): Promise<{ readonly status: "SUCCEEDED" | "NO_CHANGES"; readonly metrics: Prisma.InputJsonValue }> {
    const mutations = await this.mutations(snapshot.rows, branchIds);
    const totalMutation = this.sumMutations(Object.values(mutations));
    const status = Object.values(totalMutation).every((value) => value === 0) ? "NO_CHANGES" : "SUCCEEDED";
    const metrics = {
      counts: { ...snapshot.counts, ...totalMutation },
      branches: Object.fromEntries(BRANCH_ORDER.map((branch) => [branch, { ...snapshot.branchCounts[branch], ...mutations[branch] }])),
    } satisfies Prisma.InputJsonObject;
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{
        id: bigint; status: string; login_attempted: boolean; staging_hash: Uint8Array | null; initiated_by: string | null;
      }>>`select id,status,login_attempted,staging_hash,initiated_by from sync_runs where id=${runId} for update`;
      const run = locked[0];
      if (run === undefined || run.status !== "RUNNING" || !run.login_attempted || run.staging_hash === null) {
        this.fail("SYNC_RUN_NOT_PROMOTABLE");
      }
      const branchRuns = await transaction.syncBranchRun.findMany({ where: { syncRunId: runId }, orderBy: { sequenceNo: "asc" } });
      if (branchRuns.length !== 3 || branchRuns.some((branch) => branch.status !== "VALIDATED")) this.fail("SYNC_STAGING_INCOMPLETE");
      const staged = await transaction.$queryRaw<Array<{
        source_ordinal: number; row_hash: Uint8Array; included: boolean; primary_selected: boolean;
      }>>`select source_ordinal,row_hash,included,primary_selected from staging_students
            where sync_run_id=${runId} order by source_ordinal`;
      const actualHash = this.stagingHash(staged.map((row) => ({
        sourceOrdinal: row.source_ordinal, rowHash: Buffer.from(row.row_hash), included: row.included, primarySelected: row.primary_selected,
      })));
      const expectedHash = Buffer.from(run.staging_hash);
      if (staged.length !== snapshot.rows.length || actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
        this.fail("SYNC_STAGING_INTEGRITY_MISMATCH");
      }
      await transaction.syncRun.update({ where: { id: runId }, data: { status: "PUBLISHING" } });
      await transaction.syncBranchRun.updateMany({ where: { syncRunId: runId }, data: { status: "PROMOTING" } });

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
               st.class_resolution_status,st.class_resolution_reason,${runId},${runId},null,now(),now()
          from staging_students st
         where st.sync_run_id=${runId} and st.included and st.primary_selected
        on conflict(source_student_no) do nothing`;

      await transaction.$executeRaw`
        update students s set
          branch_id=st.branch_id,name=st.name,
          class_name=case when st.class_resolution_status='SCIENCE_ONLY' then '과학'
                          when st.class_resolution_reason='NO_CLASS' then '미분류'
                          else st.class_name end,
          school_name=st.school_name,grade=st.grade,teacher_name=st.teacher_name,unit_name=st.unit_name,
          mother_phone_ciphertext=st.mother_phone_ciphertext,mother_phone_digest=st.mother_phone_digest,
          mother_phone_last4=st.mother_phone_last4,
          father_phone_ciphertext=case when st.father_phone_observed then st.father_phone_ciphertext else s.father_phone_ciphertext end,
          father_phone_digest=case when st.father_phone_observed then st.father_phone_digest else s.father_phone_digest end,
          father_phone_last4=case when st.father_phone_observed then st.father_phone_last4 else s.father_phone_last4 end,
          source_status=st.source_status,source_active=true,source_hash=st.row_hash,
          class_resolution_status=st.class_resolution_status,class_resolution_reason=st.class_resolution_reason,
          last_seen_run_id=${runId},source_inactivated_at=null,updated_at=now()
        from staging_students st
        where st.sync_run_id=${runId} and st.included and st.primary_selected
          and s.source_student_no=st.source_student_no`;

      await transaction.$executeRaw`
        insert into student_class_assignments(
          public_id,student_id,source_unique_no,class_registration_no,class_name,teacher_name,unit_name,
          school_name,grade,source_hash,source_active,first_seen_run_id,last_seen_run_id,
          source_inactivated_at,created_at,updated_at
        )
        select gen_random_uuid(),s.id,st.source_unique_no,st.class_registration_no,st.class_name,
               st.teacher_name,st.unit_name,st.school_name,st.grade,st.row_hash,true,${runId},${runId},null,now(),now()
          from staging_students st join students s on s.source_student_no=st.source_student_no
         where st.sync_run_id=${runId} and st.included
        on conflict(student_id,source_unique_no,class_registration_no) do update set
          class_name=excluded.class_name,teacher_name=excluded.teacher_name,unit_name=excluded.unit_name,
          school_name=excluded.school_name,grade=excluded.grade,source_hash=excluded.source_hash,
          source_active=true,last_seen_run_id=excluded.last_seen_run_id,source_inactivated_at=null,updated_at=now()`;

      await transaction.$executeRaw`
        update student_class_assignments a set source_active=false,source_inactivated_at=now(),updated_at=now()
         where a.source_active and not exists(
           select 1 from staging_students st join students s on s.source_student_no=st.source_student_no
            where st.sync_run_id=${runId} and st.included and s.id=a.student_id
              and st.source_unique_no=a.source_unique_no and st.class_registration_no=a.class_registration_no)`;
      await transaction.$executeRaw`
        update students s set source_active=false,source_inactivated_at=now(),updated_at=now()
         where s.source_active and not exists(
           select 1 from staging_students st where st.sync_run_id=${runId} and st.included
             and st.source_student_no=s.source_student_no)`;
      await transaction.$executeRaw`
        insert into student_history(student_id,sync_run_id,change_type,current_snapshot)
        select s.id,${runId},'CREATED',jsonb_build_object(
          'branchId',s.branch_id,'classResolutionStatus',s.class_resolution_status)
          from students s where s.first_seen_run_id=${runId}
        on conflict do nothing`;
      for (const branch of BRANCH_ORDER) {
        const branchRun = branchRuns.find((candidate) => candidate.sequenceNo === BRANCH_ORDER.indexOf(branch) + 1)!;
        const branchMutation = mutations[branch];
        const branchStatus = Object.values(branchMutation).every((value) => value === 0) ? "NO_CHANGES" : "PROMOTED";
        await transaction.syncBranchRun.update({ where: { id: branchRun.id }, data: {
          status: branchStatus,
          insertedCount: branchMutation.insertedStudentCount,
          updatedCount: branchMutation.updatedStudentCount,
          inactivatedCount: branchMutation.inactivatedStudentCount,
          finishedAt: new Date(),
        } });
      }
      await transaction.syncRun.update({ where: { id: runId }, data: {
        status, metrics, publishable: false, publishedAt: new Date(), finishedAt: new Date(),
      } });
      await transaction.syncAuditEvent.create({ data: {
        syncRunId: runId, eventType: "RUN_SUCCEEDED", actorSubject: run.initiated_by ?? "system:tong-sync",
        counts: JSON.parse(JSON.stringify({ ...snapshot.counts, ...totalMutation })) as Prisma.InputJsonValue,
        safeMetadata: { resultStatus: status },
      } });
    }, { timeout: 120_000, maxWait: 10_000 });
    return { status, metrics };
  }

  private async mutations(rows: readonly StagedSnapshotRow[], branchIds: ReadonlyMap<BranchCode, bigint>): Promise<Record<BranchCode, MutationCounts>> {
    const ids = [...branchIds.values()];
    const existing = await this.prisma.student.findMany({ where: { branchId: { in: ids } }, include: { assignments: true } });
    const byStudent = new Map(existing.map((student) => [student.sourceStudentNo, student]));
    const incomingStudents = rows.filter((row) => row.included && row.primarySelected);
    const incomingAssignments = rows.filter((row) => row.included);
    const allIncomingStudentNumbers = new Set(incomingStudents.map((row) => row.sourceStudentNo));
    const allIncomingAssignmentKeys = new Set(incomingAssignments.map((row) =>
      `${row.sourceStudentNo}\u0000${row.sourceUniqueNo}\u0000${row.classRegistrationNo}`));
    const result = Object.fromEntries(BRANCH_ORDER.map((branch) => [branch, this.zeroMutations()])) as Record<BranchCode, MutationCounts>;
    for (const branch of BRANCH_ORDER) {
      const branchId = branchIds.get(branch)!;
      const students = incomingStudents.filter((row) => row.branchCode === branch);
      const assignments = incomingAssignments.filter((row) => row.branchCode === branch);
      let insertedStudentCount = 0; let updatedStudentCount = 0;
      for (const row of students) {
        const current = byStudent.get(row.sourceStudentNo);
        if (current === undefined) insertedStudentCount += 1;
        else if (!current.sourceActive || current.branchId !== branchId || !Buffer.from(current.sourceHash).equals(row.rowHash)) updatedStudentCount += 1;
      }
      const inactivatedStudentCount = existing.filter((student) => student.branchId === branchId && student.sourceActive
        && !allIncomingStudentNumbers.has(student.sourceStudentNo)).length;
      let insertedAssignmentCount = 0; let updatedAssignmentCount = 0;
      for (const row of assignments) {
        const currentStudent = byStudent.get(row.sourceStudentNo);
        const current = currentStudent?.assignments.find((assignment) => assignment.sourceUniqueNo === row.sourceUniqueNo
          && assignment.classRegistrationNo === row.classRegistrationNo);
        if (current === undefined) insertedAssignmentCount += 1;
        else if (!current.sourceActive || !Buffer.from(current.sourceHash).equals(row.rowHash)) updatedAssignmentCount += 1;
      }
      const inactivatedAssignmentCount = existing.filter((student) => student.branchId === branchId).flatMap((student) => student.assignments
        .filter((assignment) => assignment.sourceActive && !allIncomingAssignmentKeys.has(
          `${student.sourceStudentNo}\u0000${assignment.sourceUniqueNo}\u0000${assignment.classRegistrationNo}`,
        ))).length;
      result[branch] = { insertedStudentCount, updatedStudentCount, inactivatedStudentCount,
        insertedAssignmentCount, updatedAssignmentCount, inactivatedAssignmentCount };
    }
    return result;
  }

  private sumMutations(values: readonly MutationCounts[]): MutationCounts {
    return values.reduce((total, value) => ({
      insertedStudentCount: total.insertedStudentCount + value.insertedStudentCount,
      updatedStudentCount: total.updatedStudentCount + value.updatedStudentCount,
      inactivatedStudentCount: total.inactivatedStudentCount + value.inactivatedStudentCount,
      insertedAssignmentCount: total.insertedAssignmentCount + value.insertedAssignmentCount,
      updatedAssignmentCount: total.updatedAssignmentCount + value.updatedAssignmentCount,
      inactivatedAssignmentCount: total.inactivatedAssignmentCount + value.inactivatedAssignmentCount,
    }), this.zeroMutations());
  }
  private zeroMutations(): MutationCounts { return { insertedStudentCount: 0, updatedStudentCount: 0, inactivatedStudentCount: 0,
    insertedAssignmentCount: 0, updatedAssignmentCount: 0, inactivatedAssignmentCount: 0 }; }
  private stagingHash(rows: ReadonlyArray<{ sourceOrdinal: number; rowHash: Buffer; included: boolean; primarySelected: boolean }>): Buffer {
    const hash = createHash("sha256");
    for (const row of rows) hash.update(`${row.sourceOrdinal}\u0000${row.rowHash.toString("base64url")}\u0000${Number(row.included)}\u0000${Number(row.primarySelected)}\n`);
    return hash.digest();
  }
  private fail(code: string): never { throw new DomainError(409, code, "The validated student snapshot could not be promoted."); }
}
