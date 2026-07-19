import * as React from 'react';

/** 탭 — 마이페이지 예약 상태, 상세 페이지 섹션 전환. 인디케이터가 스프링으로 이동. */
export interface TabsProps {
  /** 문자열 배열 또는 {label, value, count?} 배열 */
  items?: Array<string | { label: string; value: string; count?: number }>;
  value?: string;
  onChange?: (value: string) => void;
  /** underline 기본 | pill(움푹한 세그먼트) */
  variant?: 'underline' | 'pill';
  style?: React.CSSProperties;
}

export declare function Tabs(props: TabsProps): JSX.Element;
