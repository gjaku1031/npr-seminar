import * as React from 'react';

/** 토글 스위치 — 알림 on/off 등 즉시 적용 설정. */
export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export declare function Switch(props: SwitchProps): JSX.Element;
