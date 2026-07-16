import * as React from 'react';

/** 아이콘 전용 정사각 버튼. 닫기·공유·북마크 등. */
export interface IconButtonProps {
  /** 16~20px 아이콘 노드 */
  children?: React.ReactNode;
  variant?: 'ghost' | 'outline' | 'solid';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  /** 접근성 라벨 (필수 권장) */
  label?: string;
  style?: React.CSSProperties;
}

export declare function IconButton(props: IconButtonProps): JSX.Element;
