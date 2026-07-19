import * as React from 'react';

/** 예약 단계 표시 — 회차 선택 → 정보 입력 → 완료. 진행선이 채워지는 애니메이션. */
export interface StepperProps {
  /** 단계 라벨 배열 */
  steps?: string[];
  /** 현재 단계 인덱스 (0부터) */
  current?: number;
  style?: React.CSSProperties;
}

export declare function Stepper(props: StepperProps): JSX.Element;
