import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * api 패키지 디렉터리
 */
const apiDirectory = resolve(import.meta.dirname, "../..");

// 설문 사진 계약 정리 마이그레이션
describe("survey photo contract cleanup migration", () => {
  // 자동 롤백 기간 동안 이전 열을 삭제하지 않고 유지
  it("keeps legacy columns during the automatic rollback window", () => {
    const migration = readFileSync(resolve(
      apiDirectory,
      "prisma/migrations/20260719010000_remove_survey_photo_metadata/migration.sql",
    ), "utf8");

    expect(migration).not.toMatch(/drop\s+column/iu);
  });
});
