/**
 * QR 스캐너 기기(Device) 도메인 모델 — 명세 §2 · §8.1 (최대 4대).
 * ⚠️ 실제 카메라·QR 인식은 미구현 — 기기 모니터링 정보만 (명세 §11).
 */

export interface Device {
  id: string;
  /** 설치 위치 */
  label: string;
  /** 기종 */
  model: string;
  on: boolean;
  /** 배터리 % — 40 이하 경고 (명세 §8.1) */
  battery: number;
  /** 마지막 활동 시각 */
  last: Date;
}

/** 기기 최대 대수 (명세 §8.1) */
export const MAX_DEVICES = 4;

/** 배터리 경고 임계 (명세 §8.1) */
export const BATTERY_WARN_THRESHOLD = 40;

export function isBatteryLow(device: Device): boolean {
  return device.battery <= BATTERY_WARN_THRESHOLD;
}
