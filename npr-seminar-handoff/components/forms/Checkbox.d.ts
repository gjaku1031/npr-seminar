import * as React from 'react';

/** 체크박스 — 약관 동의·다중 선택. 체크 시 스트로크 드로잉 애니메이션. */
export interface CheckboxProps {
  label?: React.ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export declare function Checkbox(props: CheckboxProps): JSX.Element;
