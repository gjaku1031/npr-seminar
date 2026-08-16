// features/check-in 공개 API (barrel). (설계 §4.1)
//
// 실제 체크인은 iPad(`/scanner/connect`)가 SCANNER 세션으로 계약 API 에 직접 한다
// (features/scanner-session). 이 슬라이스에 남은 것은 그 화면이 쓰는 카메라 스캐너와
// 기기 판별 유틸이다 — 예전의 Server Action 경로는 제거했다.
export { QrCameraScanner } from "./ui/QrCameraScanner";
export type { QrCameraScannerProps } from "./ui/QrCameraScanner";
export {
  getClientDeviceType,
  getServerDeviceType,
  prefersRearCamera,
  subscribeToHydration,
} from "./lib/detectDevice";
export type { ScannerDeviceType } from "./lib/detectDevice";
