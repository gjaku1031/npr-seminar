import * as React from 'react';

/** 상단 헤더 탭바 — 카드 런처 허브와 짝. 활성 필이 스프링으로 슬라이드. */
export interface TopNavProps {
  brand?: string;
  /** 로고 칩 텍스트 (기본 'npr') */
  brandBadge?: string;
  items?: Array<string | { label: string; value: string }>;
  value?: string;
  onChange?: (value: string) => void;
  /** 로고 클릭 (허브로 복귀) */
  onBrandClick?: () => void;
  /** 우측 슬롯 (알림·아바타) */
  right?: React.ReactNode;
  sticky?: boolean;
}

export declare function TopNav(props: TopNavProps): JSX.Element;
