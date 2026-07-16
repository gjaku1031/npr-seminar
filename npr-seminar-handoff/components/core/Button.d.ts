import * as React from 'react';

/**
 * 기본 액션 버튼. 예약하기·확인 등 모든 CTA에 사용.
 * @startingPoint section="Core" subtitle="프라이머리·바이올렛·세컨더리 버튼" viewport="700x260"
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** 'primary' 딥 잉크 | 'accent' 포인트 | 'secondary' 아웃라인 | 'ghost' | 'danger' */
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  fullWidth?: boolean;
  /** 텍스트 왼쪽 아이콘 노드 */
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}

export declare function Button(props: ButtonProps): JSX.Element;
