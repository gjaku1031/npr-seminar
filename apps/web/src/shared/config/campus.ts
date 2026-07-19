/**
 * 캠퍼스 조직 상수 (명세 v4.0 §2) — 타입·상수만, 업무 로직 없음 (설계 §3 shared 원칙).
 *
 * 여러 도메인(반·재원생·설명회·예약·문자)이 campus 필드 타입을 공유하는데,
 * entities 슬라이스 간 직접 import는 금지(설계 §4.1)라 공유 어휘를 shared/config에 둔다.
 * 단위 판정(unitOf) 같은 업무 규칙은 entities/class 소유 — 여기 두지 않는다.
 */

/** 캠퍼스 3종 (명세 §2) */
export type Campus = "송파캠퍼스" | "위례캠퍼스" | "광진캠퍼스";

export const CAMPUSES: Campus[] = ["송파캠퍼스", "위례캠퍼스", "광진캠퍼스"];

/** 캠퍼스별 발신번호·문의전화 — 발신번호 = 문의전화 (명세 §2 CAMPUS_INFO) */
export const CAMPUS_INFO: Record<Campus, { sender: string; inquiry: string }> = {
  송파캠퍼스: { sender: "02-413-2652", inquiry: "02-413-2652" },
  위례캠퍼스: { sender: "02-425-2652", inquiry: "02-425-2652" },
  광진캠퍼스: { sender: "02-422-2652", inquiry: "02-422-2652" },
};

export function isCampus(value: string): value is Campus {
  return (CAMPUSES as string[]).includes(value);
}

/** 설명회의 캠퍼스 범위 — '전체'는 모든 캠퍼스 예약 화면에 노출 (명세 §10.1) */
export type CampusScope = Campus | "전체";
