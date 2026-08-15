// shared/ui 공개 API — 디자인 시스템 이식 완료 (설계 §8, 결정 S1 자리에 v3.3 DS 입주).
// 원본: npr-seminar-handoff/components/** (namespace DesignSystem_179b2a) + ui_kits shared.jsx.
export { Button } from "./Button";
export { Badge } from "./Badge";
export { Card } from "./Card";
export { Tag } from "./Tag";
export { Input } from "./Input";
export { Select } from "./Select";
export type { SelectOption } from "./Select";
export { Switch } from "./Switch";
export { Dialog } from "./Dialog";
// 파기적 확인 전용 — role="alertdialog" + 포커스 트랩 (DS Dialog 는 그대로 둔다).
export { ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";
export { Toast } from "./Toast";
export { Tooltip } from "./Tooltip";
export { TopNav } from "./TopNav";
export type { TopNavItem } from "./TopNav";
export { LauncherCard } from "./LauncherCard";
export { BrandMark } from "./BrandMark";
export {
  BRAND_NAME,
  BRAND_SEMINAR,
  BRAND_NAME_ROMAN,
  BRAND_SMS_TAG,
  BRAND_QR_DOWNLOAD_BASENAME,
  BRAND_LOGO_SRC,
  brandSeminarTitle,
  brandHomeLabel,
} from "./brand";
export { Icons } from "./icons";
export type { IconProps } from "./icons";
export { QrBox, ResStatusBadge, StatCard, EmptyState, KV, nprQrCells } from "./pieces";
