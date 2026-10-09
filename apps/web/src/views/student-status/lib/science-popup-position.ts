/**
 * 과학반 `+N` 팝오버 배치 계산 — 순수 함수(테스트 대상). 트리거의 뷰포트 좌표(anchor)와
 * 뷰포트 크기, 내용 높이 추정치를 받아 `position: fixed` 팝오버의 좌표·폭·최대높이·상하
 * 배치를 냄. DOM 을 만지지 않으므로 노드 테스트에서 그대로 검증할 수 있음
 *
 * 규칙:
 * - 폭은 기본 가독 폭을 쓰되, 뷰포트가 좁으면 좌우 여백만큼 줄임. 트리거 셀 폭과는
 *   무관함 — 좁은 표 칸 안에서 shrink-to-fit 으로 한두 글자로 무너지던 버그를 막는 핵심임
 * - 가로는 트리거 오른쪽 끝에 팝오버 오른쪽을 맞추고(우측 정렬), 화면 좌우 여백 안으로 clamp
 *   해 오른쪽/왼쪽 가장자리 어디서도 넘치지 않게 함
 * - 세로는 기본 아래. 아래 공간이 모자라고 위가 더 넓으면 위로 뒤집고, 남는 공간에 맞춰
 *   최대 높이를 잘라 내부 스크롤로 넘김
 */

export interface PopupAnchorRect {
  /**
   * 왼쪽
   */
  left: number;

  /**
   * 오른쪽
   */
  right: number;

  /**
   * 위쪽
   */
  top: number;

  /**
   * 아래쪽
   */
  bottom: number;
}

/**
 * 화면 크기
 */
export interface Viewport {
  /**
   * 너비
   */
  width: number;

  /**
   * 높이
   */
  height: number;
}

/**
 * 팝업이 기준 요소 아래·위 중 어디에 붙는지
 */
export type PopupPlacement = "below" | "above";

/**
 * 과학 반 팝업의 위치·크기
 */
export interface SciencePopupPosition {
  /**
   * 왼쪽 좌표
   */
  left: number;

  /**
   * 위쪽 좌표
   */
  top: number;

  /**
   * 너비
   */
  width: number;

  /**
   * 최대 높이
   */
  maxHeight: number;

  /**
   * 배치 방향
   */
  placement: PopupPlacement;
}

/**
 * 기본 가독 폭 — 과학반 이름 한 줄이 편히 들어가는 폭
 */
export const SCIENCE_POPUP_WIDTH = 248;
/**
 * 하한 폭 — 뷰포트가 좁아도 이 아래로는 (자리가 있는 한) 내려가지 않음
 */
export const SCIENCE_POPUP_MIN_WIDTH = 176;
/**
 * 뷰포트 가장자리 최소 여백
 */
export const SCIENCE_POPUP_MARGIN = 12;
/**
 * 트리거와 팝오버 사이 틈
 */
const SCIENCE_POPUP_GAP = 8;

/**
 * 값을 최소·최대 범위로 자름
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 기준 요소와 화면 크기로 팝업 위치 계산. 아래 공간이 부족하면 위로 붙임
 */
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

  // 좌우 여백을 뺀 폭에 맞추되, 자리가 있으면 최소 가독 폭을 지킴(한두 글자 붕괴 방지)
  const roomForWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.max(Math.min(preferredWidth, roomForWidth), Math.min(minWidth, roomForWidth));

  // 가로: 우측 정렬(트리거 오른쪽 = 팝오버 오른쪽) 후 화면 안으로 clamp
  const minLeft = margin;
  const maxLeft = Math.max(minLeft, viewport.width - margin - width);
  const left = clamp(anchor.right - width, minLeft, maxLeft);

  // 세로: 아래가 기본, 아래가 부족하고 위가 더 넓으면 위로 뒤집음
  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const placement: PopupPlacement = contentHeight > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";
  const available = Math.max(0, placement === "above" ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(contentHeight, available);
  const top = placement === "above" ? anchor.top - gap - maxHeight : anchor.bottom + gap;

  return { left, top, width, maxHeight, placement };
}
