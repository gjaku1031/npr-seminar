/**
 * 과학반 팝오버 배치 규칙 테스트 (node:test + tsx). 순수 함수라 DOM 없이 검증한다.
 * 핵심 회귀: 좁은 표 칸에 얹혀도 팝오버 폭은 트리거 폭과 무관하게 고정 가독 폭이라
 * 한 글자로 무너져 세로 글자 기둥이 되지 않는다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeSciencePopupPosition,
  SCIENCE_POPUP_MARGIN,
  SCIENCE_POPUP_MIN_WIDTH,
  SCIENCE_POPUP_WIDTH,
} from "./science-popup-position";

const viewport = { width: 1280, height: 800 };

test("좁은 트리거 셀이어도 폭은 트리거와 무관한 고정 가독 폭이라 한 글자로 무너지지 않는다", () => {
  // 트리거가 약 한 글자(24px) 폭이어도 팝오버는 넉넉한 폭을 갖는다 — 세로 글자 기둥 방지.
  const anchor = { left: 600, right: 624, top: 300, bottom: 320 };
  const pos = computeSciencePopupPosition(anchor, viewport, 120);
  assert.equal(pos.width, SCIENCE_POPUP_WIDTH);
  assert.ok(pos.width >= SCIENCE_POPUP_MIN_WIDTH);
  assert.equal(pos.placement, "below");
});

test("우측 정렬 — 팝오버 오른쪽이 트리거 오른쪽에 맞는다", () => {
  const anchor = { left: 600, right: 624, top: 300, bottom: 320 };
  const pos = computeSciencePopupPosition(anchor, viewport, 120);
  assert.equal(pos.left, 624 - SCIENCE_POPUP_WIDTH);
});

test("오른쪽 가장자리 충돌 — 화면 밖으로 넘치지 않게 여백 안으로 clamp 한다", () => {
  // 트리거가 화면 오른쪽 끝이라 우측 정렬 그대로면 넘칠 수 있다.
  const anchor = { left: 1252, right: 1276, top: 300, bottom: 320 };
  const pos = computeSciencePopupPosition(anchor, viewport, 120);
  assert.ok(pos.left >= SCIENCE_POPUP_MARGIN);
  assert.ok(pos.left + pos.width <= viewport.width - SCIENCE_POPUP_MARGIN);
});

test("왼쪽 가장자리 충돌 — 트리거가 화면 왼쪽 끝이어도 최소 여백을 지킨다", () => {
  const anchor = { left: 4, right: 28, top: 300, bottom: 320 };
  const pos = computeSciencePopupPosition(anchor, viewport, 120);
  assert.ok(pos.left >= SCIENCE_POPUP_MARGIN);
  assert.ok(pos.left + pos.width <= viewport.width - SCIENCE_POPUP_MARGIN);
});

test("아래 공간이 충분하면 아래로 열고 top 은 트리거 바로 아래다", () => {
  const anchor = { left: 600, right: 624, top: 100, bottom: 120 };
  const pos = computeSciencePopupPosition(anchor, viewport, 120);
  assert.equal(pos.placement, "below");
  assert.ok(pos.top > anchor.bottom);
});

test("아래 공간이 부족하고 위가 넓으면 위로 뒤집고 top 은 여백 안에 든다", () => {
  // 트리거가 화면 하단이라 아래로 열 자리가 없다.
  const anchor = { left: 600, right: 624, top: 740, bottom: 780 };
  const pos = computeSciencePopupPosition(anchor, viewport, 400);
  assert.equal(pos.placement, "above");
  assert.ok(pos.top < anchor.top);
  assert.ok(pos.top >= SCIENCE_POPUP_MARGIN);
});

test("긴 목록은 남는 공간에 맞춰 최대 높이를 잘라 내부 스크롤에 맡긴다", () => {
  const anchor = { left: 600, right: 624, top: 100, bottom: 120 };
  const pos = computeSciencePopupPosition(anchor, viewport, 5000);
  // 아래 공간(800 - 120 - gap - margin)보다 커질 수 없다.
  assert.ok(pos.maxHeight <= viewport.height - anchor.bottom);
  assert.ok(pos.maxHeight > 0);
});

test("좁은 뷰포트에서도 좌우 여백을 남기고 화면을 넘지 않는다", () => {
  const narrow = { width: 200, height: 800 };
  const anchor = { left: 90, right: 114, top: 300, bottom: 320 };
  const pos = computeSciencePopupPosition(anchor, narrow, 120);
  assert.ok(pos.left >= SCIENCE_POPUP_MARGIN);
  assert.ok(pos.left + pos.width <= narrow.width - SCIENCE_POPUP_MARGIN);
});
