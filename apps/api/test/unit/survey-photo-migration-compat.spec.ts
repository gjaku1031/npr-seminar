import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const apiDirectory = resolve(import.meta.dirname, "../..");

describe("survey photo contract cleanup migration", () => {
  it("keeps legacy columns during the automatic rollback window", () => {
    const migration = readFileSync(resolve(
      apiDirectory,
      "prisma/migrations/20260719010000_remove_survey_photo_metadata/migration.sql",
    ), "utf8");

    expect(migration).not.toMatch(/drop\s+column/iu);
  });
});
