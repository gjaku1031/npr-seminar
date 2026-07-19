import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHEET_SCHEMA_FINGERPRINT,
  SHEET_SCHEMA_VERSION,
} from "../../src/modules/google-sheets/google-sheets.gateway.js";

const apiDirectory = resolve(import.meta.dirname, "../..");

describe("SheetMapping schema version", () => {
  it("keeps the Prisma default aligned with the canonical v4 runtime and migration", () => {
    const prismaSchema = readFileSync(resolve(apiDirectory, "prisma/schema.prisma"), "utf8");
    const sheetMappingModel = prismaSchema.match(/model SheetMapping \{[\s\S]*?\n\}/u)?.[0];
    const v4Migration = readFileSync(resolve(
      apiDirectory,
      "prisma/migrations/20260718080000_google_sheets_family_projection_v4/migration.sql",
    ), "utf8");

    expect(SHEET_SCHEMA_VERSION).toBe(4);
    expect(SHEET_SCHEMA_FINGERPRINT).toBe(
      "ffb044e3773f51b25797d9dd79fc507b42900f0d49a19f768daba1f86bc2e522",
    );
    expect(sheetMappingModel).toMatch(
      /schemaVersion\s+Int\s+@default\(4\)\s+@map\("schema_version"\)/u,
    );
    expect(v4Migration).toMatch(/alter column schema_version set default 4/u);
    expect(v4Migration).toContain(
      "schema_fingerprint='ffb044e3773f51b25797d9dd79fc507b42900f0d49a19f768daba1f86bc2e522'",
    );
    expect(v4Migration).toMatch(/enabled=false/u);
    expect(v4Migration).toMatch(/circuit_status='BLOCKED'/u);
    expect(v4Migration).toMatch(
      /block_reason_code='GOOGLE_SHEETS_V4_PREPARE_REQUIRED'/u,
    );
    expect(v4Migration).not.toMatch(/(?:update|delete from|truncate)\s+sheet_(?:outbox|delivery_attempts)/iu);
  });
});
