"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/server/services";
import { errorState, type ActionState } from "@/shared/lib/action";

export type LoginState = ActionState<never>;

/** 역할 선택 로그인 (명세 12.1 · flows OWNER-F1: 원장/실장/강사) */
export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.enum(["owner", "siljang", "gangsa"]).safeParse(formData.get("role"));
  if (!parsed.success) return errorState("역할을 선택하세요.");

  await signIn(parsed.data);
  redirect("/");
}

/** 아바타 메뉴 → 로그아웃 (flows OWNER-F1) */
export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
