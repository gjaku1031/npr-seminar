"use client";

/**
 * 기기 하드 삭제 확인 — 되돌릴 수 없으므로 무엇이 사라지고 무엇이 남는지 먼저 말함
 * 계약 DELETE /api/v1/admin/scanner-devices/{deviceId} 는 204(멱등)이고 사유를 받지 않음
 *
 * 사유 입력은 받지 않음. 하드 삭제는 사유를 저장할 기기 이력 자체가 남지 않으므로
 * 사유를 받는 것이 거짓 약속이 됨
 */

import { ConfirmDialog } from "@/shared/ui";
import { BRANCH_LABELS, type ScannerDevice } from "@/shared/api";

/**
 * 기기 삭제 확인 창 속성
 */
export interface DeleteDeviceDialogProps {
  /**
   * null 이면 닫힌 상태
   */
  device: ScannerDevice | null;

  /**
   * 처리 중 여부
   */
  busy: boolean;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;
  /**
   * 결과 미상으로 남은 삭제 요청이 있는가
   *
   * 삭제는 멱등이라 사유 같은 본문이 없어 "본문 고정"이 필요 없음 — 호출부(useOperationKey)가
   * 같은 Idempotency-Key 를 유지한 채 재시도하면 서버가 리플레이로 처리함. 여기서는
   * 확인 문구만 재시도로 바꿈
   */
  pending?: boolean;

  /**
   * 확인 처리
   */
  onConfirm: () => void;

  /**
   * 취소 처리
   */
  onCancel: () => void;
}

/**
 * 기기 하드 삭제 확인 창
 */
export function DeleteDeviceDialog({
  device,
  busy,
  error,
  pending = false,
  onConfirm,
  onCancel,
}: DeleteDeviceDialogProps) {
  if (!device) return null;

  return (
    <ConfirmDialog
      open
      tone="danger"
      title="이 기기를 삭제할까요?"
      confirmLabel={pending ? "같은 요청으로 다시 시도" : "기기 삭제"}
      cancelLabel={pending ? "닫기" : "취소"}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p style={{ margin: 0, fontWeight: 700, color: "var(--text-strong)" }}>
        {device.deviceName} · {BRANCH_LABELS[device.branch]} {device.gateCode}
      </p>

      <ul style={{ margin: "14px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        <li>이 기기의 스캐너 세션이 즉시 종료되고 진행 중이던 스캔도 중단돼요.</li>
        <li>기기 등록과 페어링 정보가 완전히 삭제돼요. 기기 이력은 남지 않아요.</li>
        <li>이미 기록된 입장 내역은 그대로 남아요.</li>
        <li>다시 사용하려면 새 페어링 코드를 발급해 등록해야 해요.</li>
      </ul>

      {pending && (
        <p
          aria-live="polite"
          style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-muted)" }}
        >
          앞서 보낸 삭제 요청의 결과를 확인하지 못했어요. 같은 요청으로 다시 시도할 수 있어요.
        </p>
      )}

      {error && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--status-danger)" }}>
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
