import * as React from 'react';

/** 상태 표시 배지 — 예약 확정·마감 임박·대기 등. */
export interface BadgeProps {
  children?: React.ReactNode;
  tone?: 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'solid';
  /** 왼쪽 상태 점 표시 */
  dot?: boolean;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export declare function Badge(props: BadgeProps): JSX.Element;
