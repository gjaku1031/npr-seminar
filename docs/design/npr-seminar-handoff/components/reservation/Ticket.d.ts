import * as React from 'react';

/**
 * 예약 완료 티켓 — 절취선·QR 스텁·바이올렛 '예약 확정' 스탬프 애니메이션.
 * @startingPoint section="Reservation" subtitle="예약 확정 티켓" viewport="460x420"
 */
export interface TicketProps {
  university?: string;
  title?: string;
  /** 예: '2회차' */
  round?: string;
  date?: string;
  time?: string;
  place?: string;
  /** 예약자 이름 */
  name?: string;
  /** 예약번호 — QR 플레이스홀더 패턴의 시드로도 사용 */
  code?: string;
  /** 바이올렛 스탬프 등장 애니메이션 */
  stamped?: boolean;
  /** 절취선 펀치 구멍 색 = 뒤 배경색 */
  punchColor?: string;
  style?: React.CSSProperties;
}

export declare function Ticket(props: TicketProps): JSX.Element;
