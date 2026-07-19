import * as React from 'react';

/** 토스트 알림 — 예약 완료·취소 등 즉시 피드백. 아래에서 스프링 등장. */
export interface ToastProps {
  open?: boolean;
  tone?: 'success' | 'danger' | 'info';
  children?: React.ReactNode;
  /** 오른쪽 액션 버튼 라벨 */
  action?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}

export declare function Toast(props: ToastProps): JSX.Element;
