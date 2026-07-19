import * as React from 'react';

/** 툴팁 — hover 시 짧은 설명. */
export interface TooltipProps {
  /** 트리거 요소 */
  children?: React.ReactNode;
  /** 툴팁 텍스트 */
  content?: React.ReactNode;
  side?: 'top' | 'bottom' | 'right';
  style?: React.CSSProperties;
}

export declare function Tooltip(props: TooltipProps): JSX.Element;
