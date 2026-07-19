"use client";

/**
 * 새 설명회 생성 다이얼로그 (명세 §6.2) — 와이어프레임 SessionsScreen 생성 모달 이식.
 * 명*·날짜*·회차·정원·장소* + 설명 + 참석 인원 토글 + 페이지 꾸미기(배너 3종·안내문).
 * ⚠️ 시작 시각 입력 없음 — 10:00 고정 저장 (명세 §6.2 공백 그대로).
 */

import { Fragment, useActionState, useState, useTransition } from "react";
import type { BannerTheme } from "@/entities/session";
import { idleState } from "@/shared/lib/action";
import { Button, Dialog, Icons, Input, Switch } from "@/shared/ui";
import { createSessionAction, type CreateSessionState } from "../api/actions";

const BANNERS: Array<[BannerTheme, string, string]> = [
  ["violet", "포레스트", "var(--violet-900)"],
  ["mint", "틸 블루", "var(--mint-500)"],
  ["slate", "딥 포레스트", "var(--violet-950)"],
];

const EMPTY = { title: "", date: "", round: "1회차", place: "", capacity: "", desc: "", attendField: false, notice: "", banner: "violet" as BannerTheme };

export function CreateSessionDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string, message: string) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [, startTransition] = useTransition();

  const [state, formAction, pending] = useActionState<CreateSessionState, FormData>(
    async (prev, fd) => {
      const result = await createSessionAction(prev, fd);
      if (result.status === "success" && result.data) {
        setForm(EMPTY);
        onClose();
        onCreated?.(result.data.id, result.message ?? "설명회가 생성됐어요");
      }
      return result;
    },
    idleState,
  );

  const submit = () => {
    const fd = new FormData();
    fd.set("title", form.title);
    fd.set("date", form.date);
    fd.set("round", String(parseInt(form.round, 10) || 1));
    fd.set("place", form.place);
    fd.set("capacity", form.capacity || "50");
    fd.set("desc", form.desc);
    if (form.attendField) fd.set("attendField", "on");
    fd.set("banner", form.banner);
    fd.set("notice", form.notice);
    startTransition(() => formAction(fd));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="새 설명회 만들기"
      width={520}
      footer={
        <Fragment>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button disabled={!form.title || !form.date || !form.place || pending} onClick={submit} icon={<Icons.check size={15} />}>
            {pending ? "생성 중…" : "생성하기"}
          </Button>
        </Fragment>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input label="설명회명" placeholder="2027 대입설명회" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
          <Input label="날짜" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          <Input label="회차" placeholder="1회차" value={form.round} onChange={(v) => setForm({ ...form, round: v })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,0.9fr)", gap: 12 }}>
          <Input label="장소" placeholder="A 교통회관 2층 대강당" value={form.place} onChange={(v) => setForm({ ...form, place: v })} />
          <Input label="정원" placeholder="800" value={form.capacity} onChange={(v) => setForm({ ...form, capacity: v })} />
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>
            설명 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(선택)</span>
          </span>
          <textarea
            value={form.desc}
            onChange={(e) => setForm({ ...form, desc: e.target.value })}
            rows={3}
            placeholder="설명회 소개를 입력하세요"
            style={{ width: "100%", padding: "12px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--text-strong)", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)" }}>
          <Switch label="참석 인원 필드" checked={form.attendField} onChange={(v) => setForm({ ...form, attendField: v })} />
          <span style={{ fontSize: 12, color: "var(--text-faint)", paddingLeft: 56 }}>예약 화면에서 참석 인원을 선택받습니다.</span>
        </div>
        {/* 페이지 꾸미기 (명세 §6.2) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Icons.image size={15} style={{ color: "var(--violet-800)" }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-strong)" }}>
              페이지 꾸미기 <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(모바일 예약 화면)</span>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>배너 테마</span>
            <div style={{ display: "flex", gap: 8 }}>
              {BANNERS.map(([k, lbl, col]) => (
                <button
                  key={k}
                  onClick={() => setForm({ ...form, banner: k })}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: "var(--radius-pill)", border: form.banner === k ? "1.5px solid var(--violet-800)" : "1px solid var(--border-soft)", background: form.banner === k ? "var(--surface-brand-soft)" : "var(--surface-card)", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 600, color: "var(--text-body)" }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: col }} />
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>안내문</span>
            <textarea
              value={form.notice}
              onChange={(e) => setForm({ ...form, notice: e.target.value })}
              rows={2}
              placeholder="예: 주차는 본관 지하를 이용해 주세요."
              style={{ width: "100%", padding: "11px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.55, color: "var(--text-strong)", resize: "vertical", outline: "none", boxSizing: "border-box" }}
            />
          </label>
        </div>
        {state.status === "error" && (
          <p role="alert" style={{ fontSize: 12.5, color: "var(--status-danger)", margin: 0 }}>{state.message}</p>
        )}
      </div>
    </Dialog>
  );
}
