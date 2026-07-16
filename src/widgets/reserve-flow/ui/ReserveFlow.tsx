"use client";

/**
 * 모바일 예약 플로우 (명세 §10, flows PARENT-P1~P5) — 와이어프레임 MobileFlow 이식.
 * 학부모 뷰: 캠퍼스 → 설명회 → 재원생 조회(모/부 매칭·가족·중복 방지) / 비재원생 폼 →
 * 완료 티켓(예약변경/취소·URL 공유) · 예약 조회(연락처만)·회차 변경·취소 · 만족도 설문.
 * /reserve(실기기)와 콘솔 프리뷰가 공유하는 다도메인 블록 — widgets (설계 §3.2).
 * 화면 단 방지(마감·중복)는 UX이고, 최종 차단은 서버 불변식이 한다 (설계 §6.4).
 */

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import { isVisibleAtCampus } from "@/entities/session";
import type { Student } from "@/entities/student";
import { CAMPUSES } from "@/shared/config/campus";
import { fmtSessionDate } from "@/shared/lib/format";
import { idleState } from "@/shared/lib/action";
import { Badge, Button, Icons, Input, KV, QrBox, ResStatusBadge } from "@/shared/ui";
import {
  createGuestReservationAction,
  createMemberReservationAction,
  type CreatedTicket,
} from "@/features/create-reservation";
import { cancelReservationAction, moveReservationAction } from "@/features/manage-reservation";
import { submitSurveyAction } from "@/features/manage-survey";

export interface ReserveFlowProps {
  sessions: Session[];
  students: Student[];
  reservations: Reservation[];
  /** 콘솔 프리뷰(폰 프레임) 안에서 구동 시 true — 고정 요소를 absolute로 (와이어프레임 compact) */
  compact?: boolean;
}

type Step = "campus" | "list" | "verify" | "guest" | "done" | "lookup" | "manage" | "survey" | "surveyDone";

export function ReserveFlow({ sessions, students, reservations, compact = false }: ReserveFlowProps) {
  const [step, setStep] = useState<Step>("campus");
  const [campus, setCampus] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [searched, setSearched] = useState<Student[] | null>(null);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [attendWho, setAttendWho] = useState<string[]>(["모"]);
  const [guest, setGuest] = useState({ name: "", school: "", grade: "", phone: "" });
  const [doneRecs, setDoneRecs] = useState<CreatedTicket[] | null>(null);
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupHits, setLookupHits] = useState<Reservation[] | null>(null);
  const [lookupErr, setLookupErr] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [surveySid, setSurveySid] = useState<string | null>(null);
  const [survey, setSurvey] = useState({ rating: 0, comment: "", photo: false });
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [dupErr, setDupErr] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const toast = (m: string) => { setFlash(m); later(() => setFlash(null), 2600); };

  const session = sessions.find((s) => s.id === sessionId);
  const seatsUsed = (sid: string) =>
    reservations.filter((r) => r.sessionId === sid && r.status !== "cancelled").length;
  const pickedStudents = (searched ?? []).filter((s) => pickedIds.includes(s.id));
  const hasActiveRes = (id: string) =>
    reservations.some((r) => r.sessionId === sessionId && r.studentId === id && r.status !== "cancelled");
  const managed = reservations.find((r) => r.id === manageId);
  const managedSession = managed ? sessions.find((s) => s.id === managed.sessionId) : undefined;

  const search = () => {
    const digits = phone.replace(/\D/g, "");
    setPickedIds([]);
    setSearched(
      digits.length < 4
        ? []
        : students.filter(
            (s) =>
              s.motherPhone.replace(/\D/g, "").includes(digits) ||
              s.fatherPhone.replace(/\D/g, "").includes(digits),
          ),
    );
  };
  const togglePick = (id: string) =>
    setPickedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleWho = (w: string) =>
    setAttendWho((p) => {
      const has = p.includes(w);
      if (has && p.length === 1) return p;
      const next = has ? p.filter((x) => x !== w) : p.concat(w);
      return ["모", "부"].filter((x) => next.includes(x));
    });
  const reset = () => {
    setStep("campus"); setCampus(null); setSessionId(null); setPhone(""); setSearched(null);
    setPickedIds([]); setGuest({ name: "", school: "", grade: "", phone: "" }); setDoneRecs(null);
    setAttendWho(["모"]); setDupErr(false); setErrMsg(null); setLookupPhone(""); setLookupHits(null);
    setLookupErr(false); setManageId(null); setSurveySid(null); setSurvey({ rating: 0, comment: "", photo: false });
  };

  /* 예약 생성 — 서버 불변식(중복·정원)이 최종 판정 (설계 §6.4) */
  const reserve = (isMember: boolean) => {
    if (!session) return;
    const attendCount = attendWho.length || 1;
    const digits = phone.replace(/\D/g, "");
    const first = pickedStudents[0];
    const matchedBy =
      first &&
      first.fatherPhone.replace(/\D/g, "").includes(digits) &&
      !first.motherPhone.replace(/\D/g, "").includes(digits)
        ? "부"
        : "모";
    const reservedBy = session.attendField ? attendWho.join(",") : matchedBy;

    if (isMember) {
      const fresh = pickedStudents.filter((s) => !hasActiveRes(s.id));
      if (fresh.length === 0) return;
      const fd = new FormData();
      fd.set("sessionId", session.id);
      for (const s of fresh) fd.append("studentIds", s.id);
      fd.set("reservedBy", reservedBy);
      fd.set("matchedBy", reservedBy === "부" ? "부" : "모");
      fd.set("attendCount", String(attendCount));
      startTransition(async () => {
        const result = await createMemberReservationAction(idleState, fd);
        if (result.status === "success" && result.data) {
          setErrMsg(null);
          setDoneRecs(result.data.tickets);
          setStep("done");
        } else if (result.status === "error") {
          setErrMsg(result.message);
        }
      });
    } else {
      const fd = new FormData();
      fd.set("sessionId", session.id);
      fd.set("name", guest.name);
      fd.set("school", guest.school);
      fd.set("grade", guest.grade);
      fd.set("phone", guest.phone);
      fd.set("campus", campus ?? "");
      fd.set("reservedBy", session.attendField ? attendWho.join(",") : "");
      fd.set("attendCount", String(attendCount));
      startTransition(async () => {
        const result = await createGuestReservationAction(idleState, fd);
        if (result.status === "success" && result.data) {
          setDupErr(false);
          setErrMsg(null);
          setDoneRecs(result.data.tickets);
          setStep("done");
        } else if (result.status === "error") {
          if (result.code === "DUPLICATE_RESERVATION") setDupErr(true);
          else setErrMsg(result.message);
        }
      });
    }
  };

  /* 예약 조회 — 연락처만 (명세 §10.8). 유효 예약(취소 제외) 부분 매칭 */
  const doLookup = () => {
    const digits = lookupPhone.replace(/\D/g, "");
    const hits =
      digits.length >= 4
        ? reservations.filter((r) => r.status !== "cancelled" && r.phone.replace(/\D/g, "").includes(digits))
        : [];
    setLookupHits(hits);
    setLookupErr(hits.length === 0);
  };
  const doCancel = () => {
    if (!managed) return;
    const fd = new FormData();
    fd.set("reservationId", managed.id);
    fd.set("by", "parent");
    startTransition(async () => {
      const result = await cancelReservationAction(idleState, fd);
      setCancelOpen(false);
      if (result.status === "error") { toast(result.message); return; }
      toast("예약을 취소했어요 — 취소 확인 문자를 보냈어요");
      later(reset, 900);
    });
  };
  const doChange = (toId: string) => {
    if (!managed) return;
    const fd = new FormData();
    fd.set("reservationId", managed.id);
    fd.set("toSessionId", toId);
    startTransition(async () => {
      const result = await moveReservationAction(idleState, fd);
      setChangeOpen(false);
      toast(result.status === "error" ? result.message : "예약을 변경했어요 — 변경 확정 문자를 보냈어요");
    });
  };

  const head = ({ back, title }: { back?: () => void; title: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", position: "sticky", top: 0, background: "rgba(248,250,252,0.9)", backdropFilter: "var(--blur-veil)", zIndex: 5 }}>
      {back ? (
        <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-strong)", display: "inline-flex", padding: 4 }}>
          <Icons.arrowLeft size={19} />
        </button>
      ) : (
        <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--violet-900)", color: "var(--mint-400)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icons.ticket size={14} />
        </span>
      )}
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--violet-900)" }}>{title}</span>
    </div>
  );

  const flashBar = (z = 30) =>
    flash ? (
      <div style={{ position: compact ? "absolute" : "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--violet-900)", color: "#fff", padding: "11px 18px", borderRadius: "var(--radius-pill)", fontSize: 13, fontWeight: 600, boxShadow: "var(--shadow-raised)", zIndex: z, whiteSpace: "nowrap", textAlign: "center", animation: "ds-pop var(--dur-base) var(--ease-spring) both" }}>
        {flash}
      </div>
    ) : null;

  const errBar = () =>
    errMsg ? (
      <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 13, lineHeight: 1.5 }}>
        {errMsg}
      </div>
    ) : null;

  /* 참석 학부모(모/부) 선택 칩 — 복수 선택 가능 (명세 §10.4) */
  const whoChips = () => (
    <div style={{ display: "flex", gap: 8 }}>
      {["모", "부"].map((w) => {
        const on = attendWho.includes(w);
        return (
          <button key={w} onClick={() => toggleWho(w)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 0", borderRadius: "var(--radius-md)", border: on ? "1.5px solid var(--violet-800)" : "1px solid var(--border-soft)", background: on ? "var(--surface-brand-soft)" : "var(--surface-card)", color: on ? "var(--violet-800)" : "var(--text-body)", fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)", transition: "all var(--dur-fast) var(--ease-out)" }}>
            <span style={{ width: 18, height: 18, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--violet-900)" : "transparent", border: on ? "1.5px solid var(--violet-900)" : "1.5px solid var(--border-soft)", boxSizing: "border-box" }}>
              {on && <Icons.check size={11} sw={3} style={{ color: "#fff" }} />}
            </span>
            {w}
          </button>
        );
      })}
    </div>
  );

  const bottomBar = (children: ReactNode) => (
    <div style={{ position: compact ? "absolute" : "fixed", left: 0, right: 0, bottom: 0, padding: "12px 18px 20px", background: "rgba(248,250,252,0.92)", backdropFilter: "var(--blur-veil)", borderTop: "1px solid var(--border-hairline)", zIndex: 6 }}>
      {children}
    </div>
  );

  /* ── 캠퍼스 선택 (명세 §10.1) ── */
  if (step === "campus")
    return (
      <div data-screen-label="모바일 — 캠퍼스 선택" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        {head({ title: "npr 입시설명회" })}
        <div style={{ padding: "10px 18px 30px" }}>
          <div style={{ padding: "20px 4px 18px" }}>
            <div style={{ fontSize: 11, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)" }}>STEP 1 · CAMPUS</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 6, lineHeight: 1.3 }}>
              캠퍼스를
              <br />
              선택해 주세요
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>예약하실 캠퍼스를 먼저 골라 주세요.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {CAMPUSES.map((c, i) => {
              const cnt = sessions.filter((s) => isVisibleAtCampus(s, c)).length;
              return (
                <div key={c} onClick={() => { setCampus(c); setStep("list"); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", cursor: "pointer", animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both` }}>
                  <span style={{ width: 44, height: 44, borderRadius: "var(--radius-sm)", background: "var(--violet-50)", color: "var(--violet-800)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icons.mapPin size={20} />
                  </span>
                  <span style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--text-strong)" }}>{c}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>진행 설명회 {cnt}개</div>
                  </span>
                  <Icons.arrowRight size={16} style={{ color: "var(--violet-800)" }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );

  /* ── 설명회 선택 (명세 §10.2) ── */
  if (step === "list")
    return (
      <div data-screen-label="모바일 — 설명회 선택" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        {head({ back: () => { setCampus(null); setStep("campus"); }, title: "npr 입시설명회" })}
        <div style={{ padding: "10px 18px 30px" }}>
          <div style={{ padding: "20px 4px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)" }}>STEP 2 · RESERVATION</span>
              <Badge tone="brand" size="sm">{campus}</Badge>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 6, lineHeight: 1.3 }}>
              설명회를 선택하고
              <br />
              바로 예약하세요
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sessions.filter((s) => isVisibleAtCampus(s, campus ?? "")).map((s, i) => {
              const used = seatsUsed(s.id);
              const full = s.capacity - used <= 0;
              return (
                <div key={s.id} onClick={() => { if (!full) { setSessionId(s.id); setStep("verify"); } }} style={{ padding: "18px 20px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", cursor: full ? "default" : "pointer", opacity: full ? 0.6 : 1, animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 80}ms both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text-strong)", lineHeight: 1.4 }}>{s.title}</div>
                    <Icons.arrowRight size={16} style={{ color: "var(--violet-800)", flexShrink: 0, marginTop: 3 }} />
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Icons.calendar size={12} /> {fmtSessionDate(s.date)} {s.time}</span>
                    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Icons.mapPin size={12} /> {s.place}</span>
                    {s.notice && (
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--mint-600)", fontWeight: 600 }}>
                        <Icons.message size={12} /> 안내문
                      </span>
                    )}
                  </div>
                  {full && (
                    <div style={{ marginTop: 10 }}>
                      <Badge tone="neutral" size="sm">마감</Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "center", marginTop: 22 }}>
            <a onClick={() => { setLookupPhone(""); setLookupHits(null); setLookupErr(false); setStep("lookup"); }} style={{ fontSize: 13.5, fontWeight: 700, color: "var(--violet-800)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>
              이미 예약했나요? 예약 조회 · 변경 · 취소
            </a>
          </div>
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <a onClick={() => { setSurveySid(sessions[0]?.id ?? null); setSurvey({ rating: 0, comment: "", photo: false }); setStep("survey"); }} style={{ fontSize: 13, fontWeight: 700, color: "var(--mint-600)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>
              참석하신 설명회 만족도 설문
            </a>
          </div>
        </div>
        {flashBar()}
      </div>
    );

  /* ── 예약 조회 (명세 §10.8) ── */
  if (step === "lookup")
    return (
      <div data-screen-label="모바일 — 예약 조회" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        {head({ back: () => setStep("list"), title: "예약 조회" })}
        <div style={{ padding: "14px 18px 30px" }}>
          <div style={{ padding: "8px 4px 16px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>예약을 조회해요</h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>
              예약 시 입력한 <b>학부모 연락처</b>만 입력하면 예약 내역이 모두 나와요.
            </div>
          </div>
          <Input label="학부모 연락처" placeholder="010-0000-0000" value={lookupPhone} onChange={setLookupPhone} icon={<Icons.smartphone size={16} />} />
          {lookupErr && (
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 13 }}>
              일치하는 예약이 없어요. 연락처를 다시 확인해 주세요.
            </div>
          )}
          <Button size="lg" fullWidth onClick={doLookup} disabled={lookupPhone.replace(/\D/g, "").length < 4} style={{ marginTop: 18 }} icon={<Icons.search size={16} />}>
            예약 조회하기
          </Button>
          {lookupHits && lookupHits.length > 0 && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>
                예약 내역 {lookupHits.length}건 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>— 누르면 변경·취소할 수 있어요</span>
              </div>
              {lookupHits.map((r, i) => {
                const s = sessions.find((x) => x.id === r.sessionId);
                return (
                  <div key={r.id} onClick={() => { setManageId(r.id); setStep("manage"); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)", cursor: "pointer", animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 60}ms both` }}>
                    <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--violet-100)", color: "var(--violet-900)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{r.name[0]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14.5, color: "var(--text-strong)" }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s?.title} · {s ? fmtSessionDate(s.date) : ""}
                      </div>
                    </span>
                    <ResStatusBadge status={r.status} size="sm" />
                    <Icons.arrowRight size={15} style={{ color: "var(--violet-800)", flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );

  /* ── 예약 관리 — 티켓 + 변경/취소 (명세 §10.8) ── */
  if (step === "manage" && managed && managedSession)
    return (
      <div data-screen-label="모바일 — 예약 관리" style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
        {head({ back: () => setStep("lookup"), title: "내 예약" })}
        <div style={{ flex: 1, padding: "14px 18px 30px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: "100%", maxWidth: 330, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: "var(--shadow-raised)", overflow: "hidden", animation: "ds-fade-up var(--dur-slow) var(--ease-spring) both" }}>
            <div style={{ background: "var(--surface-brand)", color: "var(--text-on-brand)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10.5, letterSpacing: "var(--tracking-caps)", color: "var(--mint-400)", fontWeight: 700 }}>NPR ADMISSION QR</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, marginTop: 4, lineHeight: 1.35 }}>{managedSession.title}</div>
              </div>
              <ResStatusBadge status={managed.status} size="sm" />
            </div>
            <div style={{ padding: "18px 20px", display: "flex", gap: 16, alignItems: "center" }}>
              <QrBox code={managed.code} size={104} />
              <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
                <KV k="예약 학생명" v={managed.name} />
                <KV k="일시" v={`${fmtSessionDate(managedSession.date)} ${managedSession.time}`} />
              </div>
            </div>
            {managed.history.length > 0 && (
              <div style={{ padding: "0 20px 14px", fontSize: 11.5, color: "var(--text-faint)", display: "flex", gap: 5, alignItems: "center" }}>
                <Icons.calendar size={12} /> 회차 변경 {managed.history.length}회 · QR 유지
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22, width: "100%", maxWidth: 330 }}>
            <Button variant="secondary" fullWidth icon={<Icons.calendar size={15} />} onClick={() => setChangeOpen(true)}>예약 변경</Button>
            <Button variant="danger" fullWidth onClick={() => setCancelOpen(true)}>예약 취소</Button>
          </div>
        </div>

        {changeOpen && (
          <div onClick={() => setChangeOpen(false)} style={{ position: compact ? "absolute" : "fixed", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "var(--blur-veil)", zIndex: 40, display: "flex", alignItems: "flex-end", animation: "ds-fade-in var(--dur-fast) both" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "var(--surface-page)", borderRadius: "22px 22px 0 0", padding: "10px 18px 26px", animation: "ds-sheet-up var(--dur-base) var(--ease-spring) both" }}>
              <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--gray-3)", margin: "6px auto 14px" }} />
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>다른 설명회로 변경</h3>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 12 }}>예약번호와 QR은 그대로 유지돼요.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sessions.filter((s) => s.id !== managed.sessionId).length === 0 && (
                  <div style={{ padding: "20px 10px", textAlign: "center", fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
                    변경 가능한 다른 설명회가 없어요.
                    <br />
                    이번 설명회는 단일 회차로 진행돼요.
                  </div>
                )}
                {sessions.filter((s) => s.id !== managed.sessionId).map((s) => {
                  const full = s.capacity - seatsUsed(s.id) <= 0;
                  return (
                    <div key={s.id} onClick={() => { if (!full) doChange(s.id); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", cursor: full ? "not-allowed" : "pointer", opacity: full ? 0.5 : 1, background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)" }}>
                      <span style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-strong)" }}>{s.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
                          {fmtSessionDate(s.date)} · {s.round}회차 · {s.time}
                        </div>
                      </span>
                      {full && <Badge tone="neutral" size="sm">마감</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {cancelOpen && (
          <div onClick={() => setCancelOpen(false)} style={{ position: compact ? "absolute" : "fixed", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "var(--blur-veil)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "ds-fade-in var(--dur-fast) both" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, background: "var(--surface-card)", borderRadius: "var(--radius-lg)", padding: "22px 22px 18px", boxShadow: "var(--shadow-raised)", animation: "ds-pop var(--dur-base) var(--ease-spring) both" }}>
              <h3 style={{ fontSize: 17, fontWeight: 800 }}>예약을 취소할까요?</h3>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.55 }}>
                {managed.name} 학생의 {managedSession.title} 예약을 취소해요. 취소는 시작 24시간 전까지 가능해요.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                <Button variant="ghost" fullWidth onClick={() => setCancelOpen(false)}>돌아가기</Button>
                <Button variant="danger" fullWidth onClick={doCancel} disabled={pending}>취소하기</Button>
              </div>
            </div>
          </div>
        )}

        {flashBar(50)}
      </div>
    );

  /* ── 재원생 조회 (명세 §10.3~10.4) ── */
  if (step === "verify" && session)
    return (
      <div data-screen-label="모바일 — 재원생 조회" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        {head({ back: () => { setStep("list"); setSearched(null); setPickedIds([]); }, title: "재원생 예약" })}
        <div style={{ padding: "14px 18px 110px" }}>
          <div style={{ padding: "8px 4px 16px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>{session.title}</h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>
              {fmtSessionDate(session.date)} {session.time} · {session.place}
            </div>
          </div>
          {session.notice && (
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "12px 14px", marginBottom: 16, borderRadius: "var(--radius-md)", background: "var(--surface-accent-soft)", color: "var(--mint-700)", fontSize: 12.5, lineHeight: 1.55 }}>
              <Icons.message size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{session.notice}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Input label="학부모 연락처로 재원생 조회" placeholder="010-0000-0000" value={phone} onChange={setPhone} icon={<Icons.smartphone size={16} />} style={{ flex: 1 }} />
            <Button variant="secondary" onClick={search}>조회</Button>
          </div>
          {searched && searched.length > 1 && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-accent-soft)", color: "var(--mint-700)", fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", lineHeight: 1.45 }}>
              <Icons.users size={15} style={{ flexShrink: 0 }} /> 형제·자매를 <b>함께 선택</b>하면 자녀별로 각각 QR이 발급돼요.
            </div>
          )}
          {searched && searched.length === 0 && (
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 13 }}>
              일치하는 재원생이 없어요. 번호를 확인하거나 아래 비재원생 예약을 이용해 주세요.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {searched && searched.slice(0, 3).map((s, i) => {
              const already = hasActiveRes(s.id);
              const sel = pickedIds.includes(s.id);
              return (
                <div key={s.id} onClick={() => { if (!already) togglePick(s.id); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "15px 16px", borderRadius: "var(--radius-lg)", cursor: already ? "not-allowed" : "pointer", opacity: already ? 0.55 : 1, background: sel ? "var(--surface-brand-soft)" : "var(--surface-card)", border: sel ? "1.5px solid var(--violet-800)" : "1px solid var(--border-hairline)", boxShadow: sel ? "var(--shadow-accent-glow)" : "var(--shadow-card)", transform: sel ? "scale(1.015)" : "scale(1)", transition: "all var(--dur-base) var(--ease-spring)", animation: `ds-pop var(--dur-base) var(--ease-spring) ${i * 70}ms both` }}>
                  <span style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--violet-100)", color: "var(--violet-900)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{s.name[0]}</span>
                  <span style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15.5, color: "var(--text-strong)" }}>{s.name}</div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                      {s.school} · {s.grade}
                    </div>
                  </span>
                  {already ? (
                    <Badge tone="neutral" size="sm">이미 예약됨</Badge>
                  ) : (
                    <span style={{ width: 24, height: 24, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", background: sel ? "var(--violet-900)" : "var(--surface-card)", border: sel ? "1.5px solid var(--violet-900)" : "1.5px solid var(--border-soft)", transition: "all var(--dur-fast) var(--ease-spring)", boxSizing: "border-box", flexShrink: 0 }}>
                      {sel && <Icons.check size={14} sw={3} style={{ color: "#fff" }} />}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {pickedIds.length > 0 && session.attendField && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, animation: "ds-fade-up var(--dur-base) var(--ease-out) both" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-strong)" }}>
                참석 학부모 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(모·부 복수 선택 가능)</span>
              </span>
              {whoChips()}
            </div>
          )}
          {errBar()}
          <div style={{ textAlign: "center", marginTop: 22 }}>
            <a onClick={() => setStep("guest")} style={{ fontSize: 13.5, fontWeight: 700, color: "var(--mint-600)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>비재원생 예약하기</a>
          </div>
        </div>
        {bottomBar(
          <Button size="lg" fullWidth disabled={pickedIds.length === 0 || pending} onClick={() => reserve(true)} iconRight={<Icons.arrowRight size={17} />}>
            {pending ? "예약 중…" : pickedIds.length === 0 ? "학생을 선택해 주세요" : pickedIds.length === 1 ? `${pickedStudents[0].name} 학생으로 예약하기` : `${pickedIds.length}명 예약하기`}
          </Button>
        )}
      </div>
    );

  /* ── 비재원생 폼 (명세 §10.6) ── */
  if (step === "guest" && session)
    return (
      <div data-screen-label="모바일 — 비재원생 예약" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        {head({ back: () => setStep("verify"), title: "비재원생 예약" })}
        <div style={{ padding: "14px 18px 110px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "8px 4px 2px" }}>
            <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>{session.title}</h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>
              {fmtSessionDate(session.date)} {session.time} · {session.place}
            </div>
          </div>
          <Input label="학생 이름" placeholder="정하윤" value={guest.name} onChange={(v) => setGuest({ ...guest, name: v })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="학교" placeholder="동성중" value={guest.school} onChange={(v) => setGuest({ ...guest, school: v })} />
            <Input label="학년" placeholder="중3" value={guest.grade} onChange={(v) => setGuest({ ...guest, grade: v })} />
          </div>
          <Input label="학부모 연락처" placeholder="010-0000-0000" value={guest.phone} onChange={(v) => setGuest({ ...guest, phone: v })} hint="QR이 담긴 확정 문자를 이 번호로 보내드려요" />
          {dupErr && (
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 13, lineHeight: 1.5 }}>
              이미 같은 연락처로 예약된 내역이 있어요. 중복 예약은 불가하며, 예약 조회에서 확인할 수 있어요.
            </div>
          )}
          {errBar()}
          {session.attendField && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-strong)" }}>
                참석 학부모 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(모·부 복수 선택 가능)</span>
              </span>
              {whoChips()}
            </div>
          )}
        </div>
        {bottomBar(
          <Button size="lg" fullWidth disabled={!guest.name || !guest.phone || pending} onClick={() => reserve(false)} iconRight={<Icons.arrowRight size={17} />}>
            {pending ? "예약 중…" : "예약하기"}
          </Button>
        )}
      </div>
    );

  /* ── 만족도 설문 (명세 §10.9) ── */
  if (step === "survey" || step === "surveyDone") {
    const surveySession = sessions.find((s) => s.id === surveySid) ?? sessions[0];
    const doSubmitSurvey = () => {
      if (!surveySession) return;
      const base = reservations.find(
        (r) => r.sessionId === surveySession.id && r.status === "entered" && r.member,
      );
      const fd = new FormData();
      fd.set("sessionId", surveySession.id);
      fd.set("rating", String(survey.rating));
      fd.set("comment", survey.comment);
      if (survey.photo) fd.set("photo", "true");
      if (base) fd.set("reservationId", base.id);
      startTransition(async () => {
        const result = await submitSurveyAction(idleState, fd);
        if (result.status === "error") { toast(result.message); return; }
        setStep("surveyDone");
      });
    };
    if (step === "surveyDone")
      return (
        <div data-screen-label="모바일 — 설문 완료" style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
          {head({ title: "설문 완료" })}
          <div style={{ flex: 1, padding: "40px 22px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--mint-500)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", animation: "ds-pop var(--dur-hero) var(--ease-spring) both" }}>
              <Icons.check size={26} sw={2.6} />
            </span>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 16 }}>소중한 의견 감사해요</h2>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
              보내주신 별점·후기{survey.photo ? "·사진" : ""}는 다음 설명회를
              <br />더 잘 준비하는 데 큰 도움이 돼요.
            </p>
            <Button onClick={reset} style={{ marginTop: 26 }}>처음으로</Button>
          </div>
        </div>
      );
    return (
      <div data-screen-label="모바일 — 만족도 설문" style={{ minHeight: "100%", background: "var(--surface-page)" }}>
        {head({ back: () => setStep("list"), title: "만족도 설문" })}
        <div style={{ padding: "14px 18px 120px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ padding: "4px 2px" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35 }}>{surveySession?.title}</h2>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>설명회는 어떠셨나요? 잠시면 돼요.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: "18px 0", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-card)" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>전반적인 만족도</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setSurvey({ ...survey, rating: n })} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, transition: "transform var(--dur-fast) var(--ease-spring)", transform: survey.rating === n ? "scale(1.15)" : "scale(1)" }}>
                  <svg width={34} height={34} viewBox="0 0 24 24" fill={n <= survey.rating ? "var(--mint-500)" : "none"} stroke={n <= survey.rating ? "var(--mint-500)" : "var(--gray-3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z" />
                  </svg>
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "var(--text-faint)", minHeight: 16 }}>
              {survey.rating ? ["", "아쉬워요", "보통이에요", "괜찮아요", "좋았어요", "매우 좋았어요"][survey.rating] : "별을 탭해 주세요"}
            </span>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>
              후기 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(선택)</span>
            </span>
            <textarea value={survey.comment} onChange={(e) => setSurvey({ ...survey, comment: e.target.value })} rows={4} placeholder="설명회에서 좋았던 점, 아쉬웠던 점을 자유롭게 적어 주세요" style={{ width: "100%", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--text-strong)", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>
              현장 사진 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(선택)</span>
            </span>
            <button onClick={() => setSurvey({ ...survey, photo: !survey.photo })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: "var(--radius-lg)", border: survey.photo ? "1.5px solid var(--mint-500)" : "1px dashed var(--border-soft)", background: survey.photo ? "var(--surface-accent-soft)" : "var(--surface-card)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)", transition: "all var(--dur-fast) var(--ease-out)" }}>
              <span style={{ width: 38, height: 38, borderRadius: "var(--radius-sm)", background: survey.photo ? "var(--mint-500)" : "var(--surface-sunken)", color: survey.photo ? "#fff" : "var(--text-faint)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all var(--dur-fast) var(--ease-out)" }}>
                <Icons.image size={18} />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: survey.photo ? "var(--mint-700)" : "var(--text-body)" }}>
                  {survey.photo ? "사진 1장 첨부됨" : "사진 첨부하기"}
                </span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
                  {survey.photo ? "탭하여 첨부 취소" : "행사 현장·자료 사진을 올려 주세요"}
                </span>
              </span>
              {survey.photo && <Icons.check size={16} style={{ color: "var(--mint-600)" }} />}
            </button>
          </div>
        </div>
        {bottomBar(
          <Button size="lg" fullWidth disabled={!survey.rating || pending} onClick={doSubmitSurvey}>
            {pending ? "제출 중…" : "설문 제출하기"}
          </Button>
        )}
        {flashBar()}
      </div>
    );
  }

  /* ── 예약 완료 티켓 (명세 §10.7) ── */
  const primary = doneRecs?.[0];
  if (!primary || !session) return null;
  return (
    <div data-screen-label="모바일 — 예약 완료" style={{ minHeight: "100%", background: "var(--surface-page)", display: "flex", flexDirection: "column" }}>
      {head({ title: "예약 완료" })}
      <div style={{ flex: 1, padding: "20px 18px 30px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--violet-900)", color: "var(--mint-400)", display: "inline-flex", alignItems: "center", justifyContent: "center", animation: "ds-pop var(--dur-hero) var(--ease-spring) both" }}>
          <Icons.check size={24} sw={2.6} />
        </span>
        <h2 style={{ fontSize: 23, fontWeight: 800, marginTop: 14, animation: "ds-fade-up var(--dur-slow) var(--ease-out) 120ms both" }}>
          {doneRecs!.length > 1 ? `${doneRecs!.length}명 예약이 확정됐어요!` : "예약이 확정됐어요!"}
        </h2>

        <div style={{ width: "100%", maxWidth: 330, marginTop: 20, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", boxShadow: "var(--shadow-raised)", overflow: "hidden", animation: "ds-fade-up var(--dur-hero) var(--ease-spring) 200ms both" }}>
          <div style={{ background: "var(--surface-brand)", color: "var(--text-on-brand)", padding: "16px 20px" }}>
            <div style={{ fontSize: 10.5, letterSpacing: "var(--tracking-caps)", color: "var(--mint-400)", fontWeight: 700 }}>NPR ADMISSION QR</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, marginTop: 4, lineHeight: 1.35 }}>{session.title}</div>
          </div>
          <div style={{ padding: "18px 20px", display: "flex", gap: 16, alignItems: "center" }}>
            <QrBox code={primary.code} size={112} style={{ animation: "ds-pop var(--dur-slow) var(--ease-spring) 400ms both" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
              <KV k="예약 학생명" v={primary.name} />
              <KV k="일시" v={`${fmtSessionDate(session.date)} ${session.time}`} />
              {session.attendField && <KV k="참석 학부모" v={(primary.reservedBy || "모").split(",").join(" · ")} />}
            </div>
          </div>
          <div style={{ borderTop: "2px dashed var(--gray-3)", margin: "0 -13px", position: "relative" }}>
            <span style={{ position: "absolute", left: 0, top: -12, width: 24, height: 24, borderRadius: "50%", background: "var(--surface-page)" }} />
            <span style={{ position: "absolute", right: 0, top: -12, width: 24, height: 24, borderRadius: "50%", background: "var(--surface-page)" }} />
          </div>
          <div style={{ padding: "14px 20px 18px", background: "var(--surface-accent-soft)", display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, color: "var(--mint-700)", lineHeight: 1.55 }}>
            <Icons.message size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <b>{primary.phone}</b>로 QR이 담긴 문자를 발송했어요. 입장 시 태블릿에 QR을 보여주세요.
            </span>
          </div>
        </div>

        {doneRecs!.length > 1 && (
          <div style={{ width: "100%", maxWidth: 330, marginTop: 12, borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", padding: "14px 18px", animation: "ds-fade-up var(--dur-slow) var(--ease-out) 420ms both" }}>
            <div style={{ fontSize: 11.5, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-faint)", marginBottom: 8 }}>
              함께 예약된 자녀 {doneRecs!.length}명
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {doneRecs!.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--violet-100)", color: "var(--violet-900)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{r.name[0]}</span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "var(--text-strong)" }}>{r.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 14, width: "100%", maxWidth: 330, animation: "ds-fade-up var(--dur-slow) var(--ease-out) 520ms both" }}>
          <Button variant="secondary" fullWidth onClick={() => { setLookupPhone(primary.phone); setLookupHits(null); setLookupErr(false); setStep("lookup"); }}>
            예약변경/취소
          </Button>
          <Button fullWidth icon={<Icons.send size={15} />} onClick={() => { try { if (navigator.clipboard) navigator.clipboard.writeText("https://npr.kr/reserve"); } catch { /* clipboard 미지원 무시 */ } toast("예약 페이지 URL이 복사됐어요 — 공유해 보세요"); }}>
            URL 공유
          </Button>
        </div>
        {flashBar()}
      </div>
    </div>
  );
}
