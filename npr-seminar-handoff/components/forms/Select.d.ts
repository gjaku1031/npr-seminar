import * as React from 'react';

/** 드롭다운 선택 — 회차·지역·정렬 기준. */
export interface SelectProps {
  label?: string;
  /** 문자열 배열 또는 {label, value} 배열 */
  options?: Array<string | { label: string; value: string }>;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export declare function Select(props: SelectProps): JSX.Element;
