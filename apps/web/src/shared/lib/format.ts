/**
 * 공통 시각 포맷 (명세 §2) — `MM/DD(요일) HH:MM:SS`. 예: "07/16(수) 14:03:22".
 * 순수 함수 — 서버·클라이언트 공용 (KST 고정: 운영 지역이 단일이다).
 */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const kst = (d: Date) => new Date(d.getTime() + 9 * 60 * 60 * 1000);
const p2 = (n: number) => String(n).padStart(2, "0");

/** "07/16(수) 14:03:22" */
export function fmtDateTime(date: Date): string {
  const d = kst(date);
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}(${WEEKDAYS[d.getUTCDay()]}) ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** "07/16(수) 14:03" */
export function fmtDateTimeShort(date: Date): string {
  const d = kst(date);
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}(${WEEKDAYS[d.getUTCDay()]}) ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/**
 * "8/21(금) 11시" — 예약 QR 상세 카드 전용 회차 일시. 정각은 `11시`, 분이 있으면 `11시 30분`.
 * 초는 버리고 분은 있을 때만 또렷이 표기한다. KST 고정(운영 지역 단일). 장소는 호출부가 뒤에 붙인다.
 */
export function fmtSessionCardDateTime(date: Date): string {
  const d = kst(date);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const time = minute === 0 ? `${hour}시` : `${hour}시 ${minute}분`;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]}) ${time}`;
}

/** "8월 21일 (금)" — 설명회 날짜 표기 (명세 §2 시드 형식) */
export function fmtSessionDate(date: Date): string {
  const d = kst(date);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}
