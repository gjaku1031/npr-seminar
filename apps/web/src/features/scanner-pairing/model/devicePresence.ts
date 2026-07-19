/**
 * 스캐너 기기 카드의 연결 표시 규칙 — 순수 함수(fetch·React 없음).
 *
 * 연결 여부는 durable ACTIVE 가 아니라 heartbeat presence(계약 ScannerDevice.online,
 * Redis 파생, 서버 TTL 60s)로만 판정한다. ACTIVE 지만 heartbeat 가 끊긴 기기는
 * "지금 연결됨"이 아니다 — 이 경우 절대 `연결됨` 이라 말하지 않는다.
 */

/** offline ACTIVE 카드가 반드시 말해야 하는 고정 문구. */
export const OFFLINE_PRESENCE_LABEL = "오프라인 · 페어링 유지";
/** online 카드 문구 — 연결됨(heartbeat)·온라인 을 함께 말한다. */
export const ONLINE_PRESENCE_LABEL = "연결됨 · 온라인";

export interface ScannerPresence {
  online: boolean;
  /** 색만으로 상태를 전달하지 않으므로 상태를 문구로 말한다. */
  label: string;
  tone: "success" | "faint";
}

/** online 은 서버가 준 presence 사실만 쓴다 — heartbeat 시각으로 재계산하지 않는다. */
export function scannerPresence(device: { online: boolean }): ScannerPresence {
  return device.online
    ? { online: true, label: ONLINE_PRESENCE_LABEL, tone: "success" }
    : { online: false, label: OFFLINE_PRESENCE_LABEL, tone: "faint" };
}
