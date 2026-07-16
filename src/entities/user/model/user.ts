/**
 * 사용자·역할·권한 도메인 모델 — 명세 12.1 + flows.json 페르소나.
 *
 * ★ 진실원 = npr-seminar-flows.json (2026-07-16 결정) ★
 * feature-spec.md §12.1은 `owner|desk|teacher`에 강사=재원생(담당반)·상담·통계를 준다고 기술하지만,
 * 더 최신인 flows.json(_meta가 스스로 "진실원"이라 명시)은 `owner|siljang|gangsa`에
 * 강사=재원생·통계 **차단**, 나머지 운영 모듈 허용으로 규정한다. 충돌 확인 후 flows.json 채택.
 */

/** 콘솔 로그인 역할. 학부모(parent)는 로그인 없이 모바일 예약만 이용하므로 여기 없다. */
export type UserRole = "owner" | "siljang" | "gangsa";

export interface User {
  role: UserRole;
  name: string;
  /** gangsa 역할일 때 담당 강사 id — 설명회 운영에서 본인 반 필터링에 사용 (flows GANGSA-F5) */
  teacherId: string | null;
}

/** 허브의 8개 모듈 (명세 §3.1) */
export type ModuleKey =
  | "students"
  | "phone"
  | "sms"
  | "sessions"
  | "counsel"
  | "stats"
  | "scanner"
  | "preview";

export const moduleLabel: Record<ModuleKey, string> = {
  students: "재원생 관리",
  phone: "전화예약 관리",
  sms: "문자 발송",
  sessions: "설명회 운영",
  counsel: "상담 예약",
  stats: "통계",
  scanner: "QR 스캐너",
  preview: "모바일 프리뷰",
};

export const roleLabel: Record<UserRole, string> = {
  owner: "원장",
  siljang: "실장",
  gangsa: "강사",
};

const ALL_MODULES: ModuleKey[] = [
  "students",
  "phone",
  "sms",
  "sessions",
  "counsel",
  "stats",
  "scanner",
  "preview",
];

/**
 * 역할별 허용 모듈 (flows.json).
 * - owner  : 8모듈 전체
 * - siljang: 원장과 100% 동일
 * - gangsa : 재원생 관리·통계 차단, 나머지는 원장과 동일하게 보기+동작 가능 (GANGSA-F1·F5)
 */
export const ROLE_MODULES: Record<UserRole, ModuleKey[]> = {
  owner: ALL_MODULES,
  siljang: ALL_MODULES,
  gangsa: ["phone", "sms", "sessions", "counsel", "scanner", "preview"],
};

/** 라우트 가드·허브 카드 잠금의 단일 판정 함수 (flows GANGSA-G1: 차단 시 허브로 리다이렉트) */
export function canAccessModule(role: UserRole, module: ModuleKey): boolean {
  return ROLE_MODULES[role].includes(module);
}

export function allowedModules(role: UserRole): ModuleKey[] {
  return ROLE_MODULES[role];
}
