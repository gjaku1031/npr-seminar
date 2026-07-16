"use client";

/**
 * 실카메라 QR 스캐너 (명세 §9.2 실서비스 전환) — qr-poc QRScanner 이식.
 * html5-qrcode 카메라 스트림 위에 스캔영역(정사각, min(82%, 360px)) 코너 마커·스캔라인을 얹는다.
 *
 * qr-poc에서 검증된 카메라 튜닝을 그대로 가져왔다:
 * - iPad/태블릿 전면 카메라는 고정 초점 광각이라 터치 기기에서만 줌을 살짝 올려 디코더 픽셀 확보
 * - continuous focus/exposure/whiteBalance + 중앙 관심점, 후면 카메라 폴백, 토치·수동 초점 버튼
 * 스타일만 npr 디자인 토큰으로 교체 — 디자인시스템(shared/ui)은 수정하지 않는다.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode, Html5QrcodeCameraScanConfig } from "html5-qrcode";

type Props = {
  onScan: (decodedText: string) => void;
  preferRearCamera?: boolean;
};

type ScannerStatus = "loading" | "active" | "error";
type TorchCapability = {
  isSupported: () => boolean;
  apply: (value: boolean) => Promise<void>;
  value: () => boolean | null;
};

type RangeCameraCapability = {
  isSupported: () => boolean;
  apply: (value: number) => Promise<void>;
  value: () => number | null;
  min: () => number;
  max: () => number;
  step: () => number;
};

type FocusTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  exposureMode?: string[];
  pointsOfInterest?: Array<{ x: number; y: number }>;
  whiteBalanceMode?: string[];
};

type CameraTuningConstraint = "exposureMode" | "focusMode" | "whiteBalanceMode";

const CAMERA_QUALITY_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30, max: 30 },
};

const FRONT_CAMERA_START_CONSTRAINTS: MediaTrackConstraints = { facingMode: "user" };
const REAR_CAMERA_START_CONSTRAINTS: MediaTrackConstraints = { facingMode: { exact: "environment" } };
const REAR_CAMERA_FALLBACK_CONSTRAINTS: MediaTrackConstraints = { facingMode: "environment" };

// iPad/태블릿 전면 카메라는 고정 초점 광각이라 QR이 작고 흐리게 잡힌다.
// 터치 기기에서만 살짝 확대해 디코더가 읽을 픽셀을 확보한다. (Mac은 정상이라 제외)
const FRONT_CAMERA_TARGET_ZOOM = 2;
const REAR_CAMERA_TARGET_ZOOM = 1.6;
const REAR_CAMERA_FOCUS_SETTLE_MS = 180;
const ZOOM_NUDGE_SETTLE_MS = 120;
const ZOOM_EPSILON = 0.01;
const isTouchDevice = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;

/** 폰은 후면, 태블릿·PC는 전면(거치대에서 방문자를 향함) — qr-poc 기기 감지 이식 */
export function detectPreferRearCamera(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return true;
  if (/Android.*Mobile/i.test(ua)) return true;
  return false;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getZoomCapability(scanner: Html5Qrcode): RangeCameraCapability | null {
  try {
    const zoom = scanner.getRunningTrackCameraCapabilities().zoomFeature() as RangeCameraCapability;
    return zoom.isSupported() ? zoom : null;
  } catch {
    return null;
  }
}

async function applyCameraTuningConstraint(
  scanner: Html5Qrcode,
  capabilities: FocusTrackCapabilities,
  constraint: CameraTuningConstraint,
  value: string,
) {
  if (!capabilities[constraint]?.includes(value)) return false;

  try {
    await scanner.applyVideoConstraints({
      advanced: [{ [constraint]: value } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

async function applyFocusMode(scanner: Html5Qrcode, focusMode: string) {
  try {
    await scanner.applyVideoConstraints({
      advanced: [{ focusMode } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

async function applyCenterPointOfInterest(scanner: Html5Qrcode) {
  try {
    await scanner.applyVideoConstraints({
      advanced: [{ pointsOfInterest: [{ x: 0.5, y: 0.5 }] } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

async function applyContinuousCameraTuning(scanner: Html5Qrcode) {
  try {
    const capabilities = scanner.getRunningTrackCapabilities() as FocusTrackCapabilities;
    let applied = false;

    applied =
      (await applyCameraTuningConstraint(scanner, capabilities, "focusMode", "continuous")) || applied;
    applied =
      (await applyCameraTuningConstraint(scanner, capabilities, "exposureMode", "continuous")) ||
      applied;
    applied =
      (await applyCameraTuningConstraint(scanner, capabilities, "whiteBalanceMode", "continuous")) ||
      applied;
    applied = (await applyCenterPointOfInterest(scanner)) || applied;

    return applied;
  } catch {
    return false;
  }
}

async function applyCameraZoom(scanner: Html5Qrcode, targetZoom: number) {
  const zoom = getZoomCapability(scanner);
  if (!zoom) return false;

  const target = clamp(targetZoom, zoom.min(), zoom.max());
  if (target <= (zoom.value() ?? 1) + ZOOM_EPSILON) return false;

  await zoom.apply(target);
  return true;
}

async function nudgeCameraZoom(scanner: Html5Qrcode, targetZoom: number) {
  const zoom = getZoomCapability(scanner);
  if (!zoom) return false;

  const min = zoom.min();
  const max = zoom.max();
  const current = clamp(zoom.value() ?? 1, min, max);
  const target = clamp(Math.max(targetZoom, current), min, max);

  if (Math.abs(target - current) > ZOOM_EPSILON) {
    await zoom.apply(target);
    return true;
  }

  const step = Math.max(zoom.step() || 0.1, 0.1);
  const bumped =
    current + step <= max ? current + step : current - step >= min ? current - step : current;

  if (Math.abs(bumped - current) <= ZOOM_EPSILON) return false;

  await zoom.apply(bumped);
  await wait(ZOOM_NUDGE_SETTLE_MS);
  await zoom.apply(current);
  return true;
}

async function tuneCameraForScanning(
  scanner: Html5Qrcode,
  zoomTarget: number | null,
  shouldSettleAfterZoom: boolean,
) {
  await applyContinuousCameraTuning(scanner);

  if (!isTouchDevice || zoomTarget === null) return;

  // 모바일 카메라에서 QR 확대를 위해 줌을 적용한다.
  try {
    const zoomApplied = await applyCameraZoom(scanner, zoomTarget);
    if (zoomApplied && shouldSettleAfterZoom) {
      await wait(REAR_CAMERA_FOCUS_SETTLE_MS);
      await applyContinuousCameraTuning(scanner);
    }
  } catch {
    // 줌 미지원 기기는 기본 배율로 계속 진행한다.
  }
}

function isCameraSelectionError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "OverconstrainedError")
  );
}

async function startScannerWithConstraints(
  scanner: Html5Qrcode,
  constraints: MediaTrackConstraints,
  scanConfig: Html5QrcodeCameraScanConfig,
  onScan: (decodedText: string) => void,
) {
  await scanner.start(constraints, scanConfig, onScan, () => {});
}

async function requestCameraRefocus(scanner: Html5Qrcode, zoomTarget: number | null) {
  let applied = await applyContinuousCameraTuning(scanner);

  try {
    const capabilities = scanner.getRunningTrackCapabilities() as FocusTrackCapabilities;
    const focusModes = capabilities.focusMode ?? [];

    if (focusModes.includes("single-shot")) {
      applied = (await applyFocusMode(scanner, "single-shot")) || applied;
    }

    if (focusModes.includes("continuous")) {
      applied = (await applyFocusMode(scanner, "continuous")) || applied;
    }
  } catch {
    // 일부 모바일 브라우저는 초점 제어를 지원하지 않는다.
  }

  if (zoomTarget !== null) {
    try {
      applied = (await nudgeCameraZoom(scanner, zoomTarget)) || applied;
      await wait(REAR_CAMERA_FOCUS_SETTLE_MS);
      applied = (await applyContinuousCameraTuning(scanner)) || applied;
    } catch {
      // 줌 넛지는 best-effort.
    }
  }

  return applied;
}

/** 스캔영역 — 뷰파인더 짧은 변의 82% (최소 220 · 여백 20 확보), qr-poc 검증값 */
function createScanConfig(preferRearCamera: boolean): Html5QrcodeCameraScanConfig {
  return {
    fps: preferRearCamera && isTouchDevice ? 15 : 20,
    disableFlip: preferRearCamera,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const shortestEdge = Math.min(viewfinderWidth, viewfinderHeight);
      const maxSize = Math.max(120, shortestEdge - 20);
      const preferredSize = Math.max(220, Math.floor(shortestEdge * 0.82));
      const size = Math.min(maxSize, preferredSize);

      return { width: size, height: size };
    },
  };
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

export function QrCameraScanner({ onScan, preferRearCamera = false }: Props) {
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
  const [refocusing, setRefocusing] = useState(false);
  const [refocusMessage, setRefocusMessage] = useState("");
  const [startAttempt, setStartAttempt] = useState(0);
  const refocusMessageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const showRefocusMessage = useCallback((message: string) => {
    setRefocusMessage(message);

    if (refocusMessageTimerRef.current !== null) {
      window.clearTimeout(refocusMessageTimerRef.current);
    }

    refocusMessageTimerRef.current = window.setTimeout(() => {
      setRefocusMessage("");
      refocusMessageTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function runScanner() {
      try {
        setStatus("loading");
        setErrorMsg("");
        setTorchSupported(false);
        setTorchOn(false);
        setRefocusing(false);
        setRefocusMessage("");

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Html5Qrcode(previewId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
        });
        scannerRef.current = scanner;

        const cameraStartConstraints = preferRearCamera
          ? REAR_CAMERA_START_CONSTRAINTS
          : FRONT_CAMERA_START_CONSTRAINTS;
        const scanConfig = createScanConfig(preferRearCamera);

        try {
          await startScannerWithConstraints(scanner, cameraStartConstraints, scanConfig, (text) =>
            onScanRef.current(text),
          );
        } catch (error) {
          if (!preferRearCamera || !isCameraSelectionError(error)) throw error;

          await startScannerWithConstraints(scanner, REAR_CAMERA_FALLBACK_CONSTRAINTS, scanConfig, (text) =>
            onScanRef.current(text),
          );
        }

        if (cancelled) {
          await stopScanner(scanner);
          return;
        }

        try {
          await scanner.applyVideoConstraints(CAMERA_QUALITY_CONSTRAINTS);
        } catch {
          // 일부 Android WebView는 권한 후 화질 상향을 거부한다 — 브라우저 선택 설정으로 계속.
        }

        const zoomTarget = preferRearCamera ? REAR_CAMERA_TARGET_ZOOM : FRONT_CAMERA_TARGET_ZOOM;
        await tuneCameraForScanning(scanner, zoomTarget, preferRearCamera);

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
          setRefocusing(false);
          if (scanner) await stopScanner(scanner);

          setStatus("error");
          setErrorMsg(getCameraErrorMessage(error, preferRearCamera));
        }
      }
    }

    runScanner();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      torchCapabilityRef.current = null;
      setTorchSupported(false);
      setTorchOn(false);
      setRefocusing(false);
      if (refocusMessageTimerRef.current !== null) {
        window.clearTimeout(refocusMessageTimerRef.current);
        refocusMessageTimerRef.current = null;
      }
      if (scanner) void stopScanner(scanner);
    };
  }, [preferRearCamera, previewId, startAttempt]);

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

  const handleRefocusCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner || refocusing) return;

    setRefocusing(true);
    try {
      const applied = await requestCameraRefocus(
        scanner,
        preferRearCamera ? REAR_CAMERA_TARGET_ZOOM : FRONT_CAMERA_TARGET_ZOOM,
      );
      showRefocusMessage(applied ? "초점을 다시 맞췄어요." : "이 브라우저는 수동 초점을 지원하지 않아요.");
    } catch {
      showRefocusMessage("초점 재조정에 실패했어요.");
    } finally {
      setRefocusing(false);
    }
  }, [preferRearCamera, refocusing, showRefocusMessage]);

  const handleRetryCamera = useCallback(() => {
    setStartAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <div style={{ position: "relative", background: "#000000", borderRadius: "var(--radius-lg)", overflow: "hidden", aspectRatio: "1 / 1" }}>
      {/* 주입되는 video의 채움·미러링 — globals.css(디자인 토큰)를 건드리지 않는 스코프 스타일 */}
      <style>{`
        #${previewId} video { width: 100%; height: 100%; object-fit: cover; ${preferRearCamera ? "" : "transform: scaleX(-1);"} }
        @keyframes npr-camera-spin { to { transform: rotate(360deg); } }
      `}</style>
      {/* html5-qrcode가 여기에 video 엘리먼트를 주입한다 */}
      <div id={previewId} style={{ width: "100%", height: "100%" }} />

      {/* 로딩 오버레이 */}
      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(10,15,26,0.7)" }}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(248,250,252,0.25)", borderTopColor: "var(--gray-1)", animation: "npr-camera-spin 0.9s linear infinite" }} />
          <p style={{ margin: 0, color: "rgba(248,250,252,0.75)", fontSize: 13 }}>카메라 시작 중...</p>
        </div>
      )}

      {/* 오류 오버레이 — 권한 거부·카메라 없음 */}
      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(10,15,26,0.85)", padding: 24, textAlign: "center" }}>
          <span style={{ fontSize: 34 }}>📷</span>
          <p style={{ margin: 0, color: "var(--gray-1)", fontWeight: 700, fontSize: 15 }}>카메라 권한 필요</p>
          <p style={{ margin: 0, color: "rgba(248,250,252,0.6)", fontSize: 12.5, lineHeight: 1.6 }}>{errorMsg}</p>
          <button
            type="button"
            onClick={handleRetryCamera}
            style={{ marginTop: 10, padding: "9px 16px", borderRadius: "var(--radius-pill)", border: "none", background: "var(--gray-1)", color: "var(--ink-900)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            카메라 다시 요청
          </button>
        </div>
      )}

      {/* 스캔영역 마커 — 짧은 변 82%·최대 360px (qr-poc 스캔영역 사이즈) + 스캔라인 */}
      {status === "active" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ position: "relative", aspectRatio: "1 / 1", width: "min(82%, 360px)" }}>
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
                  width: 34,
                  height: 34,
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

      {status === "active" && (
        <button type="button" onClick={handleRefocusCamera} disabled={refocusing} aria-label="카메라 초점 재조정" style={{ ...chipStyle, position: "absolute", left: 10, top: 10, opacity: refocusing ? 0.55 : 1 }}>
          {refocusing ? "초점 조정 중" : "초점 맞추기"}
        </button>
      )}

      {status === "active" && torchSupported && (
        <button type="button" onClick={handleToggleTorch} disabled={torchChanging} style={{ ...chipStyle, position: "absolute", right: 10, top: 10, opacity: torchChanging ? 0.55 : 1 }}>
          {torchOn ? "조명 끄기" : "조명 켜기"}
        </button>
      )}

      {status === "active" && refocusMessage && (
        <p aria-live="polite" style={{ position: "absolute", left: 10, top: 52, margin: 0, maxWidth: "calc(100% - 20px)", borderRadius: "var(--radius-sm)", background: "rgba(10,15,26,0.65)", padding: "6px 10px", fontSize: 11.5, color: "rgba(248,250,252,0.85)", backdropFilter: "blur(4px)" }}>
          {refocusMessage}
        </p>
      )}

      {/* 하단 안내 */}
      {status === "active" && (
        <p style={{ position: "absolute", bottom: 10, left: 0, right: 0, margin: 0, textAlign: "center", color: "rgba(248,250,252,0.7)", fontSize: 12 }}>
          {isTouchDevice ? "QR을 20~30cm 정도 떨어뜨려 사각형 안에 맞춰주세요" : "문자로 받은 QR을 사각형 안에 크게 맞춰주세요"}
        </p>
      )}
    </div>
  );
}
