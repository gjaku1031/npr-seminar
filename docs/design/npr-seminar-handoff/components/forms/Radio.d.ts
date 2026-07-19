import * as React from 'react';

/** 라디오 — 단일 선택(참석 인원 유형 등). 선택 점이 스프링 팝. */
export interface RadioProps {
  label?: React.ReactNode;
  /** 라벨 아래 보조 설명 */
  description?: string;
  checked?: boolean;
  /** 선택 시 호출 (라디오는 해제 불가) */
  onChange?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export declare function Radio(props: RadioProps): JSX.Element;
