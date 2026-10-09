"use client";

/**
 * 이 기기 페어링 해제(하드 삭제) 확인 — 계약 DELETE /api/v1/scanner/device/pairing
 * 기기 입장에서 같은 사실을 설명함: 세션 즉시 종료, 페어링 등록 삭제, 기록된 입장 내역은
 * 그대로 남음, 재연결에 새 코드 필요
 */

import { ConfirmDialog } from "@/shared/ui";
import { BRANCH_LABELS, type ScannerDevice } from "@/shared/api";

/**
 * 스캐너 연결 해제 확인 창 속성
 */
export interface UnpairDeviceDialogProps {
  /**
   * 열림 여부
   */
  open: boolean;

  /**
   * 현재 기기
   */
  device: ScannerDevice;

  /**
   * 처리 중 여부
   */
  busy: boolean;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

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
 * 이 iPad 의 스캐너 연결 해제 확인 창
 */
export function UnpairDeviceDialog({ open, device, busy, error, onConfirm, onCancel }: UnpairDeviceDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      tone="danger"
      title="이 기기의 페어링을 해제할까요?"
      confirmLabel="페어링 해제"
      cancelLabel="취소"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p style={{ margin: 0, fontWeight: 700, color: "var(--text-strong)" }}>
        {device.deviceName} · {BRANCH_LABELS[device.branch]} {device.gateCode}
      </p>

      <ul style={{ margin: "14px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        <li>이 기기의 스캐너 세션이 즉시 종료되고 코드 입력 화면으로 돌아가요.</li>
        <li>이 기기의 페어링 등록이 삭제돼요.</li>
        <li>이미 기록된 입장 내역은 그대로 남아요.</li>
        <li>다시 연결하려면 관리자에게 새 코드를 받아야 해요.</li>
      </ul>

      {error && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--status-danger)" }}>
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
