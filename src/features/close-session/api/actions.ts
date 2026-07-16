"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteSession, endSession, isDomainError, toggleReminder } from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type SessionAdminState = ActionState<{ affected: number }>;

/** 설명회 종료·삭제·리마인드 토글 (명세 §7.3 · §7.7 · 12.4 · 12.5) */

/** 종료 — 미체크를 일괄 노쇼 태깅하고 학생 노쇼 회수를 누적한다 (명세 12.4) */
export async function endSessionAction(
  _prev: SessionAdminState,
  formData: FormData,
): Promise<SessionAdminState> {
  const parsed = z.uuid().safeParse(formData.get("sessionId"));
  if (!parsed.success) return errorState("설명회를 찾을 수 없습니다.");

  try {
    const tagged = await endSession(parsed.data);
    revalidateViews();
    return successState({ affected: tagged }, `설명회를 종료했습니다. 미체크 ${tagged}건이 노쇼 처리되었습니다.`);
  } catch (e) {
    return toErrorState(e);
  }
}

/** 삭제 — 연동 예약도 함께 제거된다 (명세 §7.7) */
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
      `설명회를 삭제했습니다. 연동 예약 ${removed}건도 삭제되어 취소 문자가 발송됩니다.`,
    );
  } catch (e) {
    return toErrorState(e);
  }
}

/** 리마인드 스케줄 토글 (명세 12.5) */
export async function toggleReminderAction(
  _prev: SessionAdminState,
  formData: FormData,
): Promise<SessionAdminState> {
  const parsed = z
    .object({
      sessionId: z.uuid(),
      reminderId: z.string().trim().min(1),
      enabled: z.coerce.boolean(),
    })
    .safeParse({
      sessionId: formData.get("sessionId"),
      reminderId: formData.get("reminderId"),
      enabled: formData.get("enabled") === "on",
    });
  if (!parsed.success) return errorState("리마인드를 찾을 수 없습니다.");

  try {
    await toggleReminder(parsed.data.sessionId, parsed.data.reminderId, parsed.data.enabled);
    revalidatePath("/sessions");
    return successState({ affected: 1 });
  } catch (e) {
    return toErrorState(e);
  }
}

function revalidateViews() {
  revalidatePath("/sessions");
  revalidatePath("/stats");
  revalidatePath("/reserve");
}

function toErrorState(e: unknown): SessionAdminState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
