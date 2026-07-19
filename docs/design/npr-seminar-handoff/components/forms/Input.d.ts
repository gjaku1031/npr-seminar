import * as React from 'react';

/** 텍스트 입력 필드 — 이름·연락처·검색. */
export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: string;
  /** 아래 도움말 */
  hint?: string;
  /** 지정 시 에러 스타일 + 메시지 */
  error?: string;
  /** 왼쪽 아이콘 노드 */
  icon?: React.ReactNode;
  disabled?: boolean;
  size?: 'md' | 'lg';
  style?: React.CSSProperties;
}

export declare function Input(props: InputProps): JSX.Element;
