import * as React from 'react';

/**
 * 설명회 카드 — 목록의 기본 단위. hover 리프트 + 모노그램 틸트 + 화살표 슬라이드.
 * @startingPoint section="Reservation" subtitle="설명회 목록 카드" viewport="700x360"
 */
export interface SessionCardProps {
  university?: string;
  title?: string;
  /** 예: '7월 24일 (금)' */
  date?: string;
  /** 예: '14:00' */
  time?: string;
  place?: string;
  /** 전형 태그: '수시' | '정시' | '학생부종합' | '논술' */
  types?: string[];
  seatsLeft?: number;
  seatsTotal?: number;
  /** 마감 시 흐리게 + 클릭 불가 */
  closed?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export declare function SessionCard(props: SessionCardProps): JSX.Element;
