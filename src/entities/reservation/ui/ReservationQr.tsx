"use client";

/**
 * 예약 입장 QR — 실제 스캔 가능한 QR 캔버스 (qr-poc QRCodeDisplay 이식).
 * QR에는 `/q/{qrToken}` 절대 URL을 담는다 — 카메라 스캐너·휴대폰 기본 카메라 모두 인식.
 * 절대 URL은 마운트 후 window.origin으로 만든다(SSR에는 흰 프레임만) — 서버 base 설정과 무관하게
 * 사용자가 열어본 호스트를 그대로 따라간다.
 *
 * 디자인시스템(shared/ui)의 QrBox(플레이스홀더)는 수정하지 않는다 — 실 QR은 이 컴포넌트를 쓴다.
 */

import { useRef, useSyncExternalStore, type CSSProperties } from "react";
import { QRCodeCanvas } from "qrcode.react";

export interface ReservationQrProps {
  qrToken: string;
  size?: number;
  /** 지정 시 QR 아래에 다운로드·URL 복사 버튼 노출 (QR 패스 페이지) */
  downloadName?: string;
  /** QR 아래에 링크 문자열 표시 */
  showUrl?: boolean;
  style?: CSSProperties;
}

/** QR 인식률을 위해 전경/배경은 순수 흑백 고정 (다크모드·강제 색상에서도 유지) */
const QR_SURFACE: CSSProperties = { colorScheme: "only light", forcedColorAdjust: "none" };

export function buildQrPath(qrToken: string): string {
  return `/q/${encodeURIComponent(qrToken)}`;
}

/** 마운트 후에만 window.origin을 읽는다 — SSR은 빈 값 (qr-poc useSyncExternalStore 패턴) */
const emptySubscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

export function ReservationQr({ qrToken, size = 120, downloadName, showUrl, style }: ReservationQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const origin = useSyncExternalStore(emptySubscribe, getOrigin, getServerOrigin);

  const url = origin ? `${origin}${buildQrPath(qrToken)}` : "";

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${downloadName ?? "npr-qr"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
    }, "image/png");
  };

  const copyUrl = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10, ...style }}>
      <div
        style={{
          width: size,
          height: size,
          background: "#FFFFFF",
          border: "1px solid var(--mint-200)",
          borderRadius: "var(--radius-xs)",
          padding: Math.round(size * 0.07),
          boxSizing: "border-box",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...QR_SURFACE,
        }}
      >
        {url && (
          <QRCodeCanvas
            ref={canvasRef}
            value={url}
            size={size - Math.round(size * 0.14)}
            level="M"
            marginSize={0}
            fgColor="#000000"
            bgColor="#FFFFFF"
            aria-label="입장 QR 코드"
            style={{ display: "block", imageRendering: "pixelated", width: "100%", height: "100%" }}
          />
        )}
      </div>

      {showUrl && url && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", wordBreak: "break-all", textAlign: "center", maxWidth: 260 }}>
          {url}
        </div>
      )}

      {downloadName && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={download}
            style={{ padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "none", background: "var(--violet-800)", color: "#FFFFFF", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            QR 다운로드
          </button>
          <button
            type="button"
            onClick={copyUrl}
            style={{ padding: "8px 14px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", color: "var(--text-body)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            URL 복사
          </button>
        </div>
      )}
    </div>
  );
}
