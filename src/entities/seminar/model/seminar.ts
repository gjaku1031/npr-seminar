/**
 * 도메인 모델 — 서버·클라이언트가 공유하는 순수 TS (설계 §4.3).
 * React·DB import 금지. DB Row가 아니다 — Row→모델 매핑은 리포지토리 구현 내부에서 한다.
 * 참고 구조에서 "컴포넌트는 VM만 알고 DTO를 모른다"였던 규율의 풀스택 판:
 * 컴포넌트·서비스는 이 모델만 알고 Row를 모른다.
 */
export type SeminarStatus = "draft" | "open" | "closed";

export interface Seminar {
  id: string;
  title: string;
  speaker: string;
  startsAt: Date;
  status: SeminarStatus;
}

/** 생성 폼 입력 단위 — id·상태는 서버(서비스·DB)가 정한다. */
export interface SeminarDraft {
  title: string;
  speaker: string;
  startsAt: Date;
}

/** 파생값·표시 규칙은 모델에 — 컴포넌트는 계산하지 않는다 (참고 구조 VM 규율 승계). */
export const seminarStatusLabel: Record<SeminarStatus, string> = {
  draft: "준비 중",
  open: "모집 중",
  closed: "종료",
};
