"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteSession, endSession, isDomainError } from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type SessionAdminState = ActionState<{ affected: number }>;

/** 설명회 종료·삭제 (명세 §6.6~6.7). v4.0: 리마인드 토글 폐기. */

/** 종료 — 미체크를 내부 노쇼로 일괄 태깅 (명단 미표기 · 통계용, 명세 §6.6) */
export async function endSessionAction(
  _prev: SessionAdminState,
  formData: FormData,
): Promise<SessionAdminState> {
  const parsed = z.uuid().safeParse(formData.get("sessionId"));
  if (!parsed.success) return errorState("설명회를 찾을 수 없습니다.");

  try {
    const tagged = await endSession(parsed.data);
    revalidateViews();
    return successState({ affected: tagged }, `설명회를 종료했습니다. 미체크 ${tagged}건이 내부 노쇼 집계되었습니다.`);
  } catch (e) {
    return toErrorState(e);
  }
}

/** 삭제 — 연동 예약도 함께 제거된다 (명세 §6.7) */
export async function deleteSessionAction(
  _prev: SessionAdminState,
  formData: FormData,
): Promise<SessionAdminState> {
  const parsed = z.uuid().safeParse(formData.get("sessionId"));
  if (!parsed.success) return errorState("설명회를 찾을 수 없습니다.");

  try {
    const removed = await deleteSession(parsed.data);
    revalidateViews();
    return successState(
      { affected: removed },
      `설명회를 삭제했습니다. 연동 예약 ${removed}건도 삭제되어 취소 안내 문자가 발송됩니다.`,
    );
  } catch (e) {
    return toErrorState(e);
  }
}

function revalidateViews() {
  revalidatePath("/sessions");
  revalidatePath("/students");
  revalidatePath("/stats");
  revalidatePath("/reserve");
  revalidatePath("/");
}

function toErrorState(e: unknown): SessionAdminState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
