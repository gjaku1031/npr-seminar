"use client";

/**
 * iPad 스캐너 (공개 라우트 `/scanner/connect`).
 *
 * 흐름: 세션 확인 → (없으면) 6자리 코드 입력 → SCANNER 세션 → 회차 잠금 → 스캔.
 *
 * 경계:
 * - ADMIN 기능(기기 목록·코드 발급·타 기기 해제)은 이 화면에 없다.
 * - 서버 DB/서비스에 직접 접근하지 않는다. 전부 계약 API 다.
 * - 세션은 HttpOnly 쿠키 — 토큰·세션·원문 코드를 웹 스토리지에 쓰지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { RefreshCw, Settings, Volume2, VolumeX, WifiOff } from "lucide-react";
import {
  BRANCH_LABELS,
  defaultErrorMessage,
  reconcileScannerUnpair,
  unpairCurrentScanner,
  useOperationKey,
  type ScannerDevice,
} from "@/shared/api";
// 격리된 하드 삭제 모듈의 순수 분류기 — 배럴에 없어 삭제 계열 헬퍼처럼 깊은 경로로 가져온다.
import { classifyUnpairError } from "@/shared/api/scanner-device-unpair";
import {
  getClientDeviceType,
  getServerDeviceType,
  prefersRearCamera,
  QrCameraScanner,
  subscribeToHydration,
} from "@/features/check-in";
import {
  AttendanceCountOverlay,
  CheckInResultOverlay,
  CheckInResultPanel,
  PairingCodeInput,
  panelSoundKind,
  ScannerManualPanel,
  ScannerShiftPanel,
  UnpairDeviceDialog,
  useCheckInSound,
  usePairingClaim,
  useQrCheckIn,
  useScannerHeartbeat,
  useScannerSession,
} from "@/features/scanner-session";

const PAGE_STYLES = `
  .npr-connect-scan {
    display: grid;
    /*
      카메라가 남는 폭을 전부 가져간다. 이 화면에서 실제로 오래 보는 것은 카메라이고,
      수동 입장은 QR 이 안 읽힐 때만 쓰는 보조 경로다. 예전에는 반대로 카메라가 430px 에
      묶이고 수동 패널이 1fr 로 늘어나 있었다.
      수동 패널은 3열 숫자패드가 눌리는 최소 폭(260px)만 지키고 300px 에서 멈춘다.
    */
    grid-template-columns: minmax(360px, 1fr) minmax(260px, 300px);
    gap: 18px;
    align-items: start;
    max-width: 1060px;
    margin: 0 auto;
    padding: 6px 20px 28px;
    width: 100%;
    box-sizing: border-box;
  }
  /* iPad 세로(834px) 이하는 카메라 위 / 수동 입장 아래 1열 */
  @media (max-width: 900px) {
    .npr-connect-scan { grid-template-columns: minmax(0, 1fr); }
  }
`;

export function ScannerConnectView() {
  const session = useScannerSession();
  const deviceType = useSyncExternalStore(subscribeToHydration, getClientDeviceType, getServerDeviceType);

  const paired = session.status === "paired";
  const locked = Boolean(session.shift?.locked);
  const heartbeat = useScannerHeartbeat(paired);
  const checkIn = useQrCheckIn(paired && locked);

  // 결과음 — QR·수동 모두 공용 패널(checkIn.panel)로 흘러오므로 여기 한 곳에서만 재생한다.
  const sound = useCheckInSound();
  const playSound = sound.play;
  useEffect(() => {
    // 패널 참조는 setPanel 로만 바뀐다 — 리렌더로는 이 효과가 재실행되지 않아 같은 결과가
    // 반복 재생되지 않는다. playSound 는 안정적 콜백이라 음소거 토글에도 되풀이되지 않는다.
    const kind = panelSoundKind(checkIn.panel);
    if (kind) playSound(kind);
  }, [checkIn.panel, playSound]);

  // 수동 조회·검증·처리 실패는 로컬 오류 상태에 머물러 공용 패널을 거치지 않는다.
  // 이 콜백으로 그런 실패마다 오류음을 한 번 울린다(값 인자 없음 — 민감 정보 차단).
  const handleManualError = useCallback(() => playSound("error"), [playSound]);

  /**
   * 인원 선택을 취소하면 **입장이 되지 않았다는 사실**을 말해 줘야 한다. 오버레이가 그냥
   * 사라지면 스태프는 처리가 끝난 것으로 읽는다.
   */
  const [partyNotice, setPartyNotice] = useState(false);
  const partyNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (partyNoticeTimer.current !== null) clearTimeout(partyNoticeTimer.current); }, []);
  const handlePartyCancel = useCallback(() => {
    checkIn.cancelParty();
    setPartyNotice(true);
    if (partyNoticeTimer.current !== null) clearTimeout(partyNoticeTimer.current);
    partyNoticeTimer.current = setTimeout(() => setPartyNotice(false), 4000);
  }, [checkIn]);

  // 이미 페어링 + 회차 잠금까지 끝난 채로 진입하면(예: 새로고침) 페어링·회차 시작 클릭이 없어
  // 결과음 AudioContext 가 잠긴 채 남는다. 그럴 때 다음 사용자 제스처(포인터·키) **한 번의 콜스택
  // 안에서** 잠금을 푼다 — unlock 을 효과에서가 아니라 실제 이벤트 콜백에서 호출한다.
  // 한 번 풀리면 두 리스너를 즉시 떼어 반복 실행·전역 리스너 누수를 막는다. "소리 켜기" 버튼은
  // 그대로 대체 수단으로 남는다.
  const soundReady = sound.ready;
  const unlockSound = sound.unlock;
  useEffect(() => {
    if (!paired || !locked || soundReady) return;
    const handle = () => {
      unlockSound();
      window.removeEventListener("pointerdown", handle, true);
      window.removeEventListener("keydown", handle, true);
    };
    window.addEventListener("pointerdown", handle, { capture: true });
    window.addEventListener("keydown", handle, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", handle, true);
      window.removeEventListener("keydown", handle, true);
    };
  }, [paired, locked, soundReady, unlockSound]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unpairing, setUnpairing] = useState(false);
  const [unpairError, setUnpairError] = useState<string | null>(null);
  const unpairKey = useOperationKey();

  // 세션이 서버에서 무효화되면(관리자 해제 등) 로컬 스캐너 UI 를 즉시 되돌린다.
  useEffect(() => {
    if (heartbeat.sessionLost) {
      session.clear();
      checkIn.reset();
    }
    // session/checkIn 은 안정적인 콜백만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heartbeat.sessionLost]);

  const handlePaired = useCallback(
    (device: ScannerDevice) => {
      session.adoptDevice(device);
      // 방금 만든 SCANNER 세션의 shift 상태를 서버에서 확인한다.
      session.refresh();
    },
    [session],
  );

  const claim = usePairingClaim({
    deviceName: deviceType === "iPad" ? "iPad 스캐너" : `${deviceType} 스캐너`,
    onPaired: handlePaired,
    // 결과 미상 복구 중 이미 페어링돼 있었음이 확인된 경우 — 서버 왕복 없이 채택한다.
    onReconciled: session.adopt,
  });

  // 페어링을 시작하는 이 제스처(Enter·"연결하기") 안에서 결과음 AudioContext 를 푼다 —
  // iPad/Safari 는 소리를 실제 클릭 콜스택에서만 풀 수 있어 효과가 아니라 핸들러에서 부른다.
  // unlock 은 멱등(이미 running 이면 무해)이고, claim.submit 의 멱등 재시도 의미도 건드리지 않는다.
  // (unlockSound 는 위 제스처-잠금해제 효과와 같은 sound.unlock 참조다.)
  const claimSubmit = claim.submit;
  const handleClaimSubmit = useCallback(() => {
    unlockSound();
    void claimSubmit();
  }, [unlockSound, claimSubmit]);

  /**
   * 해제 성공 확정 — 로컬 스캐너 UI 를 전부 비우고 코드 입력으로 돌아간다.
   * (CSRF 토큰은 `unpairCurrentScanner` 가 어느 경로에서든 이미 폐기한다.)
   */
  const finishUnpair = useCallback(() => {
    unpairKey.settle();
    setSettingsOpen(false);
    setUnpairError(null);
    checkIn.reset();
    session.clear();
  }, [unpairKey, checkIn, session]);

  const handleUnpair = useCallback(async () => {
    setUnpairing(true);
    setUnpairError(null);

    try {
      await unpairCurrentScanner({ idempotencyKey: unpairKey.current() });
      finishUnpair();
    } catch (caught) {
      const disposition = classifyUnpairError(caught);

      // 401/403 = SCANNER 세션이 이미 무효/삭제됐다(관리자가 먼저 삭제했거나 성공 응답이
      // 유실됐거나). DELETE 자신이 이걸 돌려줬다면 이 기기는 이미 해제된 것 — 되묻지 않고
      // 성공으로 마무리해 로컬 스캐너 상태를 비운다.
      if (disposition === "already-unpaired") {
        finishUnpair();
        return;
      }

      if (disposition === "definitive-failure") {
        unpairKey.settle(caught);
        setUnpairError(defaultErrorMessage(caught));
        return;
      }

      // 결과 미상(네트워크·5xx) — 서버가 이미 해제했을 수 있다.
      // 실패라고 말하기 전에 세션이 실제로 살아 있는지 되묻는다.
      const reconciliation = await reconcileScannerUnpair();

      if (reconciliation === "unpaired") {
        // 세션이 사라졌다 = 해제가 적용됐다. 사용자에겐 성공이다.
        finishUnpair();
        return;
      }

      // 아직 페어링돼 있거나 확인 실패 — 같은 키를 유지하고 재시도를 제공한다.
      // 성공을 주장하지 않는다.
      unpairKey.settle(caught);
      setUnpairError(
        reconciliation === "still-paired"
          ? "해제가 적용되지 않았어요. 다시 시도해 주세요."
          : "해제 결과를 확인하지 못했어요. 연결이 회복되면 다시 시도해 주세요.",
      );
    } finally {
      setUnpairing(false);
    }
  }, [unpairKey, finishUnpair]);

  /* ── 세션 확인 중 ── */
  if (session.status === "checking") {
    return (
      <Shell>
        <p style={{ color: "rgba(248,250,252,0.62)", fontSize: 14 }}>연결 상태를 확인하는 중이에요.</p>
      </Shell>
    );
  }

  /* ── 확인 실패 ── */
  if (session.status === "error") {
    return (
      <Shell>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <WifiOff size={30} aria-hidden="true" style={{ color: "rgba(248,250,252,0.5)" }} />
          <p role="alert" style={{ margin: "12px 0 0", color: "var(--gray-1)", fontSize: 15, fontWeight: 700 }}>
            연결 상태를 확인하지 못했어요
          </p>
          <p style={{ margin: "6px 0 0", color: "rgba(248,250,252,0.62)", fontSize: 13, lineHeight: 1.6 }}>
            {session.error}
          </p>
          <button type="button" onClick={session.refresh} style={retryButtonStyle}>
            <RefreshCw size={14} aria-hidden="true" /> 다시 시도
          </button>
        </div>
      </Shell>
    );
  }

  /* ── 코드 입력 ── */
  if (session.status === "unpaired") {
    return (
      <Shell>
        <div style={{ width: "100%", maxWidth: 460 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, color: "var(--gray-1)", textAlign: "center" }}>
            iPad 연결
          </h1>
          <p style={{ margin: "8px 0 28px", fontSize: 14, color: "rgba(248,250,252,0.62)", textAlign: "center", lineHeight: 1.6 }}>
            관리자 화면의 연결 코드를 입력하면 스캔을 시작할 수 있어요.
          </p>

          <div style={{ background: "var(--surface-card)", borderRadius: "var(--radius-xl)", padding: 24 }}>
            <PairingCodeInput
              value={claim.code}
              onChange={claim.setCode}
              onSubmit={handleClaimSubmit}
              // 결과 미상 구간에는 코드를 못 바꾼다 — 같은 코드·같은 키로만 재시도해야 한다.
              disabled={claim.claiming || claim.codeLocked}
              error={claim.error}
              hint={claim.codeLocked ? "같은 코드로 다시 시도해 주세요." : undefined}
            />

            <button
              type="button"
              onClick={handleClaimSubmit}
              disabled={claim.claiming || claim.code.length === 0}
              style={{
                marginTop: 18,
                width: "100%",
                height: 56,
                borderRadius: "var(--radius-md)",
                border: "none",
                background: "linear-gradient(135deg, var(--violet-800), var(--violet-600))",
                color: "var(--text-on-brand)",
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "var(--font-body)",
                cursor: claim.claiming ? "not-allowed" : "pointer",
                opacity: claim.claiming || claim.code.length === 0 ? 0.6 : 1,
              }}
            >
              {claim.claiming ? "연결 중..." : "연결하기"}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  const device = session.device;
  if (!device) return null;

  /* ── 페어링됨 ── */
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0A0F1A", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <style>{PAGE_STYLES}</style>

      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", flexWrap: "wrap", color: "var(--gray-1)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>
          {device.deviceName} · {BRANCH_LABELS[device.branch]} {device.gateCode}
        </span>

        {/* 재연결 배너 — 색만이 아니라 문구로도 알린다 */}
        {heartbeat.reconnecting && (
          <span
            aria-live="polite"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: "var(--radius-pill)", background: "rgba(249,192,89,0.18)", color: "var(--status-warning-on-dark)", fontSize: 12, fontWeight: 700, padding: "5px 10px" }}
          >
            <WifiOff size={12} aria-hidden="true" /> 재연결 중...
          </span>
        )}

        <span style={{ flex: 1 }} />

        {/*
          TODO(contract): "회차 변경" 버튼은 계약에 기기용 해제 경로가 생기면 되살린다.
          현재 packages/contracts/openapi.yaml 에는 기기 세션이 자기 shift lock 을 푸는
          엔드포인트가 없다 — 있는 건 ADMIN 전용
          `POST /api/v1/admin/scanner-devices/{deviceId}/shift/release` 뿐이고,
          기기 쪽은 `GET`·`POST /api/v1/scanner/shifts/current` 만 정의돼 있다.
          없는 경로를 클릭마다 찔러 404 를 받아내는 건 동작을 지어내는 것이라 버튼을 두지 않는다.
          지금은 관리자가 해제해 주면 이 화면이 회차 선택으로 돌아간다.
          (어댑터 자리표시자: src/shared/api/scanner-shift-release.ts — 렌더되는 UI 는 쓰지 않는다.)
        */}

        {/*
          결과음 컨트롤 — iPad/Safari 는 소리를 제스처로 풀어야 한다.
          잠금 해제 전에는 "소리 켜기"(unlock)만 노출하고, 풀린 뒤에만 음소거 토글을 보인다.
          ready 는 AudioContext 가 실제 running 일 때만 true 라 "준비됨"을 거짓으로 말하지 않는다.
        */}
        {sound.ready ? (
          <button
            type="button"
            onClick={sound.toggleMute}
            style={chipButtonStyle}
            aria-pressed={sound.muted}
            aria-label={sound.muted ? "결과음 켜기" : "결과음 끄기"}
          >
            {sound.muted ? <VolumeX size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}
            {sound.muted ? "소리 꺼짐" : "소리 켜짐"}
          </button>
        ) : (
          <button type="button" onClick={sound.unlock} style={chipButtonStyle} aria-label="결과음 켜기">
            <Volume2 size={13} aria-hidden="true" /> 소리 켜기
          </button>
        )}

        <button type="button" onClick={() => setSettingsOpen(true)} style={chipButtonStyle} aria-label="기기 설정">
          <Settings size={13} aria-hidden="true" /> 설정
        </button>
      </header>

      {/* 회차 잠금이 없으면 스캔을 열지 않는다 — 계약상 체크인이 거부된다 */}
      {!locked ? (
        /* 최초 회차 획득 경로는 그대로 유지한다 (계약에 있는 POST /scanner/shifts/current).
           '이 회차로 스캔 시작' 클릭 제스처 안에서 결과음 AudioContext 를 푼다(iPad/Safari). */
        <ScannerShiftPanel onLocked={session.setShift} onBeforeLock={sound.unlock} />
      ) : (
        <div className="npr-connect-scan">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <QrCameraScanner onScan={checkIn.handleScan} preferRearCamera={prefersRearCamera(deviceType)} />
            {/* idle 빈 패널은 두지 않는다 — 카메라 공간을 우선한다. 처리 중만 카메라 아래 inline 으로 보인다.
                최종 결과(outcome/error/backlog)는 아래 CheckInResultOverlay 가 큰 오버레이로 띄운다. */}
            {checkIn.panel.kind === "processing" && <CheckInResultPanel panel={checkIn.panel} />}
          </div>

          <ScannerManualPanel enabled={locked} onOutcome={checkIn.showOutcome} onError={handleManualError} />
        </div>
      )}

      {partyNotice && (
        <p
          role="status"
          style={{
            position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)", zIndex: 90,
            margin: 0, padding: "10px 16px", borderRadius: "var(--radius-pill)",
            border: "1px solid rgba(249,192,89,0.45)", background: "rgba(20,16,6,0.94)",
            color: "var(--status-warning-on-dark)", fontSize: 13, fontWeight: 700, textAlign: "center",
          }}
        >
          입장 처리하지 않았어요. 다시 스캔하면 이어서 할 수 있어요.
        </p>
      )}

      {/* 2명 예약은 인원을 고르기 전까지 입장이 아니다. 이 오버레이만 자동으로 닫히지 않는다 —
          스태프가 답해야 넘어간다. 결과 오버레이보다 위에 둔다. */}
      {checkIn.panel.kind === "party" && (
        <AttendanceCountOverlay
          outcome={checkIn.panel.outcome}
          confirming={checkIn.panel.confirming}
          onSelect={checkIn.confirmParty}
          onCancel={handlePartyCancel}
        />
      )}

      {/* QR·수동 체크인의 최종 결과를 공용 오버레이로 표시하고 3000ms 뒤 자동으로 닫는다. */}
      <CheckInResultOverlay panel={checkIn.panel} onDismiss={checkIn.reset} />

      <UnpairDeviceDialog
        open={settingsOpen}
        device={device}
        busy={unpairing}
        error={unpairError}
        onConfirm={() => void handleUnpair()}
        onCancel={() => {
          setSettingsOpen(false);
          setUnpairError(null);
        }}
      />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0A0F1A", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {children}
    </div>
  );
}

const chipButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(248,250,252,0.1)",
  border: "none",
  color: "var(--gray-1)",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  padding: "8px 13px",
  borderRadius: "var(--radius-pill)",
};

const retryButtonStyle: React.CSSProperties = {
  marginTop: 16,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "10px 18px",
  borderRadius: "var(--radius-pill)",
  border: "none",
  background: "var(--gray-1)",
  color: "var(--ink-900)",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "var(--font-body)",
  cursor: "pointer",
};
