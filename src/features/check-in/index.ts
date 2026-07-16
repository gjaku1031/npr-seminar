// features/check-in 공개 API (barrel). (설계 §4.1)
export {
  checkInAction,
  checkInByCodeAction,
  scanQrAction,
  walkInAction,
  rollbackEntryAction,
} from "./api/actions";
export type { CheckInState, QrScanData, QrScanState } from "./api/actions";
export { QrCameraScanner, detectPreferRearCamera } from "./ui/QrCameraScanner";
