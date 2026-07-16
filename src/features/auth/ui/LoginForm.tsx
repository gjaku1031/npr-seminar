"use client";

import { useActionState } from "react";
import { roleLabel, type UserRole } from "@/entities/user";
import { idleState } from "@/shared/lib/action";
import { signInAction, type LoginState } from "../api/actions";

const initialState: LoginState = idleState;
const ROLES: UserRole[] = ["owner", "siljang", "gangsa"];

/**
 * 역할 선택 로그인 (명세 12.1 · flows OWNER-F1).
 * 학부모·학생은 로그인 없이 모바일 예약(/reserve)만 이용한다.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-2">
        {ROLES.map((role) => (
          <button
            key={role}
            type="submit"
            name="role"
            value={role}
            disabled={pending}
            className="rounded-sm border border-hairline bg-card px-4 py-3 text-left shadow-card transition-shadow hover:shadow-raised disabled:opacity-50"
          >
            <span className="font-semibold text-ink">{roleLabel[role]}</span>
            <span className="ml-2 text-sm text-muted">
              {role === "gangsa" ? "재원생·통계 제외" : "전체 모듈"}
            </span>
          </button>
        ))}
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
