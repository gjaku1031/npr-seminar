import assert from "node:assert/strict";
import { test } from "node:test";

import { BRAND_NAME, BRAND_SEMINAR, BRAND_LOGO_SRC, brandHomeLabel } from "./brand";

// BrandMark 접근성·구조 계약 — 실제 로고 자산과 접근성 라벨의 단일 출처(brand.ts)를 잠근다.
test("brand mark points at the preserved source logo (not a recreated asset)", () => {
  assert.equal(BRAND_LOGO_SRC, "/brand/academy-logo-source.jpg");
});

test("brand name/seminar copy are the Korean brand strings", () => {
  assert.equal(BRAND_NAME, "예시학원");
  assert.equal(BRAND_SEMINAR, "입시설명회");
});

test("brandHomeLabel is the accessible name for the logo=home link", () => {
  assert.equal(brandHomeLabel(), "예시학원 입시설명회 홈");
  // 인접 '입시설명회' 문구를 접근성 이름에 보존한다.
  assert.ok(brandHomeLabel().includes(BRAND_SEMINAR));
  assert.ok(brandHomeLabel().startsWith(BRAND_NAME));
});
