/**
 * 과학반 `+N` 팝오버 배치 계산 — 순수 함수(테스트 대상). 트리거의 뷰포트 좌표(anchor)와
 * 뷰포트 크기, 내용 높이 추정치를 받아 `position: fixed` 팝오버의 좌표·폭·최대높이·상하
 * 배치를 낸다. DOM 을 만지지 않으므로 노드 테스트에서 그대로 검증할 수 있다.
 *
 * 규칙:
 * - 폭은 기본 가독 폭을 쓰되, 뷰포트가 좁으면 좌우 여백만큼 줄인다. **트리거 셀 폭과는
 *   무관하다** — 좁은 표 칸 안에서 shrink-to-fit 으로 한두 글자로 무너지던 버그를 막는 핵심이다.
 * - 가로는 트리거 오른쪽 끝에 팝오버 오른쪽을 맞추고(우측 정렬), 화면 좌우 여백 안으로 clamp
 *   해 오른쪽/왼쪽 가장자리 어디서도 넘치지 않게 한다.
 * - 세로는 기본 아래. 아래 공간이 모자라고 위가 더 넓으면 위로 뒤집고, 남는 공간에 맞춰
 *   최대 높이를 잘라 내부 스크롤로 넘긴다.
 */

export interface PopupAnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type PopupPlacement = "below" | "above";

export interface SciencePopupPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: PopupPlacement;
}

/** 기본 가독 폭 — 과학반 이름 한 줄이 편히 들어가는 폭. */
export const SCIENCE_POPUP_WIDTH = 248;
/** 하한 폭 — 뷰포트가 좁아도 이 아래로는 (자리가 있는 한) 내려가지 않는다. */
export const SCIENCE_POPUP_MIN_WIDTH = 176;
/** 뷰포트 가장자리 최소 여백. */
export const SCIENCE_POPUP_MARGIN = 12;
/** 트리거와 팝오버 사이 틈. */
export const SCIENCE_POPUP_GAP = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeSciencePopupPosition(
  anchor: PopupAnchorRect,
  viewport: Viewport,
  contentHeight: number,
  options: { width?: number; minWidth?: number; margin?: number; gap?: number } = {},
): SciencePopupPosition {
  const margin = options.margin ?? SCIENCE_POPUP_MARGIN;
  const gap = options.gap ?? SCIENCE_POPUP_GAP;
  const preferredWidth = options.width ?? SCIENCE_POPUP_WIDTH;
  const minWidth = options.minWidth ?? SCIENCE_POPUP_MIN_WIDTH;

  // 좌우 여백을 뺀 폭에 맞추되, 자리가 있으면 최소 가독 폭을 지킨다(한두 글자 붕괴 방지).
  const roomForWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.max(Math.min(preferredWidth, roomForWidth), Math.min(minWidth, roomForWidth));

  // 가로: 우측 정렬(트리거 오른쪽 = 팝오버 오른쪽) 후 화면 안으로 clamp.
  const minLeft = margin;
  const maxLeft = Math.max(minLeft, viewport.width - margin - width);
  const left = clamp(anchor.right - width, minLeft, maxLeft);

  // 세로: 아래가 기본, 아래가 부족하고 위가 더 넓으면 위로 뒤집는다.
  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const placement: PopupPlacement = contentHeight > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";
  const available = Math.max(0, placement === "above" ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(contentHeight, available);
  const top = placement === "above" ? anchor.top - gap - maxHeight : anchor.bottom + gap;

  return { left, top, width, maxHeight, placement };
}
