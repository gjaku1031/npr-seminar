// features/check-in 공개 API (barrel). (설계 §4.1)
export {
  checkInAction,
  checkInByCodeAction,
  scanQrAction,
  walkInAction,
  rollbackEntryAction,
} from "./api/actions";
export type { CheckInState, QrScanData, QrScanState } from "./api/actions";
export { QrCameraScanner } from "./ui/QrCameraScanner";
export type { QrCameraScannerProps } from "./ui/QrCameraScanner";
export {
  detectScannerDeviceType,
  getClientDeviceType,
  getServerDeviceType,
  prefersRearCamera,
  subscribeToHydration,
} from "./lib/detectDevice";
export type { ScannerDeviceType } from "./lib/detectDevice";
