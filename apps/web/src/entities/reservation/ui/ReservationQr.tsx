"use client";

/**
 * 가족 입장 QR — 실제 스캔 가능한 QR 캔버스 (qr-poc QRCodeDisplay 이식).
 *
 * ⚠️ QR 에는 **원문 credential 자체**를 담는다. URL(`/q/{token}`)로 감싸지 않는다:
 * 계약상 원문 **QR token 은 URL 금지**다 — path·query·fragment 어디에도 놓지 않고 스캔 대상
 * 픽셀로만 존재한다. (URL 로 감쌀 수 있는 토큰은 오직 **booking access token** 뿐이고, 그것도
 * SMS 개인 링크의 **fragment** 로만 허용된다 — QR token 과는 별개다.)
 * 스캐너는 원문 토큰을 그대로 받는다 (shared/lib/qrToken 의 extractQrToken 이 폴백 처리).
 *
 * 시크릿 규칙 (정확히):
 * - 앱은 원문 QR/토큰을 **자동으로 어디에도 남기지 않는다** — URL·localStorage/sessionStorage·
 *   쿠키·서버 상태·로그·파일명·클립보드 모두 금지. 토큰을 문자열로 화면에 찍지도 않는다.
 *   (참고: 아래 URL 복사 버튼은 **원문 토큰이 아니라** 안전한 예약 관리 URL
 *   `/booking/{familyBookingId}` 만 클립보드에 담는다 — 토큰은 관여하지 않는다.)
 * - 화면에 그리는 것은 QR **이미지**뿐이다. 원문은 **신규 생성 응답** 또는 **인증된 recovery
 *   GET** 을 통해서만 이 컴포넌트의 메모리로 들어온다.
 * - 사용자가 **직접 다운로드를 누른 경우에만** 그 캔버스를 PNG 로 내보낸다. 저장 위치는
 *   사용자가 정하고, 파일명은 식별자 없는 고정 문구다(아래 download 참고).
 * - 서버는 원문을 평문으로 두지 않지만 **AEAD 암호문과 digest 는 보존한다**. 따라서 인증된
 *   recovery GET 이 같은 원문을 다시 복원한다. **공개 재발급 API 는 없고**, 조회(recovery GET)는
 *   QR 버전을 회전시키지 않는다.
 *
 * 디자인시스템(shared/ui)의 QrBox(플레이스홀더)는 수정하지 않는다.
 */

import { useRef, useState, type CSSProperties } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { buildBookingManagementUrl, copyManagementUrl } from "../lib/booking-management-url";

export interface ReservationQrProps {
  /** 원문 QR credential — 그대로 인코딩한다. */
  qrToken: string;
  /** 요청 크기. 실제 렌더는 아래 최소치 밑으로 내려가지 않는다. */
  size?: number;
  /**
   * 지정 시 사용자가 직접 누르는 PNG 다운로드 버튼을 노출한다.
   * 반드시 식별자 없는 고정 문구를 넘긴다 — 예약 id·토큰·연락처·이름 금지.
   * 생략하면 버튼이 없고, 자동 저장은 어느 경우에도 일어나지 않는다.
   */
  downloadName?: string;
  /**
   * 지정 시(그리고 downloadName 도 있을 때) 안전한 예약 관리 URL 복사 버튼을 함께 노출한다.
   * ⚠️ 이 값은 FamilyBooking 식별자일 뿐이며 원문 QR 토큰이 아니다 — 복사되는 URL 은
   * `/booking/{familyBookingId}` 로, 토큰은 어디에도 들어가지 않는다.
   */
  familyBookingId?: string;
  style?: CSSProperties;
}

/** QR 인식률을 위해 전경/배경은 순수 흑백 고정 (다크모드·강제 색상에서도 유지) */
const QR_SURFACE: CSSProperties = { colorScheme: "only light", forcedColorAdjust: "none" };

/**
 * quiet zone 4모듈 — QR 사양이 요구하는 여백을 캔버스가 직접 그린다.
 * 바깥 CSS 패딩으로 대신하지 않는다: 캔버스를 다운로드·캡처해도 여백이 함께 남아야 한다.
 */
const QR_QUIET_ZONE_MODULES = 4;

/** 현장 스캐너가 실제로 읽으려면 필요한 최소 렌더 크기 — 하한으로 강제한다. */
export const MIN_SCANNABLE_QR_SIZE = 224;

/** 두 컨트롤(다운로드·복사)이 완전히 같은 버튼 형태를 공유하도록 하나의 스타일에서 파생한다. */
const ACTION_BUTTON_STYLE: CSSProperties = {
  height: 38,
  padding: "0 14px",
  borderRadius: "var(--radius-pill)",
  border: "none",
  background: "var(--violet-800)",
  color: "#FFFFFF",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "nowrap",
};

type CopyFeedback = { tone: "success" | "error"; message: string } | null;

export function ReservationQr({
  qrToken,
  size = MIN_SCANNABLE_QR_SIZE,
  downloadName,
  familyBookingId,
  style,
}: ReservationQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);

  // 호출부가 더 작은 값을 넘겨도 스캔 불가 크기로 내려가지 않는다.
  const renderSize = Math.max(size, MIN_SCANNABLE_QR_SIZE);

  /**
   * 사용자가 다운로드 버튼을 누른 경우에만 호출된다 — 자동 저장 경로가 아니다.
   * 내보내는 것은 캔버스 픽셀(PNG)이고 토큰 문자열이 아니다. blob URL 은 이 탭 안에서만
   * 유효하고 곧바로 revoke 하므로 주소로 남지 않는다.
   */
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      // 파일명은 호출부가 준 고정 라벨만 — 토큰·식별자를 파일명에 넣지 않는다.
      a.download = `${downloadName ?? "neulpureun-qr"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
    }, "image/png");
  };

  /**
   * 안전한 **예약 관리 URL**(`/booking/{familyBookingId}`)만 복사한다 — 원문 QR 토큰이 아니다.
   * 1차로 secure context 의 navigator.clipboard.writeText 를 쓰고, 불가/거부 시 화면 밖
   * textarea + execCommand 폴백을 시도한다. DOM 폴백은 이 클라이언트 컴포넌트에 국소화한다.
   */
  const copyManagementUrlToClipboard = async () => {
    if (!familyBookingId) return;
    const url = buildBookingManagementUrl(window.location.origin, familyBookingId);

    const primary =
      window.isSecureContext && typeof navigator !== "undefined" && navigator.clipboard?.writeText
        ? (text: string) => navigator.clipboard.writeText(text)
        : undefined;

    const fallback = (text: string): boolean => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      // 화면 밖·읽기전용으로 담아 두고 곧바로 제거한다 — URL 이 화면에 노출되지 않는다.
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(textarea);
      return ok;
    };

    const ok = await copyManagementUrl(url, { primary, fallback });
    setCopyFeedback(
      ok
        ? { tone: "success", message: "예약 관리 링크를 복사했습니다." }
        : { tone: "error", message: "복사에 실패했습니다. 다시 시도해 주세요." },
    );
  };

  const showActions = Boolean(downloadName && familyBookingId);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 10, ...style }}>
      <div
        style={{
          width: renderSize,
          height: renderSize,
          background: "#FFFFFF",
          border: "1px solid var(--mint-200)",
          borderRadius: "var(--radius-xs)",
          boxSizing: "border-box",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...QR_SURFACE,
        }}
      >
        <QRCodeCanvas
          ref={canvasRef}
          value={qrToken}
          size={renderSize}
          level="M"
          marginSize={QR_QUIET_ZONE_MODULES}
          // qrcode.react 는 기본값(true)이면 여유 용량이 있을 때 오류 보정 레벨을 M 위로
          // 몰래 올린다. 기준을 M 으로 고정하기 위해 끈다 (qr-poc QRCodeDisplay 와 동일).
          boostLevel={false}
          fgColor="#000000"
          bgColor="#FFFFFF"
          aria-label="입장 QR 코드"
          style={{ display: "block", imageRendering: "pixelated", width: "100%", height: "100%" }}
        />
      </div>

      {showActions ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
            <button type="button" onClick={download} style={ACTION_BUTTON_STYLE}>
              QR 다운로드
            </button>
            <button
              type="button"
              onClick={copyManagementUrlToClipboard}
              aria-label="예약 관리 링크 URL 복사"
              style={ACTION_BUTTON_STYLE}
            >
              URL 복사
            </button>
          </div>
          <div
            role={copyFeedback?.tone === "error" ? "alert" : "status"}
            aria-live={copyFeedback?.tone === "error" ? "assertive" : "polite"}
            style={{
              minHeight: copyFeedback ? undefined : 0,
              fontSize: 11.5,
              fontWeight: 600,
              textAlign: "center",
              color: copyFeedback?.tone === "error" ? "var(--status-warning)" : "var(--text-muted)",
            }}
          >
            {copyFeedback?.message ?? ""}
          </div>
        </>
      ) : (
        downloadName && (
          <button type="button" onClick={download} style={ACTION_BUTTON_STYLE}>
            QR 다운로드
          </button>
        )
      )}
    </div>
  );
}
