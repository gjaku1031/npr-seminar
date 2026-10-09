// 공통 시각 표기. 서버·클라이언트 공용 순수 함수
// 운영 지역이 하나라 서울 시간(UTC+9)으로 고정

/**
 * 요일 표기. 일요일부터
 */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 서울 시간으로 이동한 Date. UTC getter로 서울 시각을 읽기 위함
 */
const kst = (d: Date) => new Date(d.getTime() + 9 * 60 * 60 * 1000);

/**
 * 두 자리 0 채움
 */
const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * `07/16(수) 14:03:22` 형식
 */
export function fmtDateTime(date: Date): string {
  const d = kst(date);
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}(${WEEKDAYS[d.getUTCDay()]}) ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/**
 * `07/16(수) 14:03` 형식
 */
export function fmtDateTimeShort(date: Date): string {
  const d = kst(date);
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}(${WEEKDAYS[d.getUTCDay()]}) ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/**
 * 예약 QR 상세 카드의 회차 일시. `8/21(금) 11시`, 분이 있으면 `11시 30분`
 *
 * 초는 버리고 분은 있을 때만 표기. 장소는 호출부가 뒤에 붙임
 */
export function fmtSessionCardDateTime(date: Date): string {
  const d = kst(date);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const time = minute === 0 ? `${hour}시` : `${hour}시 ${minute}분`;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]}) ${time}`;
}

/**
 * 설명회 날짜 `8월 21일 (금)` 형식
 */
export function fmtSessionDate(date: Date): string {
  const d = kst(date);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}
