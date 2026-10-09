"use client";

/**
 * 스캔 기기 판별. 화면 배치용 판별만 하고 기기·회차를 저장하지 않음
 * (회차 잠금은 서버 shift lock 이 소유함)
 */

export type ScannerDeviceType = "iPad" | "iPhone" | "Android 폰" | "Android 태블릿" | "Mac" | "PC";

/**
 * userAgent·터치 지점 수로 스캔 기기 종류 판별
 */
function detectScannerDeviceType(): ScannerDeviceType {
  if (typeof navigator === "undefined") return "PC";

  const ua = navigator.userAgent;

  // iPadOS 13+ Safari 는 데스크톱 모드가 기본이라 userAgent 가 Macintosh 로 보고됨
  // 실제 Mac 은 maxTouchPoints 가 0, iPad 는 5 이상이므로 터치 지원으로 구분함
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIPad) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android.*Mobile/i.test(ua)) return "Android 폰";
  if (/Android/i.test(ua)) return "Android 태블릿";
  if (/Macintosh/.test(ua)) return "Mac";
  return "PC";
}

/**
 * 손에 들고 스캔하는 기기는 후면 카메라를 씀
 * iPad 는 거치형(방문자를 향한 전면 스캔), Mac/PC 는 전면 웹캠뿐임
 */
const REAR_CAMERA_DEVICE_TYPES: ReadonlySet<ScannerDeviceType> = new Set<ScannerDeviceType>([
  "iPhone",
  "Android 폰",
  "Android 태블릿",
]);

/**
 * 기기 종류가 후면 카메라를 써야 하는지 판별
 */
export function prefersRearCamera(deviceType: ScannerDeviceType): boolean {
  return REAR_CAMERA_DEVICE_TYPES.has(deviceType);
}

/**
 * 마운트 후에만 기기를 감지함 — SSR 은 전면 카메라 기본 (useSyncExternalStore 패턴)
 */
export const subscribeToHydration = (onStoreChange: () => void) => {
  onStoreChange();
  return () => {};
};

/**
 * 클라이언트 기기 종류 스냅샷
 */
export const getClientDeviceType = (): ScannerDeviceType => detectScannerDeviceType();

/**
 * SSR 기기 종류 스냅샷. 항상 PC
 */
export const getServerDeviceType = (): ScannerDeviceType => "PC";
