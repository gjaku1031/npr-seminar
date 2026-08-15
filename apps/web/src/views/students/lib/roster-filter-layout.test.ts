/**
 * 예약 명단 두 줄 필터 배치 계약 테스트 (node:test + tsx). 순수 상수/스타일이라 DOM 없이
 * 검증한다. 핵심 회귀: 1행 검색폭 = 2행 여백이어야 `캠퍼스`·`단위` 라벨이 같은 x 에 서고,
 * 각 줄은 스스로 가로 스크롤해 페이지 전체가 가로로 밀리지 않는다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ROSTER_FILTER_LABEL_STYLE,
  ROSTER_FILTER_LABEL_WIDTH,
  ROSTER_FILTER_ROW_STYLE,
  ROSTER_FILTER_SEARCH_WIDTH,
  ROSTER_FILTER_SPACER_WIDTH,
  ROSTER_FILTER_TAG_STYLE,
} from "./roster-filter-layout";

test("검색 입력 폭은 지시된 정확한 280px 다", () => {
  assert.equal(ROSTER_FILTER_SEARCH_WIDTH, 280);
});

test("2행 여백은 1행 검색폭과 같아 라벨이 같은 x 에서 시작한다", () => {
  assert.equal(ROSTER_FILTER_SPACER_WIDTH, ROSTER_FILTER_SEARCH_WIDTH);
});

test("라벨은 고정폭·비축소·줄바꿈 금지라 어떤 폭에서도 잘리지 않는다", () => {
  assert.equal(ROSTER_FILTER_LABEL_STYLE.width, ROSTER_FILTER_LABEL_WIDTH);
  assert.equal(ROSTER_FILTER_LABEL_STYLE.flexShrink, 0);
  assert.equal(ROSTER_FILTER_LABEL_STYLE.whiteSpace, "nowrap");
});

test("각 줄은 nowrap + 가로 스크롤이라 페이지가 아니라 그 줄만 스크롤한다", () => {
  assert.equal(ROSTER_FILTER_ROW_STYLE.flexWrap, "nowrap");
  assert.equal(ROSTER_FILTER_ROW_STYLE.overflowX, "auto");
  assert.equal(ROSTER_FILTER_ROW_STYLE.overflowY, "hidden");
  assert.equal(ROSTER_FILTER_ROW_STYLE.maxWidth, "100%");
});

test("필터 Tag 는 공용 Tag 보다 촘촘한 고정 높이를 쓴다", () => {
  assert.equal(ROSTER_FILTER_TAG_STYLE.height, 30);
});
