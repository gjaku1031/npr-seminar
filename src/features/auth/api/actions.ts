"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/server/services";

/** 단일 관리자 로그인 (명세 §1.1 · flows ADMIN-F1) — 역할 선택 없음 */
export async function signInAction(): Promise<void> {
  await signIn();
  redirect("/");
}

/** 아바타 메뉴 → 로그아웃 (flows ADMIN-F1-05) */
export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
