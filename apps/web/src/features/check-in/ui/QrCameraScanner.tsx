"use client";

/**
 * 실카메라 QR 스캐너 — qr-poc `QRScanner.tsx` 이식 (pinned c4194a0, fix/scanner-final).
 * 스타일만 npr 디자인 토큰으로 옮기고 카메라 동작은 원본 기준을 그대로 따른다.
 *
 * 이식하지 않는 것: 원본의 서버 액션·DB·토큰 저장. 이 컴포넌트는 디코드한 문자열을
 * onScan 으로 넘길 뿐이고, 검증은 호출부가 계약 API 로 한다.
 *
 * ── 카메라 불변식 (깨뜨리면 iOS 인식률이 무너진다) ────────────────────────────
 * 1. 방향과 해상도(1440×1080 4:3)를 **시작 시점에 한 번** 요청한다.
 *    시작 후 applyConstraints 로 해상도를 바꾸면 iOS Safari 가 스트림을 16:9 로
 *    재협상해 디코드 품질이 나빠진다. → 해상도 재협상 코드는 여기 없다.
 * 2. `disableFlip: true` 고정. 스트림은 미러되어 들어오지 않으므로(전면 프리뷰 미러는
 *    CSS 표시 전용) 반전 프레임 재디코드는 낭비다. 끄면 프레임당 디코드가 1회로 줄어
 *    iOS zxing 폴백의 실효 스캔 횟수가 2배가 된다.
 * 3. 주입된 video 에 width/height/object-fit 을 강제하지 않는다. 표시 크기를 CSS 로
 *    강제하면 라이브러리가 표시/원본 비율을 축별로 곱해 만드는 디코드 캔버스가
 *    비등방 압축되어 iOS(zxing 폴백)에서 인식이 깨진다. 원본 종횡비를 보존한다.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode, Html5QrcodeCameraScanConfig } from "html5-qrcode";

export interface QrCameraScannerProps {
  onScan: (decodedText: string) => void;
  preferRearCamera?: boolean;
}

type ScannerStatus = "loading" | "active" | "error";

type TorchCapability = {
  isSupported: () => boolean;
  apply: (value: boolean) => Promise<void>;
  value: () => boolean | null;
};

// iPad/태블릿 전면 카메라는 고정 초점 광각이라 QR 이 작고 흐리게 잡힌다.
// 터치 기기에서만 살짝 확대해 디코더가 읽을 픽셀을 확보한다. (Mac 은 정상이라 제외)
const FRONT_CAMERA_TARGET_ZOOM = 2;
const isTouchDevice = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;

/**
 * 카메라 방향과 해상도를 스캔 시작 시점에 한 번에 요청한다.
 * 1440×1080(4:3)은 대부분 카메라 센서의 네이티브 비율이라 수용률이 높고,
 * 같은 폭에서 16:9 보다 스캔 영역이 넓어 iOS 의 zxing 폴백 디코더에 유리하다.
 */
function buildVideoConstraints(preferRearCamera: boolean): MediaTrackConstraints {
  return {
    facingMode: preferRearCamera ? { exact: "environment" } : "user",
    width: { ideal: 1440 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  };
}

function buildScanConfig(preferRearCamera: boolean): Html5QrcodeCameraScanConfig {
  return {
    fps: 20,
    disableFlip: true,
    videoConstraints: buildVideoConstraints(preferRearCamera),
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const shortestEdge = Math.min(viewfinderWidth, viewfinderHeight);
      const maxSize = Math.max(120, shortestEdge - 24);
      const preferredSize = Math.max(220, Math.floor(shortestEdge * 0.78));
      const size = Math.min(maxSize, preferredSize);

      return { width: size, height: size };
    },
  };
}

/**
 * 초점·줌만 조정한다 — 해상도는 절대 건드리지 않는다.
 * (focusMode/zoom 은 스트림 비율 재협상을 일으키지 않는다.)
 */
async function tuneCameraForScanning(scanner: Html5Qrcode, shouldApplyTouchZoom: boolean) {
  // 연속 초점을 지원하는 기기에서는 오토포커스를 켠다.
  try {
    const capabilities = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
      focusMode?: string[];
    };
    if (capabilities.focusMode?.includes("continuous")) {
      await scanner.applyVideoConstraints({
        advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
      });
    }
  } catch {
    // 초점 제어를 지원하지 않는 브라우저는 무시한다.
  }

  if (!isTouchDevice || !shouldApplyTouchZoom) return;

  // 고정 초점 전면 카메라에서 QR 확대를 위해 줌을 적용한다.
  try {
    const zoom = scanner.getRunningTrackCameraCapabilities().zoomFeature();
    if (zoom.isSupported()) {
      const target = Math.min(FRONT_CAMERA_TARGET_ZOOM, zoom.max());
      if (target > (zoom.value() ?? 1)) {
        await zoom.apply(target);
      }
    }
  } catch {
    // 줌 미지원 기기는 기본 배율로 계속 진행한다.
  }
}

async function stopScanner(scanner: Html5Qrcode) {
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
    scanner.clear();
  } catch {
    // 카메라 해제는 라우트 전환·권한 프롬프트와 경합할 수 있다.
  }
}

function getCameraErrorMessage(error: unknown, preferRearCamera: boolean) {
  const cameraLabel = preferRearCamera ? "후면" : "전면";

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "카메라 권한을 허용한 뒤 다시 요청해 주세요.";
    }

    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return `${cameraLabel} 카메라를 찾을 수 없습니다.`;
    }
  }

  return `카메라 권한 또는 ${cameraLabel} 카메라 상태를 확인해 주세요.`;
}

/** 카메라 위 오버레이 칩 버튼 — 다크 배경 공용 */
const chipStyle: React.CSSProperties = {
  borderRadius: "var(--radius-pill)",
  background: "rgba(10,15,26,0.65)",
  border: "none",
  color: "var(--gray-1)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  padding: "7px 12px",
  backdropFilter: "blur(4px)",
};

export function QrCameraScanner({ onScan, preferRearCamera = false }: QrCameraScannerProps) {
  const generatedId = useId();
  const previewId = `qr-preview-${generatedId.replaceAll(":", "")}`;
  const onScanRef = useRef(onScan);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const torchCapabilityRef = useRef<TorchCapability | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchChanging, setTorchChanging] = useState(false);
  const [startAttempt, setStartAttempt] = useState(0);
  // ?scanDebug 로 접속하면 기기 현장 검증용 진단 정보를 표시한다.
  const [debugEnabled] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("scanDebug"),
  );
  const [debugInfo, setDebugInfo] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      try {
        setStatus("loading");
        setErrorMsg("");
        setTorchSupported(false);
        setTorchOn(false);

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Html5Qrcode(previewId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
        });
        scannerRef.current = scanner;

        await scanner.start(
          // config.videoConstraints 가 유효하면 라이브러리는 getUserMedia 에 그 값을 쓰고
          // 이 인자는 무시한다. (폴백 겸 형식상 필수 인자)
          { facingMode: preferRearCamera ? { exact: "environment" } : "user" },
          buildScanConfig(preferRearCamera),
          (text) => onScanRef.current(text),
          () => {},
        );

        if (cancelled) {
          await stopScanner(scanner);
          return;
        }

        await tuneCameraForScanning(scanner, !preferRearCamera);

        try {
          const torchCapability = scanner
            .getRunningTrackCameraCapabilities()
            .torchFeature() as TorchCapability;
          if (torchCapability.isSupported()) {
            torchCapabilityRef.current = torchCapability;
            setTorchSupported(true);
            setTorchOn(Boolean(torchCapability.value()));
          }
        } catch {
          torchCapabilityRef.current = null;
          setTorchSupported(false);
        }

        setStatus("active");
      } catch (error) {
        if (!cancelled) {
          const scanner = scannerRef.current;
          scannerRef.current = null;
          torchCapabilityRef.current = null;
          setTorchSupported(false);
          setTorchOn(false);
          if (scanner) await stopScanner(scanner);

          setStatus("error");
          setErrorMsg(getCameraErrorMessage(error, preferRearCamera));
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      torchCapabilityRef.current = null;
      setTorchSupported(false);
      setTorchOn(false);
      if (scanner) void stopScanner(scanner);
    };
  }, [preferRearCamera, previewId, startAttempt]);

  // 현장 진단 — 원본·표시·track 해상도와 디코더 경로를 노출한다.
  useEffect(() => {
    if (!debugEnabled || status !== "active") return;

    const timer = window.setInterval(() => {
      const video = document.getElementById(previewId)?.querySelector("video");
      if (!video) return;

      let trackInfo = "";
      try {
        const settings = scannerRef.current?.getRunningTrackSettings();
        if (settings) {
          const fps = settings.frameRate ? Math.round(settings.frameRate) : "?";
          trackInfo = ` | track ${settings.width ?? "?"}x${settings.height ?? "?"}@${fps}fps`;
        }
      } catch {
        // 스캐너 전환 중에는 트랙 정보를 읽을 수 없다.
      }

      const decoder = "BarcodeDetector" in window ? "native+zxing" : "zxing";
      setDebugInfo(
        `${decoder} | video ${video.videoWidth}x${video.videoHeight}` +
          ` | view ${video.clientWidth}x${video.clientHeight}${trackInfo}`,
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [debugEnabled, status, previewId]);

  const handleToggleTorch = useCallback(async () => {
    const torchCapability = torchCapabilityRef.current;
    if (!torchCapability || torchChanging) return;

    const nextValue = !torchOn;
    setTorchChanging(true);
    try {
      await torchCapability.apply(nextValue);
      setTorchOn(nextValue);
    } catch {
      setTorchSupported(false);
      torchCapabilityRef.current = null;
    } finally {
      setTorchChanging(false);
    }
  }, [torchChanging, torchOn]);

  const handleRetryCamera = useCallback(() => {
    setStartAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        background: "#000000",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        minHeight: status === "active" ? undefined : 280,
      }}
    >
      {/*
        주입된 video 에는 전면 미러(표시 전용) transform 만 건다.
        width/height/object-fit 을 주면 디코드 캔버스가 찌그러진다 — 위 불변식 3.
      */}
      <style>{`
        #${previewId} video { display: block; ${preferRearCamera ? "" : "transform: scaleX(-1);"} }
        @keyframes npr-camera-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div id={previewId} />

      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(10,15,26,0.7)" }}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(248,250,252,0.25)", borderTopColor: "var(--gray-1)", animation: "npr-camera-spin 0.9s linear infinite" }} />
          <p style={{ margin: 0, color: "rgba(248,250,252,0.75)", fontSize: 13 }}>카메라 시작 중...</p>
        </div>
      )}

      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(10,15,26,0.85)", padding: 24, textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--gray-1)", fontWeight: 700, fontSize: 15 }}>카메라 권한 필요</p>
          <p role="alert" style={{ margin: 0, color: "rgba(248,250,252,0.6)", fontSize: 12.5, lineHeight: 1.6 }}>
            {errorMsg}
          </p>
          <button
            type="button"
            onClick={handleRetryCamera}
            style={{ marginTop: 10, padding: "9px 16px", borderRadius: "var(--radius-pill)", border: "none", background: "var(--gray-1)", color: "var(--ink-900)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            카메라 다시 요청
          </button>
        </div>
      )}

      {/* 스캔 영역 마커 — 오버레이만 정사각이고 video 에는 영향을 주지 않는다 */}
      {status === "active" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ position: "relative", aspectRatio: "1 / 1", height: "min(74%, 320px)" }}>
            {[
              { top: 0, left: 0, borderRadius: "10px 0 0 0", borderTop: true, borderLeft: true },
              { top: 0, right: 0, borderRadius: "0 10px 0 0", borderTop: true, borderRight: true },
              { bottom: 0, left: 0, borderRadius: "0 0 0 10px", borderBottom: true, borderLeft: true },
              { bottom: 0, right: 0, borderRadius: "0 0 10px 0", borderBottom: true, borderRight: true },
            ].map((c, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  top: c.top,
                  left: c.left,
                  right: c.right,
                  bottom: c.bottom,
                  width: 32,
                  height: 32,
                  borderRadius: c.borderRadius,
                  borderTop: c.borderTop ? "3px solid var(--mint-500)" : "none",
                  borderBottom: c.borderBottom ? "3px solid var(--mint-500)" : "none",
                  borderLeft: c.borderLeft ? "3px solid var(--mint-500)" : "none",
                  borderRight: c.borderRight ? "3px solid var(--mint-500)" : "none",
                }}
              />
            ))}
            <span className="npr-scanline" />
          </div>
        </div>
      )}

      {status === "active" && torchSupported && (
        <button
          type="button"
          onClick={handleToggleTorch}
          disabled={torchChanging}
          style={{ ...chipStyle, position: "absolute", right: 10, top: 10, opacity: torchChanging ? 0.55 : 1 }}
        >
          {torchOn ? "조명 끄기" : "조명 켜기"}
        </button>
      )}

      {debugEnabled && status === "active" && debugInfo && (
        <p style={{ position: "absolute", left: 8, top: 8, margin: 0, borderRadius: "var(--radius-xs)", background: "rgba(10,15,26,0.7)", padding: "4px 8px", fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#BEF264" }}>
          {debugInfo}
        </p>
      )}

      {status === "active" && (
        <p style={{ position: "absolute", bottom: 10, left: 0, right: 0, margin: 0, textAlign: "center", color: "rgba(248,250,252,0.7)", fontSize: 12 }}>
          {isTouchDevice
            ? "QR을 20~30cm 정도 떨어뜨려 사각형 안에 맞춰주세요"
            : "QR 코드를 사각형 안에 크게 맞춰주세요"}
        </p>
      )}
    </div>
  );
}
