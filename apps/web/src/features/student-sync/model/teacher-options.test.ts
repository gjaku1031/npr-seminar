// 담임 필터 선택지 구성 테스트. 서버 facet 기준, 선택 값 보존, 한글 정렬

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildTeacherOptions } from "./teacher-options";

test("서버 facet 담임은 페이지가 무관한 10명뿐이어도 전부 남는다", () => {
  // 전체 담임 facet — 페이지 items 와 독립. 헬퍼는 행을 받지 않으므로 애초에 볼 수 없음
  const facets = ["김담임", "박담임", "이담임", "정담임", "최담임"];
  const options = buildTeacherOptions(facets, "");
  assert.deepEqual(options, ["김담임", "박담임", "이담임", "정담임", "최담임"]);
});

test("facet 에 이미 있는 선택 담임은 중복되지 않는다", () => {
  const facets = ["김담임", "박담임", "이담임"];
  const options = buildTeacherOptions(facets, "박담임");
  assert.deepEqual(options, ["김담임", "박담임", "이담임"]);
  assert.equal(options.filter((t) => t === "박담임").length, 1);
});

test("facet 에 없는 선택 담임은 딱 한 번 끼워지고 한글 정렬을 유지한다", () => {
  const facets = ["김담임", "이담임"];
  const options = buildTeacherOptions(facets, "박담임");
  assert.deepEqual(options, ["김담임", "박담임", "이담임"]);
});

test("빈 선택은 아무것도 더하지 않고 서버 배열을 변형하지 않는다", () => {
  const facets = ["박담임", "김담임"];
  const options = buildTeacherOptions(facets, "");
  assert.deepEqual(options, ["김담임", "박담임"]);
  assert.deepEqual(facets, ["박담임", "김담임"]);
});
