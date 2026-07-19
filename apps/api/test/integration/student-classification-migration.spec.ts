import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const apiDirectory = resolve(import.meta.dirname, "../..");
const migrationPath = resolve(
  apiDirectory,
  "prisma/migrations/20260718021000_student_schedule_suffix_classes/migration.sql",
);

describe("student timetable-suffix classification migration", () => {
  let postgres: StartedTestContainer;
  let client: Client;

  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18-alpine")
      .withEnvironment({ POSTGRES_PASSWORD: "integration_only", POSTGRES_DB: "npr_student_classification" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    const databaseUrl = `postgresql://postgres:integration_only@${postgres.getHost()}:${postgres.getMappedPort(5432)}/npr_student_classification`;
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

  it("is replay-safe and attaches the relaxed fail-closed constraint", async () => {
    const migration = readFileSync(migrationPath, "utf8");
    await client.query(migration);
    await client.query(migration);
    const constraint = await client.query<{ definition: string; validated: boolean }>(`
      select pg_get_constraintdef(oid) definition,convalidated validated
        from pg_constraint
       where conrelid='student_class_assignments'::regclass
         and conname='student_assignments_class_check'
    `);
    expect(constraint.rows).toEqual([{
      definition: "CHECK (npr_is_allowed_student_assignment_class((class_name)::text))",
      validated: true,
    }]);
  });

  it("accepts only a bracketless class or one exact trailing timetable suffix", async () => {
    const values = [
      "3T3A", "과1특A[토3]", "과고1가람[일4]", "고1수학[월토1]", "고1수학[월수]", "고1수학[월수금1]",
      "고1영재[E3]", "고1영재[e3]", "고1영재［Ｅ３］", " 과학 ［토3］ ", "기하[일1]",
      "[26특-과]과1A", "과학[연장]", "과학[토3][일4]", "과학[토3]보강", "과학[토3", "과학토3]", "과학*[토3]",
      "과학[월월]", "과학[일00]", "과학[일01]", "과학[Z99]",
    ];
    const result = await client.query<{ value: string; allowed: boolean; representative: boolean }>(`
      select value,
             npr_is_allowed_student_assignment_class(value) allowed,
             npr_is_representative_student_class(value) representative
        from unnest($1::text[]) value
    `, [values]);
    expect(result.rows).toEqual([
      { value: "3T3A", allowed: true, representative: true },
      { value: "과1특A[토3]", allowed: true, representative: true },
      { value: "과고1가람[일4]", allowed: true, representative: true },
      { value: "고1수학[월토1]", allowed: true, representative: true },
      { value: "고1수학[월수]", allowed: true, representative: true },
      { value: "고1수학[월수금1]", allowed: true, representative: true },
      { value: "고1영재[E3]", allowed: true, representative: true },
      { value: "고1영재[e3]", allowed: true, representative: true },
      { value: "고1영재［Ｅ３］", allowed: true, representative: true },
      { value: " 과학 ［토3］ ", allowed: true, representative: true },
      { value: "기하[일1]", allowed: true, representative: false },
      { value: "[26특-과]과1A", allowed: false, representative: false },
      { value: "과학[연장]", allowed: false, representative: false },
      { value: "과학[토3][일4]", allowed: false, representative: false },
      { value: "과학[토3]보강", allowed: false, representative: false },
      { value: "과학[토3", allowed: false, representative: false },
      { value: "과학토3]", allowed: false, representative: false },
      { value: "과학*[토3]", allowed: false, representative: false },
      { value: "과학[월월]", allowed: false, representative: false },
      { value: "과학[일00]", allowed: false, representative: false },
      { value: "과학[일01]", allowed: false, representative: false },
      { value: "과학[Z99]", allowed: false, representative: false },
    ]);
  });

  it("uses the suffix-stripped base for canonical and representative classification", async () => {
    const result = await client.query<{
      value: string;
      base_class: string;
      unit_name: string | null;
      representative: boolean;
    }>(`
      select value,
             npr_student_class_base(value) base_class,
             npr_canonical_unit_name(value) unit_name,
             npr_is_representative_student_class(value) representative
        from unnest($1::text[]) value
    `, [["과1특A[토3]", "과고1가람[일4]", " 과학 ［토3］ ", "기하[일1]"]]);
    expect(result.rows).toEqual([
      { value: "과1특A[토3]", base_class: "과1특A", unit_name: "과학", representative: true },
      { value: "과고1가람[일4]", base_class: "과고1가람", unit_name: "과학", representative: true },
      { value: " 과학 ［토3］ ", base_class: "과학", unit_name: "과학", representative: true },
      { value: "기하[일1]", base_class: "기하", unit_name: null, representative: false },
    ]);
  });
});
