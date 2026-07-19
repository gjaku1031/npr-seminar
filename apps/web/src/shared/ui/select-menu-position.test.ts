/**
 * 포털 모드 Select 메뉴 배치 규칙 테스트 (node:test + tsx). 순수 함수라 DOM 없이 검증한다.
 * 핵심 회귀: 조상 overflow 에 잘리지 않도록 fixed 로 띄우되, 좌표·폭·상하 뒤집기·가장자리
 * clamp 가 화면을 넘지 않고 낮은 화면(646px)에서도 남는 공간에 맞춰 스크롤로 넘긴다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeSelectMenuPosition,
  SELECT_MENU_MARGIN,
  SELECT_MENU_MIN_WIDTH,
} from "./select-menu-position";

const viewport = { width: 1560, height: 646 };

test("좁은 트리거여도 폭은 트리거 이상이면서 최소 가독 폭을 지킨다", () => {
  const anchor = { left: 1200, top: 300, bottom: 346, width: 132 };
  const pos = computeSelectMenuPosition(anchor, viewport, 200);
  assert.ok(pos.width >= SELECT_MENU_MIN_WIDTH);
  assert.ok(pos.width >= anchor.width);
});

test("트리거보다 넓은 트리거는 그 폭을 따라간다", () => {
  const anchor = { left: 300, top: 300, bottom: 346, width: 340 };
  const pos = computeSelectMenuPosition(anchor, viewport, 200);
  assert.equal(pos.width, 340);
});

test("좌측 정렬 — 메뉴 왼쪽이 트리거 왼쪽에 맞는다", () => {
  const anchor = { left: 300, top: 300, bottom: 346, width: 132 };
  const pos = computeSelectMenuPosition(anchor, viewport, 200);
  assert.equal(pos.left, 300);
});

test("오른쪽 가장자리 충돌 — 화면 밖으로 넘치지 않게 여백 안으로 clamp 한다", () => {
  const anchor = { left: 1540, top: 300, bottom: 346, width: 132 };
  const pos = computeSelectMenuPosition(anchor, viewport, 200);
  assert.ok(pos.left >= SELECT_MENU_MARGIN);
  assert.ok(pos.left + pos.width <= viewport.width - SELECT_MENU_MARGIN);
});

test("왼쪽 가장자리 충돌 — 트리거가 화면 왼쪽 끝이어도 최소 여백을 지킨다", () => {
  const anchor = { left: 2, top: 300, bottom: 346, width: 132 };
  const pos = computeSelectMenuPosition(anchor, viewport, 200);
  assert.ok(pos.left >= SELECT_MENU_MARGIN);
});

test("아래 공간이 충분하면 아래로 열고 top 은 트리거 바로 아래다", () => {
  const anchor = { left: 300, top: 120, bottom: 166, width: 132 };
  const pos = computeSelectMenuPosition(anchor, viewport, 200);
  assert.equal(pos.placement, "below");
  assert.ok(pos.top > anchor.bottom);
});

test("아래 공간이 부족하고 위가 넓으면 위로 뒤집고 top 은 여백 안에 든다", () => {
  const anchor = { left: 300, top: 560, bottom: 606, width: 132 };
  const pos = computeSelectMenuPosition(anchor, viewport, 280);
  assert.equal(pos.placement, "above");
  assert.ok(pos.top < anchor.top);
  assert.ok(pos.top >= SELECT_MENU_MARGIN);
});

test("낮은 화면에서도 최대 높이는 남는 공간을 넘지 않고 스크롤로 넘긴다", () => {
  // 646px 화면 한가운데 트리거 — 긴 목록이어도 아래 공간에 맞춰 잘린다.
  const anchor = { left: 300, top: 300, bottom: 346, width: 132 };
  const pos = computeSelectMenuPosition(anchor, viewport, 5000);
  assert.ok(pos.maxHeight > 0);
  assert.ok(pos.top + pos.maxHeight <= viewport.height - SELECT_MENU_MARGIN + 0.5);
});
