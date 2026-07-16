/**
 * 상담 예약(Counsel) 도메인 모델 — 명세 §2 · 12.10.
 * 슬롯(강사×일시 그리드)과 신청을 한 슬라이스에 묶는다 — 항상 함께 다뤄지는 관심사.
 */

export interface CounselSlot {
  id: string;
  teacherId: string;
  date: Date;
  /** "HH:mm" */
  time: string;
  booked: boolean;
}

export interface CounselBooking {
  id: string;
  slotId: string;
  teacherId: string;
  date: Date;
  time: string;
  name: string;
  grade: string;
  phone: string;
  /** 유입 설명회 id — 모바일 완료 화면에서 신청 시 연결 (명세 12.10) */
  from: string | null;
}

/** 신청 입력 — 슬롯 선택 + 신청자 정보 */
export interface CounselBookingDraft {
  slotId: string;
  name: string;
  grade: string;
  phone: string;
  from: string | null;
}

export function isSlotAvailable(slot: CounselSlot): boolean {
  return !slot.booked;
}
