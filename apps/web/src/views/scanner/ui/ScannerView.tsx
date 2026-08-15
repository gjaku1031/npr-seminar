"use client";

/**
 * QR 스캐너 (관리자) — 시각안 1: 카드 중심 기기 모니터링 + 네 번째 슬롯의 연결 코드 발급.
 *
 * 역할 분리 (계약 기준):
 * - 이 화면은 ADMIN 세션으로 기기를 **모니터링·페어링·해제**한다.
 * - 실제 스캔은 SCANNER 세션을 가진 iPad(`/scanner/connect`)가 한다.
 *   ADMIN 브라우저에는 SCANNER 세션이 없어서 계약상 체크인 엔드포인트를 부를 수 없다.
 *
 * 기기 사실(온라인·배터리·마지막 신호)은 전부 서버 응답에서만 온다.
 */

import { useCallback, useEffect, useState } from "react";
import { useSeminarSessions, useUpcomingSession } from "@/features/admin-overview";
import { BRANCH_LABELS } from "@/shared/api";
import { Button, Card, EmptyState, Icons, Toast } from "@/shared/ui";
import {
  defaultErrorMessage,
  isDefinitiveFailure,
  useOperationKey,
  type ScannerDevice,
} from "@/shared/api";
// index.ts 는 다른 에이전트가 만질 수 있어, 하드 삭제 어댑터는 모듈에서 직접 가져온다.
import { deleteScannerDevice, reconcileScannerDelete } from "@/shared/api/scanner-admin";
import {
  DeleteDeviceDialog,
  PairingSlotCard,
  ScannerDeviceCard,
  usePairingCode,
  useScannerDevices,
  type PairingFormValue,
} from "@/features/scanner-pairing";
import { SCANNER_GRID_COLUMNS } from "../lib/scanner-grid";

/** 계약 PairingCodeMetadata.ttlSeconds 는 상수 300 — 발급 시각을 만료 시각에서 되돌려 구한다. */
const PAIRING_TTL_MS = 300_000;

// 4열 그리드 — 기기 수 상한이 없어 5대째부터 다음 줄로 흐른다(scanner-grid.test 로 잠금).
const GRID_STYLES = `
  .npr-scanner-grid {
    display: grid;
    grid-template-columns: repeat(${SCANNER_GRID_COLUMNS}, minmax(0, 1fr));
    gap: 14px;
    margin-top: 24px;
    align-items: stretch;
  }
  @media (max-width: 992px) {
    .npr-scanner-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 600px) {
    .npr-scanner-grid { grid-template-columns: minmax(0, 1fr); }
  }
`;

const DEFAULT_FORM: PairingFormValue = { branch: "CAMPUS_A", gateCode: "", intendedDeviceName: "" };

export function ScannerView() {
  const { devices, loading, error: listError, reload, removeDevice } = useScannerDevices();
  const sessions = useSeminarSessions();
  // 취소가 claim 에 진 경우 연결된 기기가 목록에 바로 보여야 한다.
  const pairing = usePairingCode({ onClaimDetected: reload });

  const [form, setForm] = useState<PairingFormValue>(DEFAULT_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ScannerDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const deleteKey = useOperationKey();
  /**
   * 결과가 확정되지 않은 삭제 요청이 걸린 기기 id.
   *
   * 삭제는 멱등이라 사유 같은 본문이 없어 "본문 고정"이 필요 없다 — 같은 Idempotency-Key 만
   * 유지하면 서버가 리플레이로 처리한다. 다이얼로그를 닫았다 다시 열어도 이 id 가 남아
   * 같은 조작(같은 키)을 이어간다.
   */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /**
   * 코드가 사용됐는지는 서버가 알려준다 — 발급 시각 이후에 같은 이름으로 페어링된
   * 기기가 목록에 나타나면 슬롯을 비운다(원문 코드도 함께 버려진다).
   */
  const issuedPairing = pairing.pairing;
  const pairingStatus = pairing.status;
  const markClaimed = pairing.markClaimed;

  useEffect(() => {
    if (pairingStatus !== "issued" || !issuedPairing) return;

    const issuedAtMs = Date.parse(issuedPairing.expiresAt) - PAIRING_TTL_MS;
    const claimed = devices.find(
      (device) =>
        device.deviceName === issuedPairing.intendedDeviceName &&
        device.branch === issuedPairing.branch &&
        Date.parse(device.pairedAt) >= issuedAtMs,
    );

    if (claimed) markClaimed(claimed.deviceName);
  }, [devices, issuedPairing, pairingStatus, markClaimed]);

  const handleIssue = useCallback(() => {
    void pairing.issue({
      branch: form.branch,
      gateCode: form.gateCode,
      intendedDeviceName: form.intendedDeviceName,
    });
  }, [form, pairing]);

  const handleRetryUnknown = useCallback(() => {
    void pairing.retryUnknown();
  }, [pairing]);

  const handleCancelPairing = useCallback(() => {
    void pairing.cancel().then(reload);
  }, [pairing, reload]);

  /**
   * 삭제 다이얼로그 열기.
   *
   * 미확정 조작이 남아 있으면 **키를 새로 만들지 않는다**. 그대로 두면 닫았다 다시 여는 것만으로
   * 같은 미해결 조작에 새 키가 붙어 이중 조작이 될 수 있다.
   * 미확정 조작이 있는 동안 다른 기기로 넘어가는 것도 막는다 (그건 별개의 새 조작이다).
   */
  const handleOpenDelete = useCallback(
    (target: ScannerDevice) => {
      // 미확정 대상이 더는 ACTIVE 목록에 없으면(다른 경로로 삭제/해제됨) 그 조작은 의미가 없다.
      // 이 경우까지 붙잡으면 콘솔 전체에서 삭제가 영구히 막힌다.
      const stale = pendingDeleteId !== null && !devices.some((d) => d.deviceId === pendingDeleteId);
      const activePendingId = stale ? null : pendingDeleteId;

      if (stale) {
        setPendingDeleteId(null);
        deleteKey.reset();
      }

      if (activePendingId && activePendingId !== target.deviceId) {
        setToast("먼저 진행 중인 삭제 요청을 마무리해 주세요.");
        return;
      }

      // 미확정 조작을 이어서 여는 게 아니라면 새 조작이다.
      if (!activePendingId) {
        deleteKey.reset();
        setDeleteError(null);
      }

      setDeleteTarget(target);
    },
    [pendingDeleteId, devices, deleteKey],
  );

  /** 삭제 성공 확정 — 카드를 즉시 빼고 목록 재조회. 기록된 체크인은 서버에 남는다. */
  const finishDelete = useCallback(
    (target: ScannerDevice) => {
      deleteKey.settle();
      setPendingDeleteId(null);
      removeDevice(target.deviceId);
      setDeleteTarget(null);
      setToast(`${target.deviceName} 기기를 삭제했습니다. 다시 사용하려면 새 코드가 필요합니다.`);
      reload();
    },
    [deleteKey, removeDevice, reload],
  );

  const handleDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      // 응답이 유실돼 사용자가 다시 누르더라도 같은 키로 나가 서버가 리플레이로 처리한다
      // (204, 멱등 — 두 번 삭제되지 않는다).
      await deleteScannerDevice(target.deviceId, { idempotencyKey: deleteKey.current() });
      finishDelete(target);
    } catch (caught) {
      if (isDefinitiveFailure(caught)) {
        deleteKey.settle(caught);
        setPendingDeleteId(null);
        setDeleteError(defaultErrorMessage(caught));
        return;
      }

      // 결과 미상(네트워크·5xx) — 응답 유실이 곧 실패는 아니다.
      // 성공/실패를 단정하기 전에 서버 상태를 되묻는다 (404 면 이미 삭제된 것).
      const reconciliation = await reconcileScannerDelete(target.deviceId);

      if (reconciliation === "deleted") {
        // GET 404 — 이미 삭제돼 있었다. 사용자에겐 성공이다.
        finishDelete(target);
        return;
      }

      // 아직 존재하거나 확인 실패 — 같은 키를 유지하고(settle 은 미상에서 키를 남긴다) 재시도를 제공한다.
      deleteKey.settle(caught);
      setPendingDeleteId(target.deviceId);
      setDeleteError(
        reconciliation === "still-present"
          ? "삭제가 적용되지 않았습니다. 같은 요청으로 다시 시도해 주세요."
          : "삭제 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요.",
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleteKey, finishDelete]);

  /** 남은 회차가 없으면 대상도 없다 — 지난 회차를 "다음"이라고 부르지 않는다. */
  const target = useUpcomingSession(sessions.options);

  return (
    <div data-screen-label="QR 스캐너 — 기기 모니터링">
      <style>{GRID_STYLES}</style>

      <div style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: "var(--tracking-caps)",
            fontWeight: 700,
            color: "var(--text-accent)",
            marginBottom: 6,
          }}
        >
          QR SCANNER
        </div>
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>태블릿 스캐너</h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
          연결 코드를 발급해 iPad를 스캐너로 등록하고 연결 상태를 실시간으로 확인합니다. 이 화면은
          기기를 모니터링·페어링만 하고, 실제 스캔은 스캐너 기기에서 진행합니다.
        </p>
        {/* 이 관리자 화면은 스캔을 하지 못한다(SCANNER 세션이 없다). iPad 연결 화면(/scanner/connect)을 새 창으로 연다. */}
        <Button
          variant="secondary"
          size="sm"
          icon={<Icons.camera size={15} />}
          iconRight={<Icons.arrowRight size={14} />}
          onClick={() => window.open("/scanner/connect", "_blank", "noopener,noreferrer")}
          style={{ marginTop: 14 }}
        >
          iPad 연결 화면 열기
        </Button>
      </div>

      {listError && (
        <Card
          padding="14px 18px"
          style={{ marginTop: 18, border: "1px solid var(--status-danger-soft)" }}
        >
          <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--status-danger)" }}>
            기기 목록을 불러오지 못했습니다. {listError}
          </p>
        </Card>
      )}

      {loading && devices.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState>기기 목록을 불러오는 중입니다.</EmptyState>
        </div>
      ) : (
        <div className="npr-scanner-grid">
          {devices.map((device, index) => (
            <ScannerDeviceCard
              key={device.deviceId}
              device={device}
              onDelete={handleOpenDelete}
              animationDelayMs={index * 80}
            />
          ))}

          {/* 발급 슬롯 — 기기 수 상한이 없어 항상 마지막 칸에 남는다(5대째부터는 다음 줄로 흐른다). */}
          <PairingSlotCard
            status={pairing.status}
            code={pairing.code}
            pairing={pairing.pairing}
            notice={pairing.notice}
            error={pairing.error}
            canIssue={pairing.canIssue}
            formLocked={pairing.formLocked}
            deadlineIso={pairing.deadlineIso}
            form={form}
            onFormChange={setForm}
            onIssue={handleIssue}
            onRetryUnknown={handleRetryUnknown}
            onCancel={handleCancelPairing}
            onExpire={pairing.expire}
            animationDelayMs={devices.length * 80}
          />
        </div>
      )}

      {/* 스캔 대상 요약 — 정원·좌석 집계는 노출하지 않고 현재 회차만 확인한다. */}
      {target !== null && (
        <Card
          variant="accent"
          padding="16px 20px"
          style={{
            marginTop: 18,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 13.5,
            color: "var(--mint-700)",
            fontWeight: 600,
            animation: "ds-fade-up var(--dur-slow) var(--ease-out) 350ms both",
          }}
        >
          <Icons.qr size={16} />
          <span>
            다음 스캔 대상: {target.seminarTitle} ·{" "}
            {target.session.branch === null ? "전체" : BRANCH_LABELS[target.session.branch]}
          </span>
        </Card>
      )}

      <DeleteDeviceDialog
        device={deleteTarget}
        busy={deleting}
        error={deleteError}
        /* 미확정 조작이 이 기기에 걸려 있으면 재시도 문구로 바꾼다(같은 키로만 재전송). */
        pending={deleteTarget !== null && pendingDeleteId === deleteTarget.deviceId}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          // 닫아도 미확정 조작(pendingDeleteId + 키)은 그대로 남는다 —
          // 같은 기기를 다시 열면 같은 키로 이어서 재시도한다.
          // 미확정 오류 문구는 다시 열었을 때도 맥락으로 남겨 둔다.
          setDeleteTarget(null);
          if (!pendingDeleteId) setDeleteError(null);
        }}
      />

      {toast && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 120 }}>
          <Toast tone="success">{toast}</Toast>
        </div>
      )}
    </div>
  );
}
