/**
 * QR 스캐너 기기(Device) 도메인 모델 — 명세 v4.0 §2 · §9.1 (스캐너 #1~#4).
 * ⚠️ 실제 카메라·QR 인식은 미구현 — 기기 모니터링 정보만 (명세 §12).
 *
 * v4.0 개편: scannerNo(1~4) 추가 — 입장 처리 시 예약에 기록되어
 * 예약 명단 입장 열에 `#N ↵ 시각`으로 표기된다 (명세 §4.6 · §9.2).
 */

export interface Device {
  id: string;
  /** 설치 위치 — 예: "스캐너 #1 · 송파 입구" */
  label: string;
  /** 기종 */
  model: string;
  /** 스캐너 번호 1~4 — 체크인 기록에 남는 식별자 (명세 §9.2) */
  scannerNo: number;
  on: boolean;
  /** 배터리 % — 40 이하 경고 (명세 §9.1) */
  battery: number;
  /** 마지막 활동 시각 */
  last: Date;
}

/** 기기 최대 대수 (명세 §9.1) */
export const MAX_DEVICES = 4;

/** 배터리 경고 임계 (명세 §9.1) */
export const BATTERY_WARN_THRESHOLD = 40;

export function isBatteryLow(device: Device): boolean {
  return device.battery <= BATTERY_WARN_THRESHOLD;
}
