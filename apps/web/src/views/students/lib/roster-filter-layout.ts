/**
 * 예약 명단 두 줄 필터의 배치 계약 — 학생 현황(StudentStatusView)의 두 줄 필터와 같은 규칙을
 * 예약 명단에도 그대로 적용한다. 순수 상수/스타일이라 DOM 없이 계약을 검증할 수 있다.
 *
 * 정렬 불변식: 1행 검색폭 = 2행 왼쪽 여백(spacer)이라야 `캠퍼스`·`단위` 라벨이 같은 x 에서
 * 시작하고, 라벨 폭이 같아야 그 뒤 버튼들도 같은 x 에서 시작한다. 라벨은 고정폭 + 비축소 +
 * 줄바꿈 금지라 어떤 폭에서도 잘리지 않는다(각 줄은 스스로 가로 스크롤한다).
 */

import type { CSSProperties } from "react";

/** 검색 입력 폭 — 지시된 정확한 값. 2행 왼쪽 여백도 같은 값을 써 라벨을 같은 x 에 세운다. */
export const ROSTER_FILTER_SEARCH_WIDTH = 280;

/** 2행 왼쪽 여백 — 정렬 불변식상 검색폭과 반드시 같다. */
export const ROSTER_FILTER_SPACER_WIDTH = ROSTER_FILTER_SEARCH_WIDTH;

/** 필터 라벨(캠퍼스·단위) 고정폭 — 두 라벨이 같은 폭이라 뒤 버튼 시작 x 가 맞는다. */
export const ROSTER_FILTER_LABEL_WIDTH = 46;

/** 한 줄 안 요소 간격. */
const ROSTER_FILTER_ROW_GAP = 12;

/**
 * 필터 Tag 전용 치수 — 공용 Tag 보다 촘촘하게 죄어 두 줄 필터가 각 줄 안에서 자연스럽게
 * 흐르게 한다. 이 화면 안에서만 쓰고 공용 Tag 는 건드리지 않는다.
 */
export const ROSTER_FILTER_TAG_STYLE = { height: 30, padding: "0 9px", fontSize: 12 } as const;

/**
 * 한 줄 필터 컨테이너 — nowrap + 가로 스크롤. 페이지가 아니라 이 줄만 스크롤한다.
 * 세로 padding 은 선택 칩의 부드러운 글로우가 가로 스크롤 클리핑에 잘리지 않게 하는 여유다.
 */
export const ROSTER_FILTER_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: ROSTER_FILTER_ROW_GAP,
  flexWrap: "nowrap",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "4px 0",
  maxWidth: "100%",
};

/** 필터 라벨 — 고정폭·비축소·줄바꿈 금지라 어떤 폭에서도 클리핑되지 않는다. */
export const ROSTER_FILTER_LABEL_STYLE: CSSProperties = {
  width: ROSTER_FILTER_LABEL_WIDTH,
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};
