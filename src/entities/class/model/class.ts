/**
 * 반(Class) 도메인 모델 + 단위 판별 규칙 — 명세 v4.0 §2 · §2.1.
 *
 * v4.0 개편: 부문(초/중/고) → 캠퍼스 3종 + 단위(unit) 체계.
 * 반명이 단위를 결정한다(§2.1 unitOf — 운영 엑셀 수식과 동일한 IF 순서).
 * 캠퍼스 타입·상수는 여러 도메인이 공유하므로 shared/config/campus에 있고(설계 §4.1),
 * 판정 규칙(unitOf)의 소유는 반(Class)이다 — 반명이 유일한 판정 입력이기 때문.
 */

import type { Campus } from "@/shared/config/campus";

export interface Class {
  id: string;
  /** 반명 — 단위를 결정한다 (§2.1) */
  name: string;
  teacherId: string;
  /** 담임명 — 명세 §2 모델 그대로 보관 (11열 테이블 등 화면이 직접 표시) */
  teacherName: string;
  campus: Campus;
  /** unitOf(name) 파생값 — 시드·생성 시 계산해 보관 (명세 §2) */
  unit: string;
}

/**
 * 단위 판별 규칙 (명세 §2.1) — 운영 엑셀 수식과 동일한 IF 순서를 유지한다.
 * 순서가 곧 규칙이다: 재배열 금지.
 */
export function unitOf(className: string | null | undefined): string {
  const cn = className ?? "";
  if (!cn || cn === "비재원생") return "";
  const s = (p: string) => cn.indexOf(p) === 0;
  if (
    s("과초6") || s("과고1") || s("과고2") || s("과고3") ||
    s("과예중1") || s("과예고1") || s("과1") || s("과2") || s("과3")
  ) {
    return "과학";
  }
  if (s("예고1")) return "예고1";
  if (s("예1S") || s("예1영")) return "특목";
  if (s("예1")) return "예중1";
  if (s("초6") || s("초5")) return "특목";
  if (s("중1") || s("중2") || s("중3")) return "특목";
  if (s("초3")) return "초등";
  if (cn[0] === "4" || cn[0] === "5" || cn[0] === "6") return "초등";
  if (s("고1") || s("고2") || s("고3")) return "고등";
  if (cn[0] === "1") return "중등1";
  if (cn[0] === "2") return "중등2";
  if (cn[0] === "3") return "중등3";
  return "";
}

/** 단위 탭 (명세 §2.1) — 예약 명단은 여기에 '비재원생' 탭을 더해 쓴다 */
export const UNIT_TABS = ["전체", "초등", "중1", "중2", "중3", "특목", "고등", "과학"] as const;
export type UnitTab = (typeof UNIT_TABS)[number];

/** 단위 탭 → 단위 값 매칭 — 특목 탭은 예중1·예고1 포함 (명세 §2.1) */
export function unitMatchesTab(unit: string, tab: string): boolean {
  if (tab === "전체") return true;
  if (tab === "중1") return unit === "중등1";
  if (tab === "중2") return unit === "중등2";
  if (tab === "중3") return unit === "중등3";
  if (tab === "특목") return unit === "특목" || unit === "예중1" || unit === "예고1";
  return unit === tab;
}
