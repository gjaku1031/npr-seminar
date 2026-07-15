"use client";

import { useActionState } from "react";
import { createSeminarAction, type CreateSeminarState } from "../api/actions";

const initialState: CreateSeminarState = { status: "idle" };

/** 스타일은 임시(새 디자인 시스템 대기, 설계 §8). 폼 추상화(RHF+zod)는 폼이 늘어나면 shared/ui/form에. */
export function CreateSeminarForm() {
  const [state, formAction, pending] = useActionState(createSeminarAction, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-gray-200 p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">제목</span>
        <input
          name="title"
          type="text"
          required
          maxLength={100}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">발표자</span>
        <input
          name="speaker"
          type="text"
          required
          maxLength={50}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-gray-600">일시</span>
        <input
          name="startsAt"
          type="datetime-local"
          required
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "등록 중…" : "세미나 등록"}
      </button>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.status === "success" && <p className="text-sm text-green-700">등록되었습니다.</p>}
    </form>
  );
}
