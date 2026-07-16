"use client";

/**
 * QR 스캐너 (명세 §9, flows ADMIN-F7) — 실카메라 스캔 전환 (qr-poc ScannerClient 이식).
 * 기기 모니터링(스캐너 #1~#4) → 카메라 권한 안내 → 전체화면 스캔:
 * 좌측 실카메라(html5-qrcode, 스캔영역 82%·최대 360px) + 스캔 결과 패널,
 * 우측 연락처 뒷 4자리 다이얼 현장 입장 (명세 §9.3). 입장 확인 팝업 2초 (명세 §9.2).
 */

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Device } from "@/entities/device";
import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { Student } from "@/entities/student";
import { idleState } from "@/shared/lib/action";
import { fmtDateTime, fmtDateTimeShort } from "@/shared/lib/format";
import { Badge, Button, Card, EmptyState, Icons, Toast } from "@/shared/ui";
import {
  detectPreferRearCamera,
  QrCameraScanner,
  scanQrAction,
  type QrScanData,
} from "@/features/check-in";
import { ManualEntryPanel, type ManualEntryDone } from "./ManualEntryPanel";

export interface ScannerViewProps {
  sessions: Session[];
  students: Student[];
  reservations: Reservation[];
  devices: Device[];
}

interface ScanResult {
  name: string;
  school: string;
  grade: string;
  code: string;
}

type ScanPanel =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "success"; data: QrScanData }
  | { kind: "already"; data: QrScanData }
  | { kind: "error"; message: string };

/** QR 텍스트에서 토큰 추출 — `/q/{token}`·`/verify/{token}` URL 또는 원문 토큰 (qr-poc 이식) */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function extractTokenFromPath(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? "";
  const segments = pathname.split("/").filter(Boolean).map(decodePathSegment);

  for (const prefix of ["q", "verify"]) {
    const index = segments.lastIndexOf(prefix);
    if (index === -1) continue;
    const token = segments[index + 1]?.trim();
    if (token) return token;
  }

  return "";
}

function extractQrToken(decodedText: string): string {
  const text = decodedText.trim();
  if (!text) return "";

  try {
    const url = new URL(text, "https://qr.local");
    const token = extractTokenFromPath(url.pathname);
    if (token) return token;
  } catch {
    const token = extractTokenFromPath(text);
    if (token) return token;
  }

  return text;
}

const emptySubscribe = () => () => {};
const getServerPreferRear = () => false;

/* 다크 표면 텍스트 톤 */
const ink = {
  strong: "var(--gray-1)",
  muted: "rgba(248,250,252,0.62)",
  faint: "rgba(248,250,252,0.4)",
  border: "rgba(248,250,252,0.12)",
  borderSoft: "rgba(248,250,252,0.08)",
  card: "rgba(248,250,252,0.05)",
};

/** 스캔 결과 패널 — 카메라 아래 상시 표시 (qr-poc ScanResultPanel 이식) */
function ScanStatusPanel({ panel }: { panel: ScanPanel }) {
  const frame = (children: React.ReactNode, border = ink.borderSoft, bg = ink.card) => (
    <div style={{ borderRadius: "var(--radius-lg)", border: `1px solid ${border}`, background: bg, padding: "16px 18px", textAlign: "center" }}>
      {children}
    </div>
  );

  if (panel.kind === "processing")
    return frame(
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--mint-400)", fontSize: 13.5, fontWeight: 700 }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(56,189,248,0.3)", borderTopColor: "var(--mint-400)", animation: "npr-scan-panel-spin 0.9s linear infinite" }} />
        인증 처리 중...
        <style>{`@keyframes npr-scan-panel-spin { to { transform: rotate(360deg); } }`}</style>
      </div>,
    );

  if (panel.kind === "success")
    return frame(
      <Fragment>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--status-success)" }}>✅ 입장 완료</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: ink.strong, marginTop: 6 }}>{panel.data.name}</div>
        <div style={{ fontSize: 12.5, color: ink.muted, marginTop: 3 }}>
          {[panel.data.school, panel.data.grade, panel.data.code].filter(Boolean).join(" · ")}
        </div>
        {panel.data.enteredAt && (
          <div style={{ fontSize: 11.5, color: ink.faint, marginTop: 6 }}>{fmtDateTime(new Date(panel.data.enteredAt))}</div>
        )}
      </Fragment>,
      "rgba(34,197,94,0.35)",
      "rgba(34,197,94,0.08)",
    );

  if (panel.kind === "already")
    return frame(
      <Fragment>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--status-warning)" }}>⚠️ 이미 입장한 QR</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: ink.strong, marginTop: 6 }}>{panel.data.name}</div>
        <div style={{ fontSize: 12.5, color: ink.muted, marginTop: 3 }}>
          {[panel.data.school, panel.data.grade, panel.data.code].filter(Boolean).join(" · ")}
        </div>
        {panel.data.enteredAt && (
          <div style={{ display: "inline-block", marginTop: 8, borderRadius: "var(--radius-sm)", background: "rgba(245,158,11,0.16)", color: "var(--status-warning)", fontSize: 11.5, fontWeight: 700, padding: "6px 10px" }}>
            최초 입장 {fmtDateTime(new Date(panel.data.enteredAt))}
          </div>
        )}
      </Fragment>,
      "rgba(245,158,11,0.4)",
      "rgba(245,158,11,0.08)",
    );

  if (panel.kind === "error")
    return frame(
      <Fragment>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#FCA5A5" }}>❌ 인식 실패</div>
        <div style={{ fontSize: 12.5, color: ink.muted, marginTop: 6, lineHeight: 1.6 }}>{panel.message}</div>
      </Fragment>,
      "rgba(239,68,68,0.4)",
      "rgba(239,68,68,0.08)",
    );

  return frame(
    <Fragment>
      <div style={{ fontSize: 26, opacity: 0.4 }}>🎫</div>
      <div style={{ fontSize: 12.5, color: ink.faint, marginTop: 6, lineHeight: 1.6 }}>
        QR을 스캔하면 결과가 여기에 표시됩니다
      </div>
    </Fragment>,
  );
}

export function ScannerView({ sessions, students, reservations, devices }: ScannerViewProps) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [device, setDevice] = useState<Device | null>(null);
  const [perm, setPerm] = useState<"ask" | "granted">("ask");
  const [panel, setPanel] = useState<ScanPanel>({ kind: "idle" });
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 마운트 후에만 기기 감지 — SSR은 전면 카메라 기본 (qr-poc useSyncExternalStore 패턴)
  const preferRear = useSyncExternalStore(emptySubscribe, detectPreferRearCamera, getServerPreferRear);
  const lastTokenRef = useRef("");
  const processingRef = useRef(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (m: string) => { setToast(m); later(() => setToast(null), 3200); };
  const showResult = (r: ScanResult) => { setScanResult(r); later(() => setScanResult(null), 2000); };

  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];
  const scannerNo = device?.scannerNo ?? 1;

  /* 실카메라 스캔 → 토큰 추출 → 체크인 액션 (명세 §9.2, 중복 스캔 방지는 qr-poc 로직) */
  const handleScan = useCallback(
    async (decodedText: string) => {
      if (!session) return;
      const token = extractQrToken(decodedText);
      if (!token || token === lastTokenRef.current || processingRef.current) return;

      lastTokenRef.current = token;
      processingRef.current = true;
      setPanel({ kind: "processing" });

      try {
        const fd = new FormData();
        fd.set("token", token);
        fd.set("sessionId", session.id);
        fd.set("scannerNo", String(scannerNo));
        const result = await scanQrAction(idleState, fd);

        if (result.status === "success" && result.data) {
          if (result.data.alreadyEntered) {
            setPanel({ kind: "already", data: result.data });
          } else {
            setPanel({ kind: "success", data: result.data });
            showResult({
              name: result.data.name,
              school: result.data.school,
              grade: result.data.grade,
              code: result.data.code,
            });
          }
        } else if (result.status === "error") {
          setPanel({ kind: "error", message: result.message });
        }
      } catch {
        setPanel({ kind: "error", message: "QR 처리 중 오류가 발생했어요." });
      } finally {
        processingRef.current = false;
        later(() => {
          if (lastTokenRef.current === token) lastTokenRef.current = "";
        }, 2500);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.id, scannerNo],
  );

  if (!session) return <EmptyState>진행 중인 설명회가 없어요.</EmptyState>;

  const unchecked = reservations.filter((r) => r.sessionId === session.id && r.status === "reserved");

  /* ── 기기 선택 뷰 (명세 §9.1) ── */
  if (!device) {
    return (
      <div data-screen-label="QR 스캐너 — 기기 선택">
        <div style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>QR SCANNER</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>태블릿 스캐너</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-muted)" }}>최대 4대까지 동시 모니터링 — 접속 기기를 선택하면 전체화면 스캐너로 전환돼요.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 24 }}>
          {devices.map((d, i) => (
            <Card key={d.id} padding="22px" style={{ textAlign: "center", animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both`, opacity: d.on ? 1 : 0.72 }}>
              <div style={{ position: "relative", width: 62, height: 62, margin: "0 auto", borderRadius: "var(--radius-md)", background: d.on ? "var(--violet-50)" : "var(--surface-sunken)", color: d.on ? "var(--violet-800)" : "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icons.tablet size={28} />
                <span style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%", background: d.on ? "var(--status-success)" : "var(--ink-300)", border: "2.5px solid var(--surface-card)", animation: d.on ? "ds-float 2.4s var(--ease-in-out) infinite" : "none" }} />
              </div>
              <div style={{ marginTop: 14, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--text-strong)" }}>{d.label}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>{d.model}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
                {d.on ? <Badge tone="success" dot size="sm">스캐너 ON</Badge> : <Badge tone="neutral" size="sm">OFF</Badge>}
                <Badge tone={d.battery < 40 ? "warning" : "neutral"} size="sm">{d.battery}%</Badge>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 8 }}>마지막 활동 {fmtDateTimeShort(d.last)}</div>
              <Button size="sm" fullWidth variant={d.on ? "primary" : "secondary"} style={{ marginTop: 14 }} onClick={() => { setDevice(d); setPerm("ask"); }}>
                {d.on ? "이 기기로 스캔" : "연결하기"}
              </Button>
            </Card>
          ))}
        </div>
        <Card variant="accent" padding="16px 20px" style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", fontSize: 13.5, color: "var(--mint-700)", fontWeight: 600, animation: "ds-fade-up var(--dur-slow) var(--ease-out) 350ms both" }}>
          <Icons.qr size={16} /> 오늘 스캔 대상: {session.title} — 미체크 {unchecked.length}명
        </Card>
      </div>
    );
  }

  /* ── 전체화면 스캐너 (명세 §9.2) ── */
  return (
    <div data-screen-label="QR 스캐너 — 스캔 화면" style={{ position: "fixed", inset: 0, zIndex: 90, background: "#0A0F1A", display: "flex", flexDirection: "column", animation: "ds-fade-in var(--dur-base) var(--ease-out) both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px", color: "var(--gray-1)", flexWrap: "wrap" }}>
        <button onClick={() => { setDevice(null); setPanel({ kind: "idle" }); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(248,250,252,0.1)", border: "none", color: "var(--gray-1)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", padding: "9px 14px", borderRadius: "var(--radius-pill)" }}>
          <Icons.refresh size={14} /> 기기 변경
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
          <Icons.tablet size={15} /> {device.label} · {device.model}
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-success)" }} />
        </span>
        <span style={{ flex: 1 }} />
        {sessions.length > 1 ? (
          <select
            value={session.id}
            onChange={(e) => { setSessionId(e.target.value); setPanel({ kind: "idle" }); lastTokenRef.current = ""; }}
            aria-label="설명회 회차 선택"
            style={{ background: "rgba(248,250,252,0.08)", border: `1px solid ${ink.border}`, color: "var(--mint-400)", fontSize: 13, fontWeight: 700, borderRadius: "var(--radius-pill)", padding: "8px 12px", fontFamily: "var(--font-body)", maxWidth: 320 }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id} style={{ color: "#0A0F1A" }}>{s.title}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 13.5, color: "var(--mint-400)", fontWeight: 700 }}>{session.title}</span>
        )}
      </div>

      <div style={{ flex: 1, position: "relative", overflowY: "auto" }}>
        {perm === "ask" && (
          <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ width: 380, background: "var(--surface-card)", borderRadius: "var(--radius-xl)", padding: 28, textAlign: "center", boxShadow: "var(--shadow-float)", animation: "ds-pop var(--dur-slow) var(--ease-spring) both" }}>
              <span style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--violet-50)", color: "var(--violet-800)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icons.camera size={24} />
              </span>
              <h3 style={{ fontSize: 19, fontWeight: 800, marginTop: 14 }}>카메라 권한이 필요해요</h3>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.6 }}>
                허용을 누르면 브라우저의 카메라 권한 요청이 표시돼요. QR 스캔에만 사용하고 영상은 저장되지 않아요.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                <Button variant="ghost" fullWidth onClick={() => setDevice(null)}>거부</Button>
                <Button fullWidth onClick={() => setPerm("granted")}>허용</Button>
              </div>
            </div>
          </div>
        )}

        {perm === "granted" && (
          <Fragment>
            {/* 좌: 실카메라 + 결과 패널 / 우: 연락처 뒷 4자리 다이얼 현장 입장 (qr-poc 레이아웃) */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(330px, 430px) minmax(340px, 1fr)", gap: 18, alignItems: "start", maxWidth: 1060, margin: "0 auto", padding: "6px 24px 28px", width: "100%", boxSizing: "border-box" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <QrCameraScanner onScan={handleScan} preferRearCamera={preferRear} />
                <ScanStatusPanel panel={panel} />
              </div>

              <ManualEntryPanel
                key={session.id}
                session={session}
                students={students}
                reservations={reservations}
                scannerNo={scannerNo}
                onEntered={(done: ManualEntryDone) => {
                  showResult(done);
                  flash(`${done.name} 학부모님 입장 확인 — 입장 문자를 발송했어요`);
                }}
              />
            </div>

            {/* 입장 확인 팝업 2초 (명세 §9.2) */}
            {scanResult && (
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 340, background: "var(--surface-card)", borderRadius: "var(--radius-xl)", padding: 26, textAlign: "center", boxShadow: "var(--shadow-float)", animation: "ds-pop var(--dur-slow) var(--ease-spring) both", zIndex: 5 }}>
                <span style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--violet-900)", color: "var(--mint-400)", display: "inline-flex", alignItems: "center", justifyContent: "center", animation: "ds-pop var(--dur-hero) var(--ease-spring) both" }}>
                  <Icons.check size={24} sw={2.6} />
                </span>
                <h3 style={{ fontSize: 21, fontWeight: 800, marginTop: 12, lineHeight: 1.4 }}>
                  {scanResult.name} 학부모님
                  <br />
                  입장 확인되셨습니다
                </h3>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5 }}>
                  {scanResult.school} · {scanResult.grade}
                  {scanResult.code ? ` · ${scanResult.code}` : ""}
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--violet-800)", background: "var(--surface-brand-soft)", borderRadius: "var(--radius-sm)", padding: "9px 12px", display: "inline-flex", gap: 7, alignItems: "center" }}>
                  <Icons.message size={13} /> 학부모께 입장 완료 문자 발송됨
                </div>
              </div>
            )}
          </Fragment>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 120 }}>
          <Toast tone="success">{toast}</Toast>
        </div>
      )}
    </div>
  );
}
