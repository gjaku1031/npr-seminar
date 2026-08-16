/**
 * 사용자·역할·권한 도메인 모델 — 명세 v4.0 §1.1.
 *
 * v4.0 개편: 역할 3종(owner/siljang/gangsa) → **단일 관리자 계정**.
 * 역할별 게이팅이 사라졌다 — 로그인하면 전 모듈 사용 가능(간담회만 '준비 중' 잠금).
 * 학부모/학생은 로그인 없이 공개 예약 루트(`/`)만 이용한다.
 *
 * canAccessModule을 남겨두는 이유: 라우트 가드(requireModuleAccess)의 판정 지점을
 * 한 곳에 유지하기 위함 — 역할이 다시 늘어나면 이 함수만 확장한다 (설계 §6.5).
 */

/** 콘솔 로그인 역할 — 단일 관리자 (명세 §1.1) */
export type UserRole = "admin";

export interface User {
  role: UserRole;
  name: string;
}

/**
 * 콘솔 모듈 (명세 §1.1) — TopNav 탭 목록의 진실원. v4.0에서 전화예약(phone) 모듈 삭제.
 * 모바일 프리뷰(preview)도 삭제했다: 학부모 앱이 루트(`/`)에서 실제로 돌아가므로
 * 콘솔 안에서 폰 프레임으로 시연할 이유가 없어졌다.
 */
export type ModuleKey =
  | "students"
  | "student-status"
  | "sms"
  | "sessions"
  | "counsel"
  | "stats"
  | "scanner";

/**
 * `students`(예약 명단)와 `student-status`(학생 현황)는 다른 질문에 답한다:
 * 전자는 "이 설명회에 누가 예약했나"(가족 예약 집계), 후자는 "원천에서 동기화된
 * 재원생 명부가 지금 어떤 상태인가"(학생 동기화)다. 두 화면은 겹치지 않는다.
 */
export const moduleLabel: Record<ModuleKey, string> = {
  students: "예약 명단",
  "student-status": "학생 현황",
  sms: "문자 발송",
  sessions: "설명회 운영",
  counsel: "간담회 예약",
  stats: "통계",
  scanner: "QR 스캐너",
};

export const ALL_MODULES: ModuleKey[] = [
  "students",
  "student-status",
  "sms",
  "sessions",
  "counsel",
  "stats",
  "scanner",
];

/**
 * 간담회는 접근은 가능하되 화면이 '준비 중' placeholder다 (명세 §7) —
 * 게이팅이 아니라 기능 미구현이므로 여기서 막지 않는다.
 */
export function canAccessModule(role: UserRole, module: ModuleKey): boolean {
  return role === "admin" && ALL_MODULES.includes(module);
}
