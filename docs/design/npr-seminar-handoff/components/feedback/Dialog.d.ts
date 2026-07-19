import * as React from 'react';

/** 모달 다이얼로그 — 예약 확인·취소 확인. 스크림 페이드 + 스프링 팝 등장. */
export interface DialogProps {
  open?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** 하단 버튼 영역 (오른쪽 정렬) */
  footer?: React.ReactNode;
  width?: number;
}

export declare function Dialog(props: DialogProps): JSX.Element;
