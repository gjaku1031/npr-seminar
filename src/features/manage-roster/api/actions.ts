"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addGuestReservation, isDomainError, setRosterReservation } from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type RosterState = ActionState<{ status: string | null }>;

/**
 * 예약 명단 조작 (명세 §4.5 · §4.8) — 드랍다운 상태 전이 + 수동 추가(비재원생).
 * 관리자 조작은 행위자 기준 '수동 예약'/'수동 예약 취소' 로그로 남는다 (명세 §11).
 */

const rosterSchema = z.object({
  studentId: z.uuid(),
  sessionId: z.uuid(),
  option: z.enum(["-", "예약 (모)", "예약 (부)", "예약 (모,부)", "수동 예약", "예약취소"]),
});

/** 드랍다운 전이 — `-`/예약(모/부/모,부)/수동 예약/예약취소 (명세 §4.5) */
export async function setRosterReservationAction(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  const parsed = rosterSchema.safeParse({
    studentId: formData.get("studentId"),
    sessionId: formData.get("sessionId"),
    option: formData.get("option"),
  });
  if (!parsed.success) return errorState("입력값을 확인하세요.");

  try {
    const r = await setRosterReservation(parsed.data.studentId, parsed.data.sessionId, parsed.data.option);
    revalidateViews();
    return successState(
      { status: r?.status ?? null },
      parsed.data.option === "-"
        ? "예약을 제거했습니다."
        : parsed.data.option === "예약취소"
          ? "예약을 취소했습니다. 취소 안내 문자가 발송됩니다."
          : "예약이 반영되었습니다. 확정 문자가 발송됩니다.",
    );
  } catch (e) {
    return toErrorState(e);
  }
}

const guestSchema = z.object({
  sessionId: z.uuid("설명회를 선택하세요."),
  name: z.string().trim().min(1, "이름을 입력하세요.").max(50),
  phone: z.string().trim().regex(/^[\d-]{9,20}$/, "연락처를 확인하세요."),
  school: z.string().trim().max(50).default(""),
  grade: z.string().trim().max(20).default(""),
  campus: z.enum(["A캠퍼스", "B캠퍼스", "C캠퍼스"], { message: "캠퍼스를 선택하세요." }),
  reservedBy: z.enum(["모", "부", "모,부", ""]).default(""),
  source: z.enum(["전화예약", "선생님 예약", "현장 예약"], { message: "예약 경로를 선택하세요." }),
});

/** 수동 추가 — 비재원생: 반명 '비재원생', 담임 공란, source=선택 경로 (명세 §4.8) */
export async function addGuestAction(_prev: RosterState, formData: FormData): Promise<RosterState> {
  const parsed = guestSchema.safeParse({
    sessionId: formData.get("sessionId"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    school: formData.get("school") ?? "",
    grade: formData.get("grade") ?? "",
    campus: formData.get("campus"),
    reservedBy: formData.get("reservedBy") ?? "",
    source: formData.get("source"),
  });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    await addGuestReservation({ ...parsed.data, attendCount: 1 });
    revalidateViews();
    return successState({ status: "reserved" }, "명단에 추가했습니다. 확정 문자가 발송됩니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

function revalidateViews() {
  revalidatePath("/students");
  revalidatePath("/sessions");
  revalidatePath("/stats");
  revalidatePath("/");
}

function toErrorState(e: unknown): RosterState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
