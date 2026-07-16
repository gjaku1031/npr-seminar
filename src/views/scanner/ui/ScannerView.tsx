"use client";

/**
 * QR 스캐너 (명세 §9, flows ADMIN-F7) — 와이어프레임 ScannerScreen 이식.
 * 기기 모니터링(스캐너 #1~#4) → 카메라 권한 목업 → 전체화면 스캔(데모) → 입장 확인 팝업 2초 ·
 * 현장 입장(연락처 뒷 4자리, 모/부 매칭). 실제 카메라·QR 인식은 미구현 (명세 §12).
 */

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import type { Device } from "@/entities/device";
import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { Student } from "@/entities/student";
import { idleState } from "@/shared/lib/action";
import { fmtDateTimeShort } from "@/shared/lib/format";
import { Badge, Button, Card, EmptyState, Icons, Input, Toast } from "@/shared/ui";
import { checkInAction, walkInAction } from "@/features/check-in";

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

export function ScannerView({ sessions, students, reservations, devices }: ScannerViewProps) {
  const session = sessions[0];

  const [device, setDevice] = useState<Device | null>(null);
  const [perm, setPerm] = useState<"ask" | "granted">("ask");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [digits, setDigits] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = (m: string) => { setToast(m); later(() => setToast(null), 3200); };
  const showResult = (r: ScanResult) => { setScanResult(r); later(() => setScanResult(null), 2000); };

  if (!session) return <EmptyState>진행 중인 설명회가 없어요.</EmptyState>;

  const scannerNo = device?.scannerNo ?? 1;
  const unchecked = reservations.filter((r) => r.sessionId === session.id && r.status === "reserved");

  /* 데모 스캔 — 미체크 예약 하나를 입장 처리 (명세 §9.2) */
  const demoScan = () => {
    const target = unchecked[0];
    if (!target) { flash("미체크 예약이 없어요"); return; }
    const fd = new FormData();
    fd.set("reservationId", target.id);
    fd.set("scannerNo", String(scannerNo));
    startTransition(async () => {
      const result = await checkInAction(idleState, fd);
      if (result.status === "error") { flash(result.message); return; }
      showResult({ name: target.name, school: target.school, grade: target.grade, code: target.code });
    });
  };

  /* 현장 입장 — 뒷 4자리, 모/부 모두 매칭 (명세 §9.3) */
  const found =
    digits.length >= 4
      ? students.filter(
          (s) =>
            s.motherPhone.replace(/\D/g, "").endsWith(digits.slice(-4)) ||
            s.fatherPhone.replace(/\D/g, "").endsWith(digits.slice(-4)),
        )
      : [];

  const walkIn = (stu: Student) => {
    const fd = new FormData();
    fd.set("studentId", stu.id);
    fd.set("sessionId", session.id);
    fd.set("scannerNo", String(scannerNo));
    startTransition(async () => {
      const result = await walkInAction(idleState, fd);
      if (result.status !== "success") { if (result.status === "error") flash(result.message); return; }
      setSheetOpen(false);
      setDigits("");
      showResult({ name: stu.name, school: stu.school, grade: stu.grade, code: result.data?.code ?? "" });
    });
  };

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
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px", color: "var(--gray-1)" }}>
        <button onClick={() => setDevice(null)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(248,250,252,0.1)", border: "none", color: "var(--gray-1)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", padding: "9px 14px", borderRadius: "var(--radius-pill)" }}>
          <Icons.refresh size={14} /> 기기 변경
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
          <Icons.tablet size={15} /> {device.label} · {device.model}
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-success)" }} />
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13.5, color: "var(--mint-400)", fontWeight: 700 }}>{session.title}</span>
      </div>

      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {perm === "ask" && (
          <div style={{ width: 380, background: "var(--surface-card)", borderRadius: "var(--radius-xl)", padding: 28, textAlign: "center", boxShadow: "var(--shadow-float)", animation: "ds-pop var(--dur-slow) var(--ease-spring) both" }}>
            <span style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--violet-50)", color: "var(--violet-800)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icons.camera size={24} />
            </span>
            <h3 style={{ fontSize: 19, fontWeight: 800, marginTop: 14 }}>카메라 권한이 필요해요</h3>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "8px 0 0", lineHeight: 1.6 }}>QR 스캔을 위해 이 태블릿의 카메라 접근을 허용해 주세요. 영상은 저장되지 않아요.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <Button variant="ghost" fullWidth onClick={() => setDevice(null)}>거부</Button>
              <Button fullWidth onClick={() => setPerm("granted")}>허용</Button>
            </div>
          </div>
        )}

        {perm === "granted" && (
          <Fragment>
            {/* 스캔 프레임 + 스캔라인 */}
            <div style={{ position: "relative", width: 320, height: 320 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: 28, boxShadow: "0 0 0 9999px rgba(10,15,26,0.55)", background: "rgba(248,250,252,0.03)" }} />
              {[
                { t: 0, l: 0, br: "18px 0 0 0", bt: true, bl: true },
                { t: 0, r: 0, br: "0 18px 0 0", bt: true, brd: true },
                { b: 0, l: 0, br: "0 0 0 18px", bb: true, bl: true },
                { b: 0, r: 0, br: "0 0 18px 0", bb: true, brd: true },
              ].map((c, i) => (
                <span key={i} style={{ position: "absolute", top: c.t, left: c.l, right: c.r, bottom: c.b, width: 46, height: 46, borderRadius: c.br, borderTop: c.bt ? "4px solid var(--mint-500)" : "none", borderBottom: c.bb ? "4px solid var(--mint-500)" : "none", borderLeft: c.bl ? "4px solid var(--mint-500)" : "none", borderRight: c.brd ? "4px solid var(--mint-500)" : "none" }} />
              ))}
              <span className="npr-scanline" />
            </div>
            <div style={{ position: "absolute", top: "calc(50% + 190px)", left: "50%", transform: "translateX(-50%)", color: "rgba(248,250,252,0.75)", fontSize: 14.5, whiteSpace: "nowrap", textAlign: "center" }}>
              문자로 받은 QR을 프레임 안에 맞춰 주세요
              <div style={{ marginTop: 12 }}>
                <button onClick={demoScan} disabled={pending} style={{ padding: "8px 16px", borderRadius: "var(--radius-pill)", border: "1px dashed rgba(56,189,248,0.6)", background: "transparent", color: "var(--mint-400)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                  데모 — QR 인식 시뮬레이션
                </button>
              </div>
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

            {/* 우하단 현장 입장 (명세 §9.3) */}
            <div style={{ position: "absolute", right: 26, bottom: 26 }}>
              <Button variant="accent" size="lg" icon={<Icons.logIn size={17} />} onClick={() => setSheetOpen(true)}>현장 입장</Button>
            </div>

            {/* 현장 입장 시트 — 재원생 연락처 뒷자리 조회 */}
            {sheetOpen && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(10,15,26,0.5)", display: "flex", alignItems: "flex-end", zIndex: 10 }} onClick={(e) => { if (e.target === e.currentTarget) setSheetOpen(false); }}>
                <div style={{ width: "100%", maxHeight: "72%", overflowY: "auto", background: "var(--surface-page)", borderRadius: "28px 28px 0 0", padding: "26px 30px 34px", animation: "ds-fade-up var(--dur-slow) var(--ease-spring) both" }}>
                  <div style={{ width: 44, height: 5, borderRadius: 3, background: "var(--gray-3)", margin: "0 auto 18px" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: 20, fontWeight: 800 }}>현장 입장 — 재원생 조회</h3>
                    <button onClick={() => setSheetOpen(false)} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer" }}>
                      <Icons.x size={18} />
                    </button>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "6px 0 14px" }}>
                    QR이 없어도 재원생은 학부모 연락처 뒷자리로 바로 입장 처리할 수 있어요. (비재원생은 예약 명단 → 수동 추가를 이용)
                  </p>
                  <Input placeholder="학부모 연락처 뒷자리 4자리" value={digits} onChange={(v) => setDigits(v.replace(/\D/g, "").slice(0, 4))} icon={<Icons.search size={17} />} size="lg" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
                    {found.map((s, i) => (
                      <div key={s.id} onClick={() => walkIn(s)} style={{ padding: "16px", borderRadius: "var(--radius-md)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", cursor: "pointer", textAlign: "center", transition: "all var(--dur-fast) var(--ease-out)", animation: `ds-pop var(--dur-base) var(--ease-spring) ${i * 60}ms both` }}>
                        <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--violet-100)", color: "var(--violet-900)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>{s.name[0]}</span>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-strong)", marginTop: 8 }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{s.school} · {s.grade}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>{s.className}</div>
                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "var(--violet-800)" }}>탭하여 입장 처리</div>
                      </div>
                    ))}
                  </div>
                  {digits.length >= 4 && found.length === 0 && <EmptyState>뒷자리 {digits}와 일치하는 재원생이 없어요.</EmptyState>}
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
