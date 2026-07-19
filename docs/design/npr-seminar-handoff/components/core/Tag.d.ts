import * as React from 'react';

/** 필터 칩/태그 — 지역·전형·계열 필터 선택. */
export interface TagProps {
  children?: React.ReactNode;
  /** 선택 시 딥 잉크 채움 + 살짝 커지는 스프링 */
  selected?: boolean;
  onClick?: () => void;
  /** 지정 시 X 제거 버튼 표시 */
  onRemove?: () => void;
  /** 오른쪽 카운트 숫자 */
  count?: number;
  style?: React.CSSProperties;
}

export declare function Tag(props: TagProps): JSX.Element;
