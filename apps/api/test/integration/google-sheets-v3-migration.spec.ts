import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * api 패키지 디렉터리
 */
const apiDirectory = resolve(import.meta.dirname, "../..");

/**
 * v2 시트 구조 지문
 */
const V2_SHEET_SCHEMA_FINGERPRINT = "416dd80e01708970c9c5fb2293da9caab29bf4f009c1a959dcfff53ce08e6de4";

/**
 * v3 시트 구조 지문
 */
const V3_SHEET_SCHEMA_FINGERPRINT = "1428b95585de0ca4734d1fadab8ae141f6f7e8c2f371e4c6f3aad1ddece7751d";

/**
 * 검증 대상 v3 마이그레이션 SQL 경로
 */
const migrationPath = resolve(
  apiDirectory,
  "prisma/migrations/20260718040000_google_sheets_campus_v3/migration.sql",
);

/**
 * JSON 행 스냅샷
 */
type JsonRow = Record<string, unknown>;

/**
 * 매핑 행 전체 스냅샷과 행 버전
 */
async function snapshotMapping(client: Client, mappingId: string) {
  const result = await client.query<{ row_snapshot: JsonRow; row_version: string }>(`
    select to_jsonb(mapping) row_snapshot,
           mapping.xmin::text row_version
      from sheet_mappings mapping
     where id=$1
  `, [mappingId]);
  return result.rows[0]!;
}

/**
 * 매핑의 반영 대기열·시도 기록 스냅샷
 */
async function snapshotSheetHistory(client: Client, mappingId: string) {
  const outbox = await client.query<{ row_snapshot: JsonRow }>(`
    select to_jsonb(delivery) row_snapshot
      from sheet_outbox delivery
     where mapping_id=$1
     order by id
  `, [mappingId]);
  const attempts = await client.query<{ row_snapshot: JsonRow }>(`
    select to_jsonb(attempt) row_snapshot
      from sheet_attempts attempt
     where sheet_outbox_id in (
       select id from sheet_outbox where mapping_id=$1
     )
     order by id
  `, [mappingId]);
  return {
    outbox: outbox.rows.map((row) => row.row_snapshot),
    attempts: attempts.rows.map((row) => row.row_snapshot),
  };
}

/**
 * sheet_mappings.schema_version 기본값
 */
async function readSchemaVersionDefault(client: Client) {
  const result = await client.query<{ schema_version_default: number }>(`
    select pg_get_expr(attribute_default.adbin,attribute_default.adrelid)::integer schema_version_default
      from pg_attribute attribute
      join pg_attrdef attribute_default
        on attribute_default.adrelid=attribute.attrelid
       and attribute_default.adnum=attribute.attnum
     where attribute.attrelid='sheet_mappings'::regclass
       and attribute.attname='schema_version'
  `);
  return result.rows[0]!.schema_version_default;
}

// Google Sheets v3 추가 마이그레이션
describe("Google Sheets v3 additive migration", () => {
  // PostgreSQL 컨테이너
  let postgres: StartedTestContainer;

  // DB 클라이언트
  let client: Client;

  // 컨테이너 기동과 이전 마이그레이션까지 적용
  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_PASSWORD: "integration_only", POSTGRES_DB: "npr_sheet_v3_migration" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const databaseUrl = `postgresql://postgres:integration_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_sheet_v3_migration`;
    const bootstrapClient = new Client({ connectionString: databaseUrl });
    await bootstrapClient.connect();
    await bootstrapClient.query("create role npr_worker nologin");
    await bootstrapClient.end();
    execFileSync(resolve(apiDirectory, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
      cwd: apiDirectory,
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  });

  // 연결 종료와 컨테이너 정지
  afterAll(async () => {
    await client?.end();
    await postgres?.stop();
  });

  // v2 매핑을 한 번만 올리고 대기·재시도 반영과 시도 기록은 변경하지 않음
  it("upgrades v2 once without mutating pending/retry deliveries or attempts", async () => {
    const migration = readFileSync(migrationPath, "utf8");
    await client.query("alter table sheet_mappings alter column schema_version set default 2");
    expect(await readSchemaVersionDefault(client)).toBe(2);

    const sessionId = randomUUID();
    const mapping = await client.query<{ id: string }>(`
      insert into sheet_mappings(
        seminar_session_public_id,spreadsheet_id,reservation_sheet_title,reservation_sheet_id,
        schema_fingerprint,schema_version,enabled,circuit_status,block_reason_code,last_validated_at,
        dispatch_lease_owner,dispatch_lease_expires_at,last_dispatch_at,updated_at
      ) values (
        $1,$2,'이전 예약 탭',91,$3,2,true,'CLOSED',null,'2026-07-18 01:00:00+00',
        $4,'2026-07-18 02:00:00+00','2026-07-18 00:30:00+00','2000-01-01 00:00:00+00'
      )
      returning id::text
    `, [sessionId, `migration-${randomUUID()}`, V2_SHEET_SCHEMA_FINGERPRINT, randomUUID()]);
    const mappingId = mapping.rows[0]!.id;

    const exactMapping = await client.query<{ id: string }>(`
      insert into sheet_mappings(
        seminar_session_public_id,spreadsheet_id,reservation_sheet_title,reservation_sheet_id,
        schema_fingerprint,schema_version,enabled,circuit_status,block_reason_code,last_validated_at,
        dispatch_lease_owner,dispatch_lease_expires_at,last_dispatch_at,updated_at
      ) values (
        $1,$2,'예약명단',1777564107,$3,3,true,'CLOSED',null,'2026-07-18 01:00:00+00',
        $4,'2026-07-18 02:00:00+00','2026-07-18 00:30:00+00','2001-01-01 00:00:00+00'
      )
      returning id::text
    `, [randomUUID(), `exact-${randomUUID()}`, V3_SHEET_SCHEMA_FINGERPRINT, randomUUID()]);
    const exactMappingId = exactMapping.rows[0]!.id;
    const exactMappingBefore = await snapshotMapping(client, exactMappingId);

    const pendingCiphertext = randomBytes(37);
    await client.query(`
      insert into sheet_outbox(
        mapping_id,event_id,event_type,seminar_session_public_id,family_booking_public_id,
        family_booking_student_public_id,student_public_id,booking_version,snapshot_ciphertext,
        status,attempt_count,next_attempt_at,last_error_code,created_at,updated_at
      ) values (
        $1,$2,'CREATED',$3,$4,$5,$6,1,$7,
        'PENDING',0,'2026-07-18 03:00:00+00',null,'2026-07-18 00:00:00+00','2026-07-18 00:00:00+00'
      )
    `, [mappingId, randomUUID(), sessionId, randomUUID(), randomUUID(), randomUUID(), pendingCiphertext]);

    const retryCiphertext = randomBytes(53);
    const retryDelivery = await client.query<{ id: string }>(`
      insert into sheet_outbox(
        mapping_id,event_id,event_type,seminar_session_public_id,family_booking_public_id,
        family_booking_student_public_id,student_public_id,booking_version,snapshot_ciphertext,
        status,attempt_count,next_attempt_at,last_error_code,created_at,updated_at
      ) values (
        $1,$2,'CHECKED_IN',$3,$4,$5,$6,4,$7,
        'RETRY',2,'2026-07-18 04:00:00+00','GOOGLE_TEMPORARY_UNAVAILABLE',
        '2026-07-18 00:10:00+00','2026-07-18 00:20:00+00'
      )
      returning id::text
    `, [mappingId, randomUUID(), sessionId, randomUUID(), randomUUID(), randomUUID(), retryCiphertext]);
    const retryDeliveryId = retryDelivery.rows[0]!.id;
    await client.query(`
      insert into sheet_attempts(
        event_id,sheet_outbox_id,attempt_no,result,error_code,safe_metadata,occurred_at
      ) values
        ($1,$3,1,'RETRY','GOOGLE_RATE_LIMIT','{"httpStatus":429,"phase":"first"}'::jsonb,'2026-07-18 00:11:00+00'),
        ($2,$3,2,'RETRY','GOOGLE_TEMPORARY_UNAVAILABLE','{"httpStatus":503,"phase":"second"}'::jsonb,'2026-07-18 00:19:00+00')
    `, [randomUUID(), randomUUID(), retryDeliveryId]);

    const historyBefore = await snapshotSheetHistory(client, mappingId);
    expect(historyBefore.outbox.map((row) => row.status)).toEqual(["PENDING", "RETRY"]);
    expect(historyBefore.outbox.map((row) => row.snapshot_ciphertext)).toEqual([
      `\\x${pendingCiphertext.toString("hex")}`,
      `\\x${retryCiphertext.toString("hex")}`,
    ]);
    expect(historyBefore.attempts.map((row) => row.result)).toEqual(["RETRY", "RETRY"]);

    await client.query(migration);

    const upgraded = await client.query<{
      schema_fingerprint: string;
      schema_version: number;
      enabled: boolean;
      circuit_status: string;
      block_reason_code: string;
      last_validated_at: Date | null;
      dispatch_lease_owner: string | null;
      dispatch_lease_expires_at: Date | null;
      reservation_sheet_title: string;
      reservation_sheet_id: number;
      updated_at_refreshed: boolean;
    }>(`
      select schema_fingerprint,schema_version,enabled,circuit_status,block_reason_code,
             last_validated_at,dispatch_lease_owner,dispatch_lease_expires_at,
             reservation_sheet_title,reservation_sheet_id,
             updated_at>'2000-01-01 00:00:00+00' updated_at_refreshed
        from sheet_mappings
       where id=$1
    `, [mappingId]);
    expect(upgraded.rows[0]).toEqual({
      schema_fingerprint: V3_SHEET_SCHEMA_FINGERPRINT,
      schema_version: 3,
      enabled: false,
      circuit_status: "BLOCKED",
      block_reason_code: "GOOGLE_SHEETS_V3_PREPARE_REQUIRED",
      last_validated_at: null,
      dispatch_lease_owner: null,
      dispatch_lease_expires_at: null,
      reservation_sheet_title: "예약명단",
      reservation_sheet_id: 1777564107,
      updated_at_refreshed: true,
    });
    expect(await readSchemaVersionDefault(client)).toBe(3);
    expect(await snapshotSheetHistory(client, mappingId)).toEqual(historyBefore);
    expect(await snapshotMapping(client, exactMappingId)).toEqual(exactMappingBefore);

    const upgradedAfterFirstRun = await snapshotMapping(client, mappingId);
    await client.query(migration);

    expect(await readSchemaVersionDefault(client)).toBe(3);
    expect(await snapshotMapping(client, mappingId)).toEqual(upgradedAfterFirstRun);
    expect(await snapshotMapping(client, exactMappingId)).toEqual(exactMappingBefore);
    expect(await snapshotSheetHistory(client, mappingId)).toEqual(historyBefore);
  });
});
