/**
 * 포털 모드 Select 메뉴 배치 계산 — 순수 함수(테스트 대상). 트리거 버튼의 뷰포트 좌표(anchor)와
 * 뷰포트 크기, 내용 높이 추정치를 받아 `position: fixed` 드롭다운의 좌표·폭·최대높이·상하
 * 배치를 낸다. DOM 을 만지지 않으므로 노드 테스트에서 그대로 검증할 수 있다.
 *
 * 왜 필요한가: 학생 현황 필터 카드는 `overflow:hidden`, 각 필터 줄은 `overflowX:auto`라
 * 기본 Select 의 절대배치 메뉴가 조상에서 잘려 '담임 전체' 버튼을 눌러도 목록이 안 보였다.
 * body 로 포털해 fixed 로 띄우면 어떤 조상 overflow 도 자르지 못한다. 좌표·상하 뒤집기·
 * 가장자리 clamp 를 여기서 순수하게 계산한다.
 *
 * 규칙:
 * - 폭은 트리거 폭 이상(최소 가독 폭 보장)을 쓰되, 뷰포트가 좁으면 좌우 여백만큼 줄인다.
 * - 가로는 트리거 왼쪽에 메뉴 왼쪽을 맞추고(좌측 정렬) 화면 좌우 여백 안으로 clamp 한다.
 * - 세로는 기본 아래. 아래가 모자라고 위가 더 넓으면 위로 뒤집고, 남는 공간에 맞춰 최대
 *   높이를 잘라 내부 스크롤로 넘긴다(646px 처럼 낮은 화면에서도 화면을 넘지 않는다).
 */

export interface SelectAnchorRect {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

export interface SelectViewport {
  width: number;
  height: number;
}

export type SelectMenuPlacement = "below" | "above";

export interface SelectMenuPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: SelectMenuPlacement;
}

/** 뷰포트 가장자리 최소 여백(8–12px 범위 안). */
export const SELECT_MENU_MARGIN = 10;
/** 트리거와 메뉴 사이 틈. */
const SELECT_MENU_GAP = 6;
/** 하한 폭 — 트리거가 더 좁아도 (자리가 있는 한) 이 아래로는 내려가지 않는다. */
export const SELECT_MENU_MIN_WIDTH = 132;
/** 상한 높이 — 기본 Select 메뉴와 같은 값. 남는 공간이 더 좁으면 그쪽에 맞춘다. */
const SELECT_MENU_MAX_HEIGHT = 280;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeSelectMenuPosition(
  anchor: SelectAnchorRect,
  viewport: SelectViewport,
  contentHeight: number,
  options: { minWidth?: number; margin?: number; gap?: number; maxHeight?: number } = {},
): SelectMenuPosition {
  const margin = options.margin ?? SELECT_MENU_MARGIN;
  const gap = options.gap ?? SELECT_MENU_GAP;
  const minWidth = options.minWidth ?? SELECT_MENU_MIN_WIDTH;
  const maxHeightCap = options.maxHeight ?? SELECT_MENU_MAX_HEIGHT;

  // 트리거 폭 이상(최소 가독 폭 보장)을 쓰되, 좌우 여백을 뺀 폭을 넘지 않는다.
  const roomForWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(Math.max(anchor.width, minWidth), roomForWidth);

  // 가로: 좌측 정렬(트리거 왼쪽 = 메뉴 왼쪽) 후 화면 안으로 clamp — 어느 가장자리도 넘지 않는다.
  const minLeft = margin;
  const maxLeft = Math.max(minLeft, viewport.width - margin - width);
  const left = clamp(anchor.left, minLeft, maxLeft);

  // 세로: 아래가 기본. 원하는 높이가 아래 공간을 넘고 위가 더 넓으면 위로 뒤집는다.
  const desired = Math.min(contentHeight, maxHeightCap);
  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const placement: SelectMenuPlacement = desired > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";
  const available = Math.max(0, placement === "above" ? spaceAbove : spaceBelow);
  const maxHeight = Math.max(0, Math.min(desired, available));
  const top = placement === "above" ? anchor.top - gap - maxHeight : anchor.bottom + gap;

  return { left, top, width, maxHeight, placement };
}
