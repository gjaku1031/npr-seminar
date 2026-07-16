"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addStudent, convertGuest, isDomainError } from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type ManageStudentState = ActionState<{ id: string; name: string }>;

/** 재원생 추가 · 비재원 전환 (명세 §4.8 · 12.14) */

const addSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.").max(50),
  school: z.string().trim().max(50).default(""),
  grade: z.string().trim().max(20).default(""),
  classId: z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v)),
  parentPhone: z
    .string()
    .trim()
    .regex(/^[\d-]{9,20}$/, "학부모 연락처를 확인하세요."),
});

/** 학생 추가 — 이름·연락처 필수 (명세 §4.8) */
export async function addStudentAction(
  _prev: ManageStudentState,
  formData: FormData,
): Promise<ManageStudentState> {
  const parsed = addSchema.safeParse({
    name: formData.get("name"),
    school: formData.get("school") ?? "",
    grade: formData.get("grade") ?? "",
    classId: formData.get("classId") ?? "",
    parentPhone: formData.get("parentPhone"),
  });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    const student = await addStudent(parsed.data);
    revalidatePath("/students");
    return successState({ id: student.id, name: student.name }, "재원생이 추가되었습니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

/**
 * 비재원 → 재원 전환 (명세 12.14).
 * 예약 정보로 학생을 만들고 반을 배정한 뒤, 원 예약을 새 학생에 연결한다.
 */
export async function convertGuestAction(
  _prev: ManageStudentState,
  formData: FormData,
): Promise<ManageStudentState> {
  const parsed = z
    .object({
      reservationId: z.uuid(),
      classId: z.union([z.uuid(), z.literal("")]).transform((v) => (v === "" ? null : v)),
    })
    .safeParse({
      reservationId: formData.get("reservationId"),
      classId: formData.get("classId") ?? "",
    });
  if (!parsed.success) return errorState("전환할 예약을 찾을 수 없습니다.");

  try {
    const student = await convertGuest(parsed.data.reservationId, parsed.data.classId);
    revalidatePath("/students");
    revalidatePath("/sessions");
    revalidatePath("/stats");
    return successState({ id: student.id, name: student.name }, "재원생으로 전환했습니다. 등록 환영 문자가 발송됩니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

function toErrorState(e: unknown): ManageStudentState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
