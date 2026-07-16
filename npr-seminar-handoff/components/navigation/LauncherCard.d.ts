import * as React from 'react';

/** 카드 런처 허브의 모듈 진입 카드 — hover 리프트+블루 글로우+아이콘 틸트. */
export interface LauncherCardProps {
  /** 좌상단 아이콘 노드 */
  icon?: React.ReactNode;
  title?: string;
  /** 라이브 현황 한 줄 (예: '40명 · 미예약 17') */
  stat?: string;
  /** 'brand' = 네이비 강조 카드 */
  tone?: 'default' | 'brand';
  onClick?: () => void;
  /** 스태거 등장 지연(ms) */
  delay?: number;
  style?: React.CSSProperties;
}

export declare function LauncherCard(props: LauncherCardProps): JSX.Element;
