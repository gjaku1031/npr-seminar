"use client";

/**
 * 예약 명단 (명세 §4, flows ADMIN-F2) — 와이어프레임 StudentsScreen 이식.
 * 설명회별 재원생 전체 + 비재원생 · 11열 가운데 정렬 · 예약 드랍다운 · 로그 툴팁 · 수동 추가.
 * 필터는 클라이언트(즉시 반응), 조작은 Server Action — 서버 불변식이 모든 경로를 지킨다 (설계 §6.4).
 */

import { Fragment, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Reservation, RosterOption } from "@/entities/reservation";
import { ROSTER_OPTIONS } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { Student } from "@/entities/student";
import type { Teacher } from "@/entities/teacher";
import { UNIT_TABS, unitMatchesTab } from "@/entities/class";
import { CAMPUSES } from "@/shared/config/campus";
import { fmtDateTime, fmtSessionDate } from "@/shared/lib/format";
import { idleState } from "@/shared/lib/action";
import { Badge, Button, Card, Dialog, EmptyState, Icons, Input, Select, Tag, Toast } from "@/shared/ui";
import { addGuestAction, setRosterReservationAction, type RosterState } from "@/features/manage-roster";

export interface StudentsViewProps {
  sessions: Session[];
  selectedSessionId: string | null;
  students: Student[];
  /** 선택 설명회의 예약 전체 (재원생 + 비재원생) */
  reservations: Reservation[];
  teachers: Teacher[];
}

type Row =
  | { key: string; guest: false; st: Student; r: Reservation | undefined }
  | { key: string; guest: true; st: null; r: Reservation };

export function StudentsView({ sessions, selectedSessionId, students, reservations, teachers }: StudentsViewProps) {
  const router = useRouter();
  const session = sessions.find((s) => s.id === selectedSessionId) ?? sessions[0];

  const [campus, setCampus] = useState("A캠퍼스");
  const [q, setQ] = useState("");
  const [unitTab, setUnitTab] = useState("전체");
  const [teacherF, setTeacherF] = useState("all");
  const [guestOpen, setGuestOpen] = useState(false);
  const [guest, setGuest] = useState({ name: "", school: "", grade: "", phone: "", campus: CAMPUSES[0] as string, via: "전화예약", who: ["모"] as string[] });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const [, startTransition] = useTransition();

  /* 드랍다운 전이 — 관리자 조작은 서버가 '수동' 로그로 기록 (명세 §4.5 · §11) */
  const changeRoster = (studentId: string, option: RosterOption) => {
    if (!session) return;
    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("sessionId", session.id);
    fd.set("option", option);
    startTransition(async () => {
      const result = await setRosterReservationAction(idleState, fd);
      flash((result.status === "idle" ? null : result.message) ?? "반영되었습니다.");
    });
  };

  const [guestState, guestFormAction, guestPending] = useActionState<RosterState, FormData>(
    async (prev, fd) => {
      const result = await addGuestAction(prev, fd);
      if (result.status === "success") {
        setGuestOpen(false);
        setGuest({ name: "", school: "", grade: "", phone: "", campus: CAMPUSES[0], via: "전화예약", who: ["모"] });
        flash(result.message ?? "수동 추가 완료");
      }
      return result;
    },
    idleState,
  );

  if (!session) return <EmptyState>등록된 설명회가 없어요.</EmptyState>;

  const resOf = (stuId: string) => reservations.find((r) => r.sessionId === session.id && r.studentId === stuId);

  const optOf = (r: Reservation | undefined): RosterOption => {
    if (!r) return "-";
    if (r.status === "cancelled") return "예약취소";
    if (r.reservedBy === "부") return "예약 (부)";
    if (r.reservedBy === "모,부") return "예약 (모,부)";
    if (r.reservedBy === "모") return "예약 (모)";
    return "수동 예약";
  };

  /* 재원생 행 + 비재원생 행 (해당 설명회 예약) — 필터 규칙은 와이어프레임 그대로 */
  const stuRows: Row[] = students.map((st) => ({ key: st.id, st, r: resOf(st.id), guest: false }));
  const guestRows: Row[] = reservations.filter((r) => r.sessionId === session.id && !r.member).map((r) => ({ key: r.id, st: null, r, guest: true }));
  const rows = [...stuRows, ...guestRows].filter((row) => {
    const campusV = row.guest ? row.r.campus : row.st.campus;
    if (campus !== "전체" && campusV !== campus) return false;
    if (row.guest) {
      if (!(unitTab === "전체" || unitTab === "비재원생") || teacherF !== "all") return false;
    } else {
      if (unitTab === "비재원생") return false;
      if (!unitMatchesTab(row.st.unit, unitTab)) return false;
      if (teacherF !== "all" && row.st.teacherName !== teacherF) return false;
    }
    const hay = row.guest
      ? row.r.name + row.r.school + row.r.phone
      : row.st.name + row.st.school + row.st.motherPhone + row.st.fatherPhone;
    if (q && !hay.includes(q)) return false;
    return true;
  });

  const entryCell = (r: Reservation | undefined) => {
    if (r && r.status === "entered" && r.enteredAt)
      return (
        <span style={{ fontSize: 11.5, lineHeight: 1.5, fontFeatureSettings: '"tnum"' }}>
          <b style={{ color: "var(--status-success)", fontWeight: 700 }}>스캐너 #{r.scannerNo}</b>
          <br />
          <span style={{ color: "var(--text-muted)" }}>{fmtDateTime(r.enteredAt)}</span>
        </span>
      );
    if (r && (r.status === "reserved" || r.status === "no_show"))
      return <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>대기</span>;
    return <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>—</span>;
  };

  const logCell = (r: Reservation | undefined) => {
    const logs = r?.logs ?? [];
    const last = logs[logs.length - 1];
    if (!last) return <span style={{ color: "var(--text-faint)" }}>—</span>;
    const history = logs.map((l) => `${l.label}  ${fmtDateTime(l.at)}`).join("\n");
    return (
      <span title={history} style={{ fontSize: 11.5, lineHeight: 1.5, fontFeatureSettings: '"tnum"', cursor: logs.length > 1 ? "help" : "default" }}>
        <b style={{ fontWeight: 700, color: "var(--text-body)" }}>{last.label}</b>
        {logs.length > 1 && (
          <span style={{ marginLeft: 5, fontSize: 10, color: "var(--text-faint)", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)", borderRadius: 999, padding: "1px 6px" }}>
            +{logs.length - 1}
          </span>
        )}
        <br />
        <span style={{ color: "var(--text-faint)" }}>{fmtDateTime(last.at)}</span>
      </span>
    );
  };

  const gridCols = "40px 66px 1fr 72px 1fr 52px 72px 126px 118px 128px 1.4fr";
  const toggleGuestWho = (w: string) =>
    setGuest((g) => {
      const has = g.who.includes(w);
      if (has && g.who.length === 1) return g;
      const next = has ? g.who.filter((x) => x !== w) : g.who.concat(w);
      return { ...g, who: ["모", "부"].filter((x) => next.includes(x)) };
    });

  return (
    <div data-screen-label="예약 명단">
      {/* 상단: 제목(좌) + 설명회 선택·캠퍼스(우측 상단 스택) (명세 §4.1) */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "nowrap", animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>RESERVATIONS</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800, whiteSpace: "nowrap" }}>예약 명단</h1>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
          <Select
            options={sessions.map((s) => ({ label: `${s.title} · ${fmtSessionDate(s.date)}`, value: s.id }))}
            value={session.id}
            onChange={(id) => router.push(`/students?id=${id}`)}
            style={{ width: 360, whiteSpace: "nowrap" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {["전체", ...CAMPUSES].map((c) => (
              <Tag key={c} selected={campus === c} onClick={() => setCampus(c)} style={{ height: 34 }}>
                {c.replace("캠퍼스", "")}
              </Tag>
            ))}
          </div>
        </div>
      </div>

      {/* 필터: 검색 + 단위 탭 + 담임 (명세 §4.2~4.3) */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
        <Input placeholder="이름·학교·연락처 검색" value={q} onChange={setQ} icon={<Icons.search size={15} />} style={{ width: 230 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[...UNIT_TABS, "비재원생"].map((t) => (
            <Tag key={t} selected={unitTab === t} onClick={() => setUnitTab(t)}>
              {t}
            </Tag>
          ))}
        </div>
        <Select
          options={[{ label: "담임 전체", value: "all" }, ...teachers.map((t) => ({ label: t.name, value: t.name }))]}
          value={teacherF}
          onChange={setTeacherF}
          style={{ width: 124 }}
        />
        <span style={{ flex: 1 }} />
        <Button icon={<Icons.plus size={16} />} onClick={() => setGuestOpen(true)}>수동 추가</Button>
      </div>

      {/* 11열 명단 테이블 (명세 §4.4) */}
      <Card padding="0" style={{ marginTop: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1150 }}>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10, padding: "11px 18px", background: "var(--surface-sunken)", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em", alignItems: "center", textAlign: "center" }}>
              <span>No</span><span>학번</span><span>학생이름</span><span>반명</span><span>학교</span><span>학년</span><span>담임명</span><span>학부모연락처</span><span>예약</span><span>입장</span><span>로그</span>
            </div>
            {rows.map((row, i) => {
              const st = row.st;
              const r = row.r;
              return (
                <div key={row.key} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 10, alignItems: "center", textAlign: "center", padding: "10px 18px", borderTop: "1px solid var(--border-hairline)", fontSize: 13, color: "var(--text-body)", background: "var(--surface-card)", animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 14) * 18}ms both` }}>
                  <span style={{ color: "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>{i + 1}</span>
                  <span style={{ fontFeatureSettings: '"tnum"', color: "var(--text-muted)", fontSize: 12 }}>{row.guest ? "—" : st!.no}</span>
                  <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{row.guest ? r!.name : st!.name}</span>
                  <span style={{ color: row.guest ? "var(--text-faint)" : "var(--text-body)" }}>{row.guest ? "비재원생" : st!.className}</span>
                  <span>{row.guest ? r!.school : st!.school}</span>
                  <span>{row.guest ? r!.grade : st!.grade}</span>
                  <span>{row.guest ? <span style={{ color: "var(--text-faint)" }}>—</span> : st!.teacherName}</span>
                  <span style={{ fontFeatureSettings: '"tnum"', fontSize: 11.5, lineHeight: 1.5 }}>
                    {row.guest ? (
                      r!.phone
                    ) : (
                      <Fragment>
                        <span style={{ color: "var(--text-muted)" }}>모 {st!.motherPhone}</span>
                        <br />
                        <span style={{ color: "var(--text-faint)" }}>부 {st!.fatherPhone}</span>
                      </Fragment>
                    )}
                  </span>
                  <span>
                    {row.guest ? (
                      <Badge tone={r!.status === "cancelled" ? "danger" : "brand"} size="sm">
                        {r!.status === "cancelled" ? "예약취소" : r!.source}
                      </Badge>
                    ) : (
                      <select
                        value={optOf(r)}
                        onChange={(e) => changeRoster(st!.id, e.target.value as RosterOption)}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-soft)", background: optOf(r) === "-" ? "var(--surface-card)" : optOf(r) === "예약취소" ? "var(--status-danger-soft)" : "var(--surface-brand-soft)", color: optOf(r) === "예약취소" ? "var(--status-danger)" : "var(--text-strong)", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", textAlignLast: "center" }}
                      >
                        {ROSTER_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    )}
                  </span>
                  <span>{entryCell(r)}</span>
                  <span style={{ fontSize: 11.5 }}>{logCell(r)}</span>
                </div>
              );
            })}
            {rows.length === 0 && <EmptyState>조건에 맞는 명단이 없어요.</EmptyState>}
          </div>
        </div>
      </Card>

      {/* 수동 추가 (비재원생) — 모/부 탭 + 경로 3종 (명세 §4.8) */}
      <Dialog
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
        title="수동 추가"
        width={460}
        footer={
          <Fragment>
            <Button variant="ghost" onClick={() => setGuestOpen(false)}>취소</Button>
            <Button
              disabled={!guest.name || !guest.phone || guestPending}
              icon={<Icons.plus size={15} />}
              onClick={() => {
                const fd = new FormData();
                fd.set("sessionId", session.id);
                fd.set("name", guest.name);
                fd.set("phone", guest.phone);
                fd.set("school", guest.school);
                fd.set("grade", guest.grade);
                fd.set("campus", guest.campus);
                fd.set("reservedBy", guest.who.join(","));
                fd.set("source", guest.via);
                startTransition(() => guestFormAction(fd));
              }}
            >
              {guestPending ? "추가 중…" : "추가"}
            </Button>
          </Fragment>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
            반명은 <b>비재원생</b>, 담임은 공란으로 명단에 추가되며 <b>{session.title}</b> 예약으로 등록돼요.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="이름 *" value={guest.name} onChange={(v) => setGuest({ ...guest, name: v })} />
            <Input label="연락처 *" placeholder="010-0000-0000" value={guest.phone} onChange={(v) => setGuest({ ...guest, phone: v })} />
            <Input label="학교" value={guest.school} onChange={(v) => setGuest({ ...guest, school: v })} />
            <Input label="학년" placeholder="예: 중3" value={guest.grade} onChange={(v) => setGuest({ ...guest, grade: v })} />
          </div>
          <Select label="캠퍼스" options={CAMPUSES.map((c) => ({ label: c, value: c }))} value={guest.campus} onChange={(v) => setGuest({ ...guest, campus: v })} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)" }}>
              참석 학부모 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(모·부 복수 선택 가능)</span>
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {["모", "부"].map((w) => (
                <Tag key={w} selected={guest.who.includes(w)} onClick={() => toggleGuestWho(w)} style={{ height: 34, minWidth: 64, justifyContent: "center" }}>
                  {w}
                </Tag>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)" }}>예약 경로</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["전화예약", "선생님 예약", "현장 예약"].map((v) => (
                <Tag key={v} selected={guest.via === v} onClick={() => setGuest({ ...guest, via: v })} style={{ height: 34 }}>
                  {v}
                </Tag>
              ))}
            </div>
          </div>
          {guestState.status === "error" && (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--status-danger)", margin: 0 }}>{guestState.message}</p>
          )}
        </div>
      </Dialog>

      {toast && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 120 }}>
          <Toast tone="success">{toast}</Toast>
        </div>
      )}
    </div>
  );
}
