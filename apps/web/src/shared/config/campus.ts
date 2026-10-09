// 캠퍼스 공용 상수. 타입·상수만 두고 업무 로직은 두지 않음
// 여러 도메인(반·재원생·설명회·예약·문자)이 캠퍼스 타입을 공유하고 entities 슬라이스끼리는 직접 import할 수 없어 shared/config에 둠
// 단위 판정 같은 업무 규칙은 여기 두지 않음

/**
 * 캠퍼스 3곳
 */
export type Campus = "A캠퍼스" | "B캠퍼스" | "C캠퍼스";

/**
 * 캠퍼스별 발신 번호·문의 전화. 두 번호는 같음
 */
export const CAMPUS_INFO: Record<Campus, { sender: string; inquiry: string }> = {
  A캠퍼스: { sender: "02-000-0001", inquiry: "02-000-0001" },
  B캠퍼스: { sender: "02-000-0002", inquiry: "02-000-0002" },
  C캠퍼스: { sender: "02-000-0003", inquiry: "02-000-0003" },
};
