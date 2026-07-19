import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const apiDirectory = resolve(import.meta.dirname, "../..");
const V2_SHEET_SCHEMA_FINGERPRINT = "416dd80e01708970c9c5fb2293da9caab29bf4f009c1a959dcfff53ce08e6de4";
const migrationPath = resolve(
  apiDirectory,
  "prisma/migrations/20260718010000_google_sheets_roster_v2/migration.sql",
);

describe("Google Sheets v2 additive migration", () => {
  let postgres: StartedTestContainer;
  let client: Client;

  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_PASSWORD: "integration_only", POSTGRES_DB: "npr_sheet_migration" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const databaseUrl = `postgresql://postgres:integration_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_sheet_migration`;
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

  afterAll(async () => {
    await client?.end();
    await postgres?.stop();
  });

  it("upgrades the mapping while preserving two CREATED and two CHECKED_IN pending deliveries", async () => {
    const sessionId = randomUUID();
    const mapping = await client.query<{ id: string }>(`
      insert into sheet_mappings(
        seminar_session_public_id,spreadsheet_id,schema_fingerprint,schema_version,
        enabled,circuit_status,block_reason_code,last_validated_at
      ) values ($1,$2,$3,1,true,'CLOSED',null,now())
      returning id::text
    `, [sessionId, `migration-${randomUUID()}`, "legacy-v1-fingerprint"]);
    const mappingId = mapping.rows[0]!.id;
    const eventTypes = ["CREATED", "CREATED", "CHECKED_IN", "CHECKED_IN"] as const;
    for (const eventType of eventTypes) {
      await client.query(`
        insert into sheet_outbox(
          mapping_id,event_id,event_type,seminar_session_public_id,family_booking_public_id,
          family_booking_student_public_id,student_public_id,booking_version,snapshot_ciphertext
        ) values ($1,$2,$3,$4,$5,$6,$7,1,$8)
      `, [
        mappingId,
        randomUUID(),
        eventType,
        sessionId,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomBytes(32),
      ]);
    }
    const before = await client.query<{ id: string; event_type: string; status: string }>(`
      select id::text,event_type,status from sheet_outbox where mapping_id=$1 order by id
    `, [mappingId]);

    await client.query(readFileSync(migrationPath, "utf8"));

    const upgraded = await client.query<{
      schema_fingerprint: string;
      schema_version: number;
      enabled: boolean;
      circuit_status: string;
      block_reason_code: string;
      reservation_sheet_title: string;
      reservation_sheet_id: number;
    }>(`
      select schema_fingerprint,schema_version,enabled,circuit_status,block_reason_code,
             reservation_sheet_title,reservation_sheet_id
        from sheet_mappings where id=$1
    `, [mappingId]);
    expect(upgraded.rows[0]).toEqual({
      schema_fingerprint: V2_SHEET_SCHEMA_FINGERPRINT,
      schema_version: 2,
      enabled: false,
      circuit_status: "BLOCKED",
      block_reason_code: "GOOGLE_SHEETS_V2_PREPARE_REQUIRED",
      reservation_sheet_title: "예약명단",
      reservation_sheet_id: 1777564107,
    });
    const after = await client.query<{ id: string; event_type: string; status: string }>(`
      select id::text,event_type,status from sheet_outbox where mapping_id=$1 order by id
    `, [mappingId]);
    expect(after.rows).toEqual(before.rows);
    expect(after.rows.map((row) => row.event_type)).toEqual(eventTypes);
    expect(after.rows.every((row) => row.status === "PENDING")).toBe(true);
  });

  it("grants the isolated worker only the domain reads required by the current Sheet projection", async () => {
    const privileges = await client.query<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
    }>(`
      select table_name,
             has_table_privilege('npr_worker', format('public.%I',table_name), 'SELECT') can_select,
             has_table_privilege('npr_worker', format('public.%I',table_name), 'INSERT') can_insert,
             has_table_privilege('npr_worker', format('public.%I',table_name), 'UPDATE') can_update,
             has_table_privilege('npr_worker', format('public.%I',table_name), 'DELETE') can_delete
        from unnest(array[
          'family_bookings','family_booking_students','students','student_class_assignments',
          'booking_events','seminar_sessions','admin_users','student_history'
        ]) as inspected(table_name)
       order by table_name
    `);
    expect(privileges.rows).toEqual([
      { table_name: "admin_users", can_select: false, can_insert: false, can_update: false, can_delete: false },
      { table_name: "booking_events", can_select: true, can_insert: false, can_update: false, can_delete: false },
      { table_name: "family_booking_students", can_select: true, can_insert: false, can_update: false, can_delete: false },
      { table_name: "family_bookings", can_select: true, can_insert: false, can_update: false, can_delete: false },
      { table_name: "seminar_sessions", can_select: true, can_insert: false, can_update: false, can_delete: false },
      { table_name: "student_class_assignments", can_select: true, can_insert: false, can_update: false, can_delete: false },
      { table_name: "student_history", can_select: false, can_insert: false, can_update: false, can_delete: false },
      { table_name: "students", can_select: true, can_insert: false, can_update: false, can_delete: false },
    ]);
  });
});
