"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createFamilyReservation,
  createGuestReservation,
  isDomainError,
} from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

/** 완료 티켓 렌더에 필요한 최소 정보 (명세 §10.7) */
export interface CreatedTicket {
  id: string;
  code: string;
  name: string;
  reservedBy: string;
  phone: string;
  groupId: string | null;
}

export type CreateReservationState = ActionState<{ tickets: CreatedTicket[] }>;

/**
 * 모바일 예약 생성 (명세 §10.3~10.6) — 서버 불변식(중복·정원)은 서비스가 일괄 적용 (설계 §6.4).
 * 재원생 신원은 서버가 다시 읽는다 — 클라이언트 입력 신뢰 금지.
 */

const memberSchema = z.object({
  sessionId: z.uuid("설명회를 선택하세요."),
  studentIds: z.array(z.uuid()).min(1, "자녀를 선택하세요."),
  reservedBy: z.enum(["모", "부", "모,부", ""]).default("모"),
  matchedBy: z.enum(["모", "부"]).default("모"),
  attendCount: z.coerce.number().int().min(1).max(4).default(1),
});

/** 재원생 예약 — 가족(형제) 다중 선택, 자녀별 QR (명세 §10.5) */
export async function createMemberReservationAction(
  _prev: CreateReservationState,
  formData: FormData,
): Promise<CreateReservationState> {
  const parsed = memberSchema.safeParse({
    sessionId: formData.get("sessionId"),
    studentIds: formData.getAll("studentIds"),
    reservedBy: formData.get("reservedBy") ?? "모",
    matchedBy: formData.get("matchedBy") ?? "모",
    attendCount: formData.get("attendCount") ?? 1,
  });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    const created = await createFamilyReservation(parsed.data);
    revalidateReservationViews();
    return successState(
      { tickets: created.map(toTicket) },
      `${created.length}명 예약이 확정되었습니다. 자녀별 QR 문자를 발송했어요.`,
    );
  } catch (e) {
    return toErrorState(e);
  }
}

const guestSchema = z.object({
  sessionId: z.uuid("설명회를 선택하세요."),
  name: z.string().trim().min(1, "이름을 입력하세요.").max(50),
  school: z.string().trim().max(50).default(""),
  grade: z.string().trim().max(20).default(""),
  phone: z.string().trim().regex(/^[\d-]{9,20}$/, "연락처를 확인하세요."),
  campus: z.enum(["A캠퍼스", "B캠퍼스", "C캠퍼스", ""]).default(""),
  reservedBy: z.enum(["모", "부", "모,부", ""]).default(""),
  attendCount: z.coerce.number().int().min(1).max(4).default(1),
});

/** 비재원생 예약 (명세 §10.6) — 동일 연락처 유효 예약은 서버 불변식이 차단 */
export async function createGuestReservationAction(
  _prev: CreateReservationState,
  formData: FormData,
): Promise<CreateReservationState> {
  const parsed = guestSchema.safeParse({
    sessionId: formData.get("sessionId"),
    name: formData.get("name"),
    school: formData.get("school") ?? "",
    grade: formData.get("grade") ?? "",
    phone: formData.get("phone"),
    campus: formData.get("campus") ?? "",
    reservedBy: formData.get("reservedBy") ?? "",
    attendCount: formData.get("attendCount") ?? 1,
  });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    const created = await createGuestReservation(parsed.data);
    revalidateReservationViews();
    return successState({ tickets: [toTicket(created)] }, "예약이 확정되었습니다. QR 문자를 발송했어요.");
  } catch (e) {
    return toErrorState(e);
  }
}

function toTicket(r: { id: string; code: string; name: string; reservedBy: string; phone: string; groupId: string | null }): CreatedTicket {
  return { id: r.id, code: r.code, name: r.name, reservedBy: r.reservedBy, phone: r.phone, groupId: r.groupId };
}

function revalidateReservationViews() {
  revalidatePath("/reserve");
  revalidatePath("/students");
  revalidatePath("/sessions");
  revalidatePath("/stats");
  revalidatePath("/");
}

function toErrorState(e: unknown): CreateReservationState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
