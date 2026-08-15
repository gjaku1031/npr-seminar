// features/scanner-session 공개 API (barrel) — iPad(SCANNER 세션) 전용.
export { useScannerSession } from "./model/useScannerSession";
export type { ScannerSessionState, ScannerSessionStatus } from "./model/useScannerSession";

export { usePairingClaim } from "./model/usePairingClaim";
export type { PairingClaimState } from "./model/usePairingClaim";

export { useScannerHeartbeat } from "./model/useScannerHeartbeat";
export type { HeartbeatState } from "./model/useScannerHeartbeat";

export { useBatteryTelemetry } from "./model/useBatteryTelemetry";
export type { BatteryTelemetry } from "./model/useBatteryTelemetry";

export { useQrCheckIn } from "./model/useQrCheckIn";
export type { CheckInPanel, QrCheckInState } from "./model/useQrCheckIn";

export { useCheckInSound } from "./model/useCheckInSound";
export type { CheckInSound } from "./model/useCheckInSound";
export { panelSoundKind, outcomeSoundKind } from "./lib/check-in-sound";
export type { CheckInSoundKind } from "./lib/check-in-sound";

export { PairingCodeInput } from "./ui/PairingCodeInput";
export { CheckInResultPanel } from "./ui/CheckInResultPanel";
export { CheckInResultOverlay } from "./ui/CheckInResultOverlay";
export { ScannerShiftPanel } from "./ui/ScannerShiftPanel";
export { ScannerManualPanel } from "./ui/ScannerManualPanel";
export { UnpairDeviceDialog } from "./ui/UnpairDeviceDialog";
