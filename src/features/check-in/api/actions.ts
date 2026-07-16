"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkIn, checkInByCode, isDomainError, rollbackEntry, walkInCheckIn } from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type CheckInState = ActionState<{ name: string; code: string }>;

/**
 * 입장 처리 (명세 §9.2~9.3) — QR 스캔·현장 입장·입장 취소.
 * v4.0: 스캐너 번호를 기록해 명단 입장 열에 `#N ↵ 시각`으로 표기한다 (명세 §4.6).
 */

const scannerNoSchema = z.coerce.number().int().min(1).max(4).default(1);

/** QR 스캔 입장 (명세 §9.2) — 성공 시 "○○ 학부모님 입장 확인" 팝업은 화면이 담당 */
export async function checkInByCodeAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = z
    .object({ code: z.string().trim().min(1, "예약번호를 입력하세요."), scannerNo: scannerNoSchema })
    .safeParse({ code: formData.get("code"), scannerNo: formData.get("scannerNo") ?? 1 });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    const r = await checkInByCode(parsed.data.code, parsed.data.scannerNo);
    revalidateOps();
    return successState({ name: r.name, code: r.code }, `${r.name} 학부모님 입장 확인되셨습니다.`);
  } catch (e) {
    return toErrorState(e);
  }
}

/** 예약 id로 입장 — 스캔 데모·현장 기존 예약 체크인 (명세 §9.3) */
export async function checkInAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = z
    .object({ reservationId: z.uuid(), scannerNo: scannerNoSchema })
    .safeParse({ reservationId: formData.get("reservationId"), scannerNo: formData.get("scannerNo") ?? 1 });
  if (!parsed.success) return errorState("예약을 찾을 수 없습니다.");

  try {
    const r = await checkIn(parsed.data.reservationId, parsed.data.scannerNo);
    revalidateOps();
    return successState({ name: r.name, code: r.code }, `${r.name} 학부모님 입장 확인되셨습니다.`);
  } catch (e) {
    return toErrorState(e);
  }
}

/**
 * 현장 입장 — 재원생·무예약이면 즉석 예약(현장 예약) 후 체크인 (명세 §9.3).
 * 즉석 예약도 정원 불변식을 통과한다 (설계 §6.4).
 */
export async function walkInAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  const parsed = z
    .object({ studentId: z.uuid(), sessionId: z.uuid(), scannerNo: scannerNoSchema })
    .safeParse({
      studentId: formData.get("studentId"),
      sessionId: formData.get("sessionId"),
      scannerNo: formData.get("scannerNo") ?? 1,
    });
  if (!parsed.success) return errorState("학생과 설명회를 선택하세요.");

  try {
    const r = await walkInCheckIn(parsed.data.studentId, parsed.data.sessionId, parsed.data.scannerNo);
    revalidateOps();
    return successState({ name: r.name, code: r.code }, `${r.name} 학부모님 입장 확인되셨습니다.`);
  } catch (e) {
    return toErrorState(e);
  }
}

/** 입장 취소(롤백) — 사유 필수 */
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
  revalidatePath("/students");
  revalidatePath("/stats");
  revalidatePath("/");
}

function toErrorState(e: unknown): CheckInState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
