import * as React from 'react';

/** 기본 표면 컨테이너 — 리스트 아이템·패널·섹션. */
export interface CardProps {
  children?: React.ReactNode;
  /** elevated 기본 | outline | sunken(움푹) | brand(딥 잉크) | accent(바이올렛 틴트) */
  variant?: 'elevated' | 'outline' | 'sunken' | 'brand' | 'accent';
  /** CSS padding 값. 기본 var(--card-pad)=24px */
  padding?: string;
  /** hover 시 -4px 리프트 + 그림자 */
  interactive?: boolean;
  onClick?: () => void;
  radius?: string;
  style?: React.CSSProperties;
}

export declare function Card(props: CardProps): JSX.Element;
