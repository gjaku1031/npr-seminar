/**
 * 설명회(Session) 도메인 모델 — 명세 §2 · §7.
 * 순수 TS: 서버(서비스·리포지토리 계약)와 클라이언트가 공유한다. React·DB import 금지 (설계 §4.3).
 */

/** 리마인드 스케줄 (명세 12.5). Session에 내장 — 단독 조회 대상이 아니라 세션의 일부. */
export interface Reminder {
  id: string;
  label: string;
  /** "HH:mm" 또는 "전일 18:00" 같은 표기 — 스케줄러 도입 시 정규화 대상 */
  time: string;
  template: string;
  enabled: boolean;
}

/** 예약 페이지 배너 테마 (명세 12.11). 실이미지 업로드는 미구현 — 색상 테마만. */
export type BannerTheme = "navy" | "blue" | "sky" | "ink";

export interface Session {
  id: string;
  title: string;
  /** 설명회 날짜 (시각은 time에 분리 보관 — 명세 §2 원본 구조) */
  date: Date;
  round: number;
  /**
   * 시작 시각 "HH:mm".
   * ⚠️ 명세 §7.2가 스스로 지적한 공백: 와이어프레임에 시작 시간 입력 필드가 없어 10:00 고정.
   * 서버는 값을 받되 UI 입력 보완이 필요하다.
   */
  time: string;
  place: string;
  capacity: number;
  desc: string;
  /** true면 예약 시 참석 인원(1~4) 수집 (명세 §5.6 · 10.3) */
  attendField: boolean;
  active: boolean;
  /** 종료 처리됨 — 미체크 예약이 노쇼로 태깅된 상태 (명세 12.4) */
  ended: boolean;
  reminders: Reminder[];
  banner: BannerTheme;
  notice: string;
}

/** 생성 입력 — id·ended·reminders 등 서버가 정하는 값은 제외 (명세 §7.2 생성 모달) */
export interface SessionDraft {
  title: string;
  date: Date;
  round: number;
  time: string;
  place: string;
  capacity: number;
  desc: string;
  attendField: boolean;
  banner: BannerTheme;
  notice: string;
}

/** 세션 현황 집계 — 예약 상태별 카운트 (명세 §7.4 현황 체크 카드 5장) */
export interface SessionStats {
  reserved: number;
  entered: number;
  noShow: number;
  cancelled: number;
  /** 정원 대비 유효 예약(reserved+entered) */
  active: number;
}

export const bannerThemeLabel: Record<BannerTheme, string> = {
  navy: "네이비",
  blue: "블루",
  sky: "스카이",
  ink: "잉크",
};

/** 예약률 % — 90 이상이면 UI가 경고색 (명세 §7.3) */
export function reservationRate(activeCount: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((activeCount / capacity) * 100);
}

/** 잔여석 — 음수 방지 */
export function remainingSeats(activeCount: number, capacity: number): number {
  return Math.max(0, capacity - activeCount);
}

/** 마감 여부 — 정원 초과 차단의 판정 기준 (서버 불변식, 설계 §6.4) */
export function isFull(activeCount: number, capacity: number): boolean {
  return activeCount >= capacity;
}

/** 임박(잔여 15% 이하) — 모바일 잔여석 게이지 경고 (명세 10.1) */
export function isNearlyFull(activeCount: number, capacity: number): boolean {
  if (capacity <= 0) return false;
  return !isFull(activeCount, capacity) && remainingSeats(activeCount, capacity) / capacity <= 0.15;
}
