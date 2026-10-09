/**
 * 관리자 스캐너 그리드 레이아웃 규격 — 순수 상수/함수 (DOM·React 없음, node:test 로 검증)
 *
 * 기기 카드는 4열 그리드로 흐름. 기기 수 상한이 없어 5대째부터는 자동으로 다음 줄로
 * 넘어감(마지막 칸의 발급 슬롯 포함). 이 값은 ScannerView 의 grid-template-columns 에 그대로
 * 쓰이며, 여기 테스트가 "5대 이상은 다음 행으로 흐른다"는 동작을 회귀로 잠금
 */

/**
 * 데스크톱 기본 열 수. ScannerView GRID_STYLES 의 repeat(N, …) 와 동일해야 함
 */
export const SCANNER_GRID_COLUMNS = 4;

/**
 * 0-기반 인덱스(카드 순서)가 놓이는 행(0-기반). 4열이면 인덱스 4(=5번째)부터 두 번째 행임
 */
export function scannerGridRow(index: number, columns: number = SCANNER_GRID_COLUMNS): number {
  return Math.floor(index / columns);
}
