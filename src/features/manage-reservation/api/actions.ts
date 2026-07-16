"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cancelReservation,
  isDomainError,
  moveReservation,
  reissueReservationCode,
} from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type ManageReservationState = ActionState<{ code: string }>;

/** 예약 관리 — 취소 · 회차 이동 · QR 재발급 (명세 §5.4 · §5.5 · 12.2 · 12.3 · 12.12) */

/** 취소 — 운영자(staff)/학부모 셀프(parent) 구분 기록 (명세 12.3) */
export async function cancelReservationAction(
  _prev: ManageReservationState,
  formData: FormData,
): Promise<ManageReservationState> {
  const parsed = z
    .object({ reservationId: z.uuid(), by: z.enum(["staff", "parent"]) })
    .safeParse({ reservationId: formData.get("reservationId"), by: formData.get("by") ?? "staff" });
  if (!parsed.success) return errorState("예약을 찾을 수 없습니다.");

  try {
    const r = await cancelReservation(parsed.data.reservationId, parsed.data.by);
    revalidateViews();
    return successState({ code: r.code }, "예약이 취소되었습니다. 취소 안내 문자가 발송됩니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

/** 회차 이동 — 예약번호·QR 유지. 대상 회차의 정원·중복도 검사된다 (명세 12.2) */
export async function moveReservationAction(
  _prev: ManageReservationState,
  formData: FormData,
): Promise<ManageReservationState> {
  const parsed = z
    .object({ reservationId: z.uuid(), toSessionId: z.uuid("이동할 회차를 선택하세요.") })
    .safeParse({
      reservationId: formData.get("reservationId"),
      toSessionId: formData.get("toSessionId"),
    });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    const r = await moveReservation(parsed.data.reservationId, parsed.data.toSessionId);
    revalidateViews();
    return successState({ code: r.code }, "회차가 변경되었습니다. 변경 확정 문자가 발송됩니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

/** QR 재발급 — 이전 코드는 무효화되고 codeHistory에 남는다 (명세 12.12) */
export async function reissueCodeAction(
  _prev: ManageReservationState,
  formData: FormData,
): Promise<ManageReservationState> {
  const parsed = z.uuid().safeParse(formData.get("reservationId"));
  if (!parsed.success) return errorState("예약을 찾을 수 없습니다.");

  try {
    const r = await reissueReservationCode(parsed.data);
    revalidateViews();
    return successState({ code: r.code }, `QR을 재발급했습니다. (${r.code})`);
  } catch (e) {
    return toErrorState(e);
  }
}

function revalidateViews() {
  revalidatePath("/phone");
  revalidatePath("/sessions");
  revalidatePath("/reserve");
}

function toErrorState(e: unknown): ManageReservationState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
