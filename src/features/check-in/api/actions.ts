"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkIn, checkInByCode, isDomainError, rollbackEntry, walkInCheckIn } from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type CheckInState = ActionState<{ name: string; code: string }>;

/**
 * 입장 처리 (명세 §7.6 수동 체크인 · §8.5 QR 스캔 · §8.6 현장 입장 · 12.12 입장 취소).
 * 상태 전이 규칙(미체크만 체크인 / 입장 완료만 롤백)은 서비스가 판정한다.
 */

/** 수동 체크인 — 명단 행 액션 (명세 §7.6) */
export async function checkInAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = z.uuid().safeParse(formData.get("reservationId"));
  if (!parsed.success) return errorState("예약을 찾을 수 없습니다.");

  try {
    const r = await checkIn(parsed.data);
    revalidateOps();
    return successState({ name: r.name, code: r.code }, "입장 처리했습니다. 안내 문자가 발송됩니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

/** QR 스캔 입장 (명세 §8.5) */
export async function checkInByCodeAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = z.string().trim().min(1).safeParse(formData.get("code"));
  if (!parsed.success) return errorState("예약번호를 입력하세요.");

  try {
    const r = await checkInByCode(parsed.data);
    revalidateOps();
    return successState({ name: r.name, code: r.code }, "입장 완료 문자가 발송되었습니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

/**
 * 현장 입장 (명세 §8.6) — 기존 예약이 있으면 체크인, 없으면 즉석 예약 후 체크인.
 * 즉석 예약도 정원 불변식을 통과한다 (설계 §6.4).
 */
export async function walkInAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = z
    .object({ studentId: z.uuid(), sessionId: z.uuid() })
    .safeParse({ studentId: formData.get("studentId"), sessionId: formData.get("sessionId") });
  if (!parsed.success) return errorState("학생과 설명회를 선택하세요.");

  try {
    const r = await walkInCheckIn(parsed.data.studentId, parsed.data.sessionId);
    revalidateOps();
    return successState({ name: r.name, code: r.code }, "입장 완료 문자가 발송되었습니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

/** 입장 취소(롤백) — 사유 필수 (명세 12.12) */
export async function rollbackEntryAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = z
    .object({
      reservationId: z.uuid(),
      reason: z.string().trim().min(1, "취소 사유를 선택하세요.").max(200),
    })
    .safeParse({ reservationId: formData.get("reservationId"), reason: formData.get("reason") });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    const r = await rollbackEntry(parsed.data.reservationId, parsed.data.reason);
    revalidateOps();
    return successState({ name: r.name, code: r.code }, "미체크로 되돌렸습니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

function revalidateOps() {
  revalidatePath("/sessions");
  revalidatePath("/scanner");
  revalidatePath("/phone");
}

function toErrorState(e: unknown): CheckInState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
