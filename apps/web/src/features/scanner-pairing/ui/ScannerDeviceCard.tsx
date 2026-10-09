"use client";

/**
 * 스캐너 기기 카드
 *
 * 표시하는 사실은 전부 계약 ScannerDevice 에서 옴:
 * - 연결 여부는 서버의 `online`(Redis presence)만 씀. durable ACTIVE 를 "연결됨"으로 오독하지
 *   않음 — offline 인 ACTIVE 기기는 `오프라인 · 페어링 유지` 로만 말함([[scannerPresence]])
 *
 * 배터리는 현장 운영에 노이즈라 카드에 표시하지 않음. 계약의 배터리·heartbeat 필드와
 * 텔레메트리 보고 경로는 그대로 있음
 */

import { Tablet, Trash2, Wifi, WifiOff } from "lucide-react";
import { Card } from "@/shared/ui";
import { BRANCH_LABELS, type ScannerDevice } from "@/shared/api";
import { scannerPresence } from "../model/devicePresence";

/**
 * 스캐너 기기 카드 속성
 */
export interface ScannerDeviceCardProps {
  /**
   * 스캐너 기기
   */
  device: ScannerDevice;

  /**
   * 삭제 요청
   */
  onDelete: (device: ScannerDevice) => void;

  /**
   * 등장 애니메이션 지연(ms)
   */
  animationDelayMs?: number;
}

/**
 * 아이콘이 붙은 상태 한 줄
 */
function StatusRow({
  icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  tone?: "muted" | "success" | "faint";
}) {
  const color =
    tone === "success" ? "var(--status-success)" : tone === "faint" ? "var(--text-faint)" : "var(--text-muted)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
      <span style={{ display: "inline-flex", color, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: "var(--text-body)" }}>{label}</span>
      {value && (
        <>
          <span style={{ flex: 1 }} />
          <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{value}</span>
        </>
      )}
    </div>
  );
}

/**
 * 스캐너 기기 카드. 연결 상태와 삭제 버튼
 */
export function ScannerDeviceCard({ device, onDelete, animationDelayMs = 0 }: ScannerDeviceCardProps) {
  const presence = scannerPresence(device);
  const online = presence.online;

  return (
    <Card
      padding="22px"
      style={{
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${animationDelayMs}ms both`,
        opacity: online ? 1 : 0.78,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 62,
          height: 62,
          margin: "0 auto",
          borderRadius: "var(--radius-md)",
          background: online ? "var(--violet-50)" : "var(--surface-sunken)",
          color: online ? "var(--violet-800)" : "var(--text-faint)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Tablet size={28} strokeWidth={2} aria-hidden="true" />
        {/* 색만으로 상태를 전달하지 않음 — 아래 상태 행이 문구로 같은 사실을 말함 */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: online ? "var(--status-success)" : "var(--ink-300)",
            border: "2.5px solid var(--surface-card)",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 14,
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 16.5,
          color: "var(--text-strong)",
        }}
      >
        {device.deviceName}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
        {BRANCH_LABELS[device.branch]} · {device.gateCode}
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9, textAlign: "left" }}>
        {/* 연결 상태는 presence(online) 만 근거로 함 — offline 은 절대 '연결됨'이라 말하지 않음 */}
        <StatusRow
          icon={online ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
          label={presence.label}
          tone={presence.tone}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* 되돌릴 수 없는 하드 삭제라 눈에 띄지 않는 보조 액션으로 둠 (확인은 다이얼로그에서) */}
      <button
        type="button"
        onClick={() => onDelete(device)}
        style={{
          marginTop: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          height: 34,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-hairline)",
          background: "transparent",
          color: "var(--text-muted)",
          fontSize: 12.5,
          fontWeight: 600,
          fontFamily: "var(--font-body)",
          cursor: "pointer",
        }}
      >
        <Trash2 size={13} aria-hidden="true" />
        기기 삭제
      </button>
    </Card>
  );
}
