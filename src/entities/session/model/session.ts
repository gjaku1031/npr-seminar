/**
 * 설명회(Session) 도메인 모델 — 명세 v4.0 §2 · §6.
 * 순수 TS: 서버(서비스·리포지토리 계약)와 클라이언트가 공유한다. React·DB import 금지 (설계 §4.3).
 *
 * v4.0 개편: campus 범위('전체'|캠퍼스)·surveySms(만족도 설문 문자) 추가,
 * 리마인드(Reminder) 삭제 — 종료 후 만족도 설문 흐름으로 대체 (명세 §6.4).
 * 배너 테마는 v3.3 확정 3종: violet(네이비)·mint(스카이)·slate(슬레이트).
 */

import type { CampusScope } from "@/shared/config/campus";

/** 예약 페이지 배너 테마 (명세 §6.2 페이지 꾸미기). 실이미지 업로드는 미구현 — 색상 테마만. */
export type BannerTheme = "violet" | "mint" | "slate";

export interface Session {
  id: string;
  title: string;
  /** 캠퍼스 범위 — '전체'는 모든 캠퍼스 예약 화면에 노출 (명세 §10.1) */
  campus: CampusScope;
  /** 설명회 날짜 (시각은 time에 분리 보관 — 명세 §2 원본 구조) */
  date: Date;
  round: number;
  /**
   * 시작 시각 "HH:mm".
   * ⚠️ 명세 §6.2가 스스로 지적한 공백: 생성 모달에 시작 시간 입력이 없어 10:00 고정 저장.
   * 서버는 값을 받되 UI 입력 보완이 필요하다.
   */
  time: string;
  place: string;
  capacity: number;
  desc: string;
  /** true면 예약 시 참석 학부모(모/부)·참석 인원 수집 (명세 §10.4) */
  attendField: boolean;
  active: boolean;
  /** 종료 처리됨 — 미체크 예약이 내부 노쇼로 태깅된 상태 (명세 §6.6) */
  ended: boolean;
  banner: BannerTheme;
  /** 예약 페이지 안내문 (명세 §6.2) */
  notice: string;
  /** 만족도 설문 문자 본문 — 변수 {학생명}{설명회명}{설문링크} (명세 §6.4) */
  surveySms: string;
}

/** 생성 입력 — id·ended 등 서버가 정하는 값은 제외 (명세 §6.2 생성 모달) */
export interface SessionDraft {
  title: string;
  campus: CampusScope;
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

/** 세션 현황 집계 — 예약 상태별 카운트 (명세 §6.3 스탯 4장) */
export interface SessionStats {
  reserved: number;
  entered: number;
  noShow: number;
  cancelled: number;
  /** 정원 대비 유효 예약(reserved+entered) */
  active: number;
}

export const bannerThemeLabel: Record<BannerTheme, string> = {
  violet: "네이비",
  mint: "스카이",
  slate: "슬레이트",
};

/** 신규 설명회의 설문 문자 기본값 (명세 §6.4) */
export const DEFAULT_SURVEY_SMS =
  "[npr] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기·사진 남기기: {설문링크}";

/** 예약률 % — 현황 헤더 표기 (명세 §6.3) */
export function reservationRate(activeCount: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((activeCount / capacity) * 100);
}

/** 잔여석 — 음수 방지 */
export function remainingSeats(activeCount: number, capacity: number): number {
  return Math.max(0, capacity - activeCount);
}

/** 마감 여부 — 정원 초과 차단의 판정 기준 (서버 불변식, 설계 §6.4) + 모바일 마감 배지 (명세 §10.2) */
export function isFull(activeCount: number, capacity: number): boolean {
  return activeCount >= capacity;
}

/** 설명회가 해당 캠퍼스 예약 화면에 노출되는지 — campus='전체' 포함 (명세 §10.1) */
export function isVisibleAtCampus(session: Session, campus: string): boolean {
  return session.campus === "전체" || session.campus === campus;
}
