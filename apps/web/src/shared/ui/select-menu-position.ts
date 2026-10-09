// 포털 모드 Select 메뉴 배치 계산. DOM을 만지지 않는 순수 함수라 노드 테스트로 검증
// 트리거의 뷰포트 좌표, 뷰포트 크기, 내용 높이 추정치로 position: fixed 드롭다운의 좌표·폭·최대 높이·상하 배치 계산
// 학생 현황 필터 카드는 overflow: hidden, 필터 줄은 overflowX: auto라 기본 절대 배치 메뉴가 조상에서 잘려 담임 목록이 보이지 않았음
// body로 포털해 fixed로 띄우면 어떤 조상 overflow도 자르지 못함
// - 폭은 트리거 폭 이상(최소 가독 폭)을 쓰되 뷰포트가 좁으면 좌우 여백만큼 줄임
// - 가로는 트리거 왼쪽에 맞추고 화면 좌우 여백 안으로 고정
// - 세로는 기본 아래. 아래가 모자라고 위가 더 넓으면 위로 뒤집고, 남는 공간에 맞춰 최대 높이를 잘라 내부 스크롤(646px처럼 낮은 화면에서도 화면을 넘지 않음)

/**
 * 트리거 버튼의 뷰포트 좌표(px)
 */
export interface SelectAnchorRect {
  /**
   * 왼쪽
   */
  left: number;

  /**
   * 위쪽
   */
  top: number;

  /**
   * 아래쪽
   */
  bottom: number;

  /**
   * 너비
   */
  width: number;
}

/**
 * 뷰포트 크기(px)
 */
export interface SelectViewport {
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
 * 메뉴 위치. 트리거 아래 또는 위
 */
export type SelectMenuPlacement = "below" | "above";

/**
 * 메뉴 배치 결과(px)
 */
export interface SelectMenuPosition {
  /**
   * 왼쪽
   */
  left: number;

  /**
   * 위쪽
   */
  top: number;

  /**
   * 너비
   */
  width: number;

  /**
   * 최대 높이. 내용이 넘치면 내부 스크롤
   */
  maxHeight: number;

  /**
   * 상하 배치
   */
  placement: SelectMenuPlacement;
}

/**
 * 뷰포트 가장자리 최소 여백(px). 8~12px 범위
 */
export const SELECT_MENU_MARGIN = 10;

/**
 * 트리거와 메뉴 사이 간격(px)
 */
const SELECT_MENU_GAP = 6;

/**
 * 최소 폭(px). 공간이 있는 한 트리거가 더 좁아도 이 아래로 줄이지 않음
 */
export const SELECT_MENU_MIN_WIDTH = 132;

/**
 * 최대 높이(px). 기본 Select 메뉴와 같은 값. 남는 공간이 더 좁으면 그쪽에 맞춤
 */
const SELECT_MENU_MAX_HEIGHT = 280;

/**
 * 범위 고정
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 포털 메뉴 좌표·폭·최대 높이·상하 배치 계산
 *
 * @param contentHeight 메뉴 내용 높이 추정(px)
 * @param options 최소 폭·여백·간격·최대 높이 덮어쓰기
 */
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

  // 트리거 폭 이상(최소 가독 폭)을 쓰되 좌우 여백을 뺀 폭을 넘지 않음
  const roomForWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(Math.max(anchor.width, minWidth), roomForWidth);

  // 가로: 트리거 왼쪽에 맞춘 뒤 화면 안으로 고정해 어느 가장자리도 넘지 않음
  const minLeft = margin;
  const maxLeft = Math.max(minLeft, viewport.width - margin - width);
  const left = clamp(anchor.left, minLeft, maxLeft);

  // 세로: 기본은 아래. 원하는 높이가 아래 공간을 넘고 위가 더 넓으면 위로 뒤집음
  const desired = Math.min(contentHeight, maxHeightCap);
  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const placement: SelectMenuPlacement = desired > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";
  const available = Math.max(0, placement === "above" ? spaceAbove : spaceBelow);
  const maxHeight = Math.max(0, Math.min(desired, available));
  const top = placement === "above" ? anchor.top - gap - maxHeight : anchor.bottom + gap;

  return { left, top, width, maxHeight, placement };
}
