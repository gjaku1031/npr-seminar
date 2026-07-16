"use client";

import { useActionState } from "react";
import { bannerThemeLabel, type BannerTheme } from "@/entities/session";
import { idleState } from "@/shared/lib/action";
import { createSessionAction, type CreateSessionState } from "../api/actions";

const initialState: CreateSessionState = idleState;
const BANNERS: BannerTheme[] = ["navy", "blue", "sky", "ink"];

/** 설명회 생성 모달 폼 (명세 §7.2). 스타일은 디자인 토큰 유틸리티 사용 — 컴포넌트 정식화는 shared/ui 대기. */
export function CreateSessionForm() {
  const [state, formAction, pending] = useActionState(createSessionAction, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-hairline bg-card p-4 shadow-card">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted">설명회명 *</span>
          <input name="title" required maxLength={100} className="w-full rounded-xs border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">날짜 *</span>
          <input name="date" type="date" required className="w-full rounded-xs border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">시작 시각</span>
          <input name="time" type="time" defaultValue="10:00" className="w-full rounded-xs border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">회차</span>
          <input name="round" type="number" min={1} defaultValue={1} className="w-full rounded-xs border border-line px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">정원 *</span>
          <input name="capacity" type="number" min={1} required defaultValue={40} className="w-full rounded-xs border border-line px-3 py-2" />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted">장소 *</span>
          <input name="place" required maxLength={100} className="w-full rounded-xs border border-line px-3 py-2" />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-muted">설명</span>
          <textarea name="desc" rows={2} maxLength={1000} className="w-full rounded-xs border border-line px-3 py-2" />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input name="attendField" type="checkbox" />
        <span>참석 인원 수집 (1~4명)</span>
      </label>

      {/* 페이지 꾸미기 (명세 12.11) */}
      <fieldset className="rounded-xs border border-hairline p-3">
        <legend className="px-1 text-sm text-muted">페이지 꾸미기</legend>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">배너 테마</span>
          <select name="banner" defaultValue="navy" className="w-full rounded-xs border border-line px-3 py-2">
            {BANNERS.map((b) => (
              <option key={b} value={b}>
                {bannerThemeLabel[b]}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2 block text-sm">
          <span className="mb-1 block text-muted">안내문</span>
          <textarea name="notice" rows={2} maxLength={1000} className="w-full rounded-xs border border-line px-3 py-2" />
        </label>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xs bg-brand px-4 py-2 text-sm font-medium text-on-brand transition-colors disabled:opacity-50"
      >
        {pending ? "생성 중…" : "설명회 생성"}
      </button>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.status === "success" && <p className="text-sm text-success">{state.message}</p>}
    </form>
  );
}
