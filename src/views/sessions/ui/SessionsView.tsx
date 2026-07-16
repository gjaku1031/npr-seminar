"use client";

/**
 * 설명회 운영 (명세 §6, flows ADMIN-F4) — 와이어프레임 SessionsScreen 이식.
 * 목록(드래그 리사이즈 사이드바 190~460px) · 현황 스탯 4장 · 만족도 설문 문자 편집·발송 ·
 * 설문 결과 9열(+엑셀 목업) · 종료(내부 노쇼)·삭제. 조작은 Server Action.
 */

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { SurveyResponse } from "@/entities/survey";
import { SURVEY_SMS_VARIABLES, smsByteLength } from "@/entities/sms";
import { fmtSessionDate } from "@/shared/lib/format";
import { idleState } from "@/shared/lib/action";
import { Badge, Button, Card, Dialog, Icons, StatCard, Toast } from "@/shared/ui";
import { CreateSessionDialog } from "@/features/create-session";
import { deleteSessionAction, endSessionAction } from "@/features/close-session";
import { saveSurveySmsAction, sendSurveyAction } from "@/features/manage-survey";

export interface SessionsViewProps {
  sessions: Session[];
  /** 전 세션 예약 — 목록 게이지·현황 집계 (와이어프레임과 동일하게 클라이언트 계산) */
  reservations: Reservation[];
  /** 전 세션 설문 응답 */
  surveys: SurveyResponse[];
}

export function SessionsView({ sessions, reservations, surveys }: SessionsViewProps) {
  const [selId, setSelId] = useState(sessions[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* 좌측 사이드바 폭 드래그 조절 (명세 §6.1: 190~460px) */
  const [sideW, setSideW] = useState(300);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const sw = sideW;
    const mv = (ev: MouseEvent) => setSideW(Math.max(190, Math.min(460, sw + ev.clientX - sx)));
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  const session = sessions.find((s) => s.id === selId) ?? sessions[0];

  /* 설문 문자 편집 — 로컬 입력 + blur/칩 클릭 시 저장 (명세 §6.4).
     세션 전환·서버 저장 반영 시 렌더 중 상태 조정으로 동기화(React 권장 패턴 — 이펙트 아님). */
  const [surveyText, setSurveyText] = useState(session?.surveySms ?? "");
  const [syncedFrom, setSyncedFrom] = useState({ id: session?.id, sms: session?.surveySms });
  if (syncedFrom.id !== session?.id || syncedFrom.sms !== session?.surveySms) {
    setSyncedFrom({ id: session?.id, sms: session?.surveySms });
    setSurveyText(session?.surveySms ?? "");
  }
  const saveSurveyText = (text: string) => {
    if (!session || text === session.surveySms) return;
    const fd = new FormData();
    fd.set("sessionId", session.id);
    fd.set("body", text);
    startTransition(async () => {
      const result = await saveSurveySmsAction(idleState, fd);
      if (result.status === "error") flash(result.message);
    });
  };

  if (!session) {
    return (
      <div data-screen-label="설명회 운영 대시보드">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
          <Button icon={<Icons.plus size={16} />} onClick={() => setCreateOpen(true)}>새 설명회</Button>
        </div>
        <CreateSessionDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id, m) => { setSelId(id); flash(m); }} />
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>등록된 설명회가 없어요. 새 설명회를 만들어 보세요.</div>
        {toast && (
          <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 120 }}>
            <Toast tone="success">{toast}</Toast>
          </div>
        )}
      </div>
    );
  }

  const rs = reservations.filter((r) => r.sessionId === session.id);
  const entered = rs.filter((r) => r.status === "entered");
  const unchecked = rs.filter((r) => r.status === "reserved");
  const cancelled = rs.filter((r) => r.status === "cancelled");
  const activeRs = rs.filter((r) => r.status !== "cancelled" && r.status !== "no_show");
  const occupancy = Math.round((activeRs.length / session.capacity) * 100);

  const surveyRs = surveys.filter((v) => v.sessionId === session.id);
  const avgRating = surveyRs.length ? surveyRs.reduce((a, b) => a + b.rating, 0) / surveyRs.length : 0;
  const respRate = entered.length ? Math.round((surveyRs.length / entered.length) * 100) : 0;
  const smsBytes = smsByteLength(surveyText);

  const runAction = (
    invoke: (fd: FormData) => Promise<{ status: string; message?: string }>,
    after?: () => void,
  ) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("sessionId", session.id);
      const result = await invoke(fd);
      flash(result.message ?? (result.status === "error" ? "처리하지 못했어요." : "완료했어요."));
      if (result.status === "success") after?.();
    });

  const doEnd = () => runAction((fd) => endSessionAction(idleState, fd), () => setEndOpen(false));
  const doDelete = () =>
    runAction((fd) => deleteSessionAction(idleState, fd), () => {
      setDelOpen(false);
      setSelId(sessions.find((s) => s.id !== session.id)?.id ?? "");
    });
  const doSurveySend = () => runAction((fd) => sendSurveyAction(idleState, fd));

  const unitShort = (u: string) => (u === "중등1" ? "중1" : u === "중등2" ? "중2" : u === "중등3" ? "중3" : u || "—");

  return (
    <div data-screen-label="설명회 운영 대시보드">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>QR OPERATIONS</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        </div>
        <Button icon={<Icons.plus size={16} />} onClick={() => setCreateOpen(true)}>새 설명회</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `${sideW}px 14px 1fr`, marginTop: 20, alignItems: "start" }}>
        {/* 설명회 목록 (명세 §6.1) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map((s, i) => {
            const srs = reservations.filter((r) => r.sessionId === s.id && r.status !== "cancelled");
            const sel = s.id === selId;
            return (
              <div
                key={s.id}
                onClick={() => setSelId(s.id)}
                style={{ padding: "16px 18px", borderRadius: "var(--radius-lg)", cursor: "pointer", background: sel ? "var(--surface-brand-soft)" : "var(--surface-card)", color: "var(--text-body)", border: sel ? "1.5px solid var(--violet-800)" : "1px solid var(--border-hairline)", boxShadow: sel ? "var(--shadow-accent-glow)" : "var(--shadow-card)", transform: sel ? "scale(1.02)" : "scale(1)", transition: "all var(--dur-base) var(--ease-spring)", animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${i * 70}ms both` }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: sel ? "var(--text-brand)" : "var(--text-strong)", lineHeight: 1.4 }}>{s.title}</div>
                <div style={{ fontSize: 12, marginTop: 5, color: "var(--text-muted)" }}>
                  {fmtSessionDate(s.date)} · {s.round}회차 · {s.time}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <span style={{ flex: 1, height: 5, borderRadius: 3, background: sel ? "var(--violet-100)" : "var(--gray-2)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.min(100, (srs.length / s.capacity) * 100)}%`, background: sel ? "var(--violet-700)" : "var(--violet-600)", transition: "width var(--dur-hero) var(--ease-smooth)" }} />
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, fontFeatureSettings: '"tnum"', color: sel ? "var(--text-brand)" : "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {srs.length}/{s.capacity}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 폭 조절 핸들 (명세 §6.1) */}
        <div onMouseDown={startDrag} title="드래그하여 폭 조절" style={{ cursor: "col-resize", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 4, height: 52, borderRadius: 2, background: "var(--gray-3)" }} />
        </div>

        {/* 선택 설명회 대시보드 */}
        <div key={session.id} style={{ display: "flex", flexDirection: "column", gap: 14, animation: "ds-fade-up var(--dur-base) var(--ease-out) both" }}>
          <Card padding="20px 24px" style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>{session.title}</h2>
                {session.attendField && <Badge tone="accent" size="sm">참석 인원 수집</Badge>}
                {session.ended && <Badge tone="neutral" size="sm">종료됨</Badge>}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5, display: "flex", gap: 14 }}>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Icons.calendar size={13} /> {fmtSessionDate(session.date)} {session.time}</span>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Icons.mapPin size={13} /> {session.place}</span>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Icons.users size={13} /> 정원 {session.capacity}명</span>
              </div>
              {session.desc && <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 6 }}>{session.desc}</div>}
            </div>
            <div style={{ textAlign: "center", padding: "0 8px" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, color: occupancy >= 90 ? "var(--status-danger)" : "var(--violet-800)", fontFeatureSettings: '"tnum"', whiteSpace: "nowrap" }}>{occupancy}%</div>
              <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>예약률</div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {!session.ended && (
                <a onClick={() => setEndOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <Icons.check size={12} /> 설명회 종료
                </a>
              )}
              <a onClick={() => setDelOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, color: "var(--status-danger)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", whiteSpace: "nowrap" }}>
                <Icons.trash size={12} /> 삭제
              </a>
            </div>
          </Card>

          {/* 현황 스탯 4장 (명세 §6.3) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatCard label="총 예약" value={activeRs.length} suffix={`/ ${session.capacity}`} tone="brand" icon={<Icons.ticket size={15} />} delay={0} />
            <StatCard label="입장 완료" value={entered.length} suffix="명" tone="success" icon={<Icons.check size={15} />} delay={50} />
            <StatCard label="미체크" value={unchecked.length} suffix="명" tone="accent" icon={<Icons.clock size={15} />} delay={100} />
            <StatCard label="취소" value={cancelled.length} suffix="건" tone="danger" icon={<Icons.x size={15} />} delay={150} />
          </div>

          {/* 만족도 설문 보내기 (명세 §6.4) */}
          <Card padding="18px 20px">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.star size={15} style={{ color: "var(--mint-600)" }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>만족도 설문 보내기</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                대상: 참석(입장 완료) 학부모 <b style={{ color: "var(--text-strong)", fontFeatureSettings: '"tnum"' }}>{entered.length}명</b>
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4, marginBottom: 10 }}>
              학부모님이 문자 속 URL로 들어가 <b>별점 · 후기 · 사진</b>을 남깁니다. 문자 내용은 여기서 수정해요.
            </div>
            <textarea
              value={surveyText}
              onChange={(e) => setSurveyText(e.target.value)}
              onBlur={() => saveSurveyText(surveyText)}
              rows={3}
              style={{ width: "100%", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-strong)", resize: "vertical", outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>변수</span>
              {SURVEY_SMS_VARIABLES.map((v) => (
                <button
                  key={v}
                  onClick={() => { const next = surveyText + v; setSurveyText(next); saveSurveyText(next); }}
                  style={{ padding: "4px 10px", borderRadius: "var(--radius-pill)", border: "1px dashed var(--mint-500)", background: "var(--mint-50)", color: "var(--mint-700)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  {v}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 12, color: smsBytes > 90 ? "var(--status-warning)" : "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>
                {smsBytes} byte · {smsBytes > 90 ? "LMS" : "SMS"}
              </span>
              <Button size="sm" icon={<Icons.send size={14} />} disabled={entered.length === 0 || pending} onClick={doSurveySend}>
                {pending ? "발송 중…" : "설문 보내기"}
              </Button>
            </div>
          </Card>

          {/* 만족도 설문 결과 9열 (명세 §6.5) */}
          <Card padding="0" style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderBottom: "1px solid var(--border-hairline)" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>만족도 설문 결과</span>
              <span style={{ fontSize: 12.5, color: "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>
                {surveyRs.length}건 · 응답률 {respRate}%
              </span>
              <span style={{ flex: 1 }} />
              {surveyRs.length > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "var(--mint-600)" }}>
                  <Icons.star size={13} style={{ color: "var(--mint-500)" }} /> 평균 {avgRating.toFixed(1)}
                </span>
              )}
              <Button variant="ghost" size="sm" icon={<Icons.download size={13} />} disabled={surveyRs.length === 0} onClick={() => flash(`설문 결과 ${surveyRs.length}건을 엑셀(.xlsx)로 저장했어요 — 첨부 사진 파일 포함`)}>
                엑셀 저장
              </Button>
            </div>
            {surveyRs.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>
                아직 응답이 없어요. 설명회 종료 후 설문을 보내보세요.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 980 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "80px 52px 72px 66px 66px 118px 92px 1.6fr 112px", gap: 10, padding: "10px 20px", background: "var(--surface-sunken)", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)" }}>
                    <span>캠퍼스</span><span>단위명</span><span>학생명</span><span>반명</span><span>담임명</span><span>학부모HP</span><span>별점</span><span>후기</span><span>사진첨부</span>
                  </div>
                  {surveyRs.map((v, i) => (
                    <div key={v.id} style={{ display: "grid", gridTemplateColumns: "80px 52px 72px 66px 66px 118px 92px 1.6fr 112px", gap: 10, alignItems: "center", padding: "11px 20px", borderTop: "1px solid var(--border-hairline)", fontSize: 12.5, color: "var(--text-body)", animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 10) * 30}ms both` }}>
                      <span>{(v.campus || "").replace("캠퍼스", "")}</span>
                      <span>{unitShort(v.unit)}</span>
                      <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{v.student}</span>
                      <span>{v.className}</span>
                      <span>{v.teacherName || "—"}</span>
                      <span style={{ fontFeatureSettings: '"tnum"', fontSize: 11.5 }}>{v.phone}</span>
                      <span style={{ display: "flex", gap: 1 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <svg key={n} width={11} height={11} viewBox="0 0 24 24" fill={n <= v.rating ? "var(--mint-500)" : "none"} stroke={n <= v.rating ? "var(--mint-500)" : "var(--gray-3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z" />
                          </svg>
                        ))}
                      </span>
                      <span title={v.comment || ""} style={{ color: v.comment ? "var(--text-body)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: v.comment && v.comment.length > 20 ? "help" : "default" }}>
                        {v.comment || "—"}
                      </span>
                      <span>
                        {v.photo ? (
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); flash(`${v.photoName || "사진.jpg"} 다운로드를 시작했어요`); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: "var(--violet-800)", textDecoration: "underline", textUnderlineOffset: 2 }}
                          >
                            <Icons.download size={11} />
                            {v.photoName || "사진.jpg"}
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 새 설명회 생성 (명세 §6.2) */}
      <CreateSessionDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id, m) => { setSelId(id); flash(m); }} />

      {/* 삭제 확인 (명세 §6.7) */}
      <Dialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="설명회를 삭제할까요?"
        footer={
          <Fragment>
            <Button variant="ghost" onClick={() => setDelOpen(false)}>돌아가기</Button>
            <Button variant="danger" onClick={doDelete} disabled={pending} icon={<Icons.trash size={14} />}>삭제</Button>
          </Fragment>
        }
      >
        <span>
          <b>{session.title}</b>과 예약 {activeRs.length}건이 함께 삭제됩니다. 예약자에게 취소 안내 문자가 발송돼요.
        </span>
      </Dialog>

      {/* 설명회 종료 (명세 §6.6) */}
      <Dialog
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title="설명회를 종료할까요?"
        width={440}
        footer={
          <Fragment>
            <Button variant="ghost" onClick={() => setEndOpen(false)}>돌아가기</Button>
            <Button onClick={doEnd} disabled={pending} icon={<Icons.check size={15} />}>종료 처리</Button>
          </Fragment>
        }
      >
        <span style={{ lineHeight: 1.55 }}>
          <b>{session.title}</b>을 종료합니다. 미입장 <b>{unchecked.length}명</b>은 내부 노쇼로 집계돼요(명단에는 표시되지 않음). 종료 후 참석 학부모에게 설문을 보낼 수 있어요.
        </span>
      </Dialog>

      {toast && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 120 }}>
          <Toast tone="success">{toast}</Toast>
        </div>
      )}
    </div>
  );
}
