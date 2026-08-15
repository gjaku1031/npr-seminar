import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHEET_SCHEMA_FINGERPRINT,
  SHEET_SCHEMA_VERSION,
} from "../../src/modules/google-sheets/google-sheets.gateway.js";

const apiDirectory = resolve(import.meta.dirname, "../..");

describe("SheetMapping schema version", () => {
  it("keeps the Prisma default aligned with the canonical v4 runtime and latest class-column migration", () => {
    const prismaSchema = readFileSync(resolve(apiDirectory, "prisma/schema.prisma"), "utf8");
    const sheetMappingModel = prismaSchema.match(/model SheetMapping \{[\s\S]*?\n\}/u)?.[0];
    const v4Migration = readFileSync(resolve(
      apiDirectory,
      "prisma/migrations/20260718080000_google_sheets_family_projection_v4/migration.sql",
    ), "utf8");
    const classColumnsMigration = readFileSync(resolve(
      apiDirectory,
      "prisma/migrations/20260719014000_google_sheets_class_columns_v4/migration.sql",
    ), "utf8");
    const releaseDeployScript = readFileSync(resolve(
      apiDirectory,
      "../../ops/pve-release/deploy-nest-release.sh",
    ), "utf8");
    const releaseResetScript = readFileSync(resolve(
      apiDirectory,
      "../../ops/pve-release/google-sheets-reset-development-data.sh",
    ), "utf8");

    expect(SHEET_SCHEMA_VERSION).toBe(4);
    expect(SHEET_SCHEMA_FINGERPRINT).toBe(
      "a89087d355e8b9e1cd1039fabc1fa715d8473ebf08ed55f164a844f437b789be",
    );
    expect(sheetMappingModel).toMatch(
      /schemaVersion\s+Int\s+@default\(4\)\s+@map\("schema_version"\)/u,
    );
    expect(v4Migration).toMatch(/alter column schema_version set default 4/u);
    expect(classColumnsMigration).toContain(
      "schema_fingerprint='a89087d355e8b9e1cd1039fabc1fa715d8473ebf08ed55f164a844f437b789be'",
    );
    expect(releaseDeployScript).toContain(
      "readonly sheets_v4_fingerprint=a89087d355e8b9e1cd1039fabc1fa715d8473ebf08ed55f164a844f437b789be",
    );
    expect(releaseResetScript).toContain(
      "readonly sheets_v4_fingerprint=a89087d355e8b9e1cd1039fabc1fa715d8473ebf08ed55f164a844f437b789be",
    );
    expect(classColumnsMigration).toMatch(/enabled=false/u);
    expect(classColumnsMigration).toMatch(/circuit_status='BLOCKED'/u);
    expect(classColumnsMigration).toMatch(
      /block_reason_code='GOOGLE_SHEETS_V4_CLASS_COLUMNS_PREPARE_REQUIRED'/u,
    );
    expect(v4Migration).toMatch(/alter column schema_version set default 4/u);
    expect(classColumnsMigration).not.toMatch(/(?:update|delete from|truncate)\s+sheet_(?:outbox|delivery_attempts)/iu);
  });
});
