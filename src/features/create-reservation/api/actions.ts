"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createFamilyReservation,
  createReservation,
  getStudent,
  isDomainError,
} from "@/server/services";
import type { ReservationDraft } from "@/entities/reservation";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type CreateReservationState = ActionState<{ codes: string[] }>;

/**
 * 예약 생성 — 모바일·전화·수동·가족 네 경로의 공용 진입점 (명세 §5.6 · §10 · 12.13).
 * 서버 불변식(중복·정원)은 서비스가 모든 경로에 일괄 적용한다 (설계 §6.4, 결정 S9).
 */
const guestSchema = z.object({
  sessionId: z.uuid("설명회를 선택하세요."),
  channel: z.enum(["mobile", "phone", "manual"]),
  name: z.string().trim().min(1, "이름을 입력하세요.").max(50),
  school: z.string().trim().max(50).default(""),
  grade: z.string().trim().max(20).default(""),
  phone: z
    .string()
    .trim()
    .regex(/^[\d-]{9,20}$/, "연락처를 확인하세요."),
  attendCount: z.coerce.number().int().min(1).max(4).default(1),
});

/** 재원생 예약 — 학생 id로 신원을 서버가 다시 읽는다(클라이언트 입력 신뢰 금지) */
const memberSchema = z.object({
  sessionId: z.uuid("설명회를 선택하세요."),
  channel: z.enum(["mobile", "phone", "manual"]),
  studentIds: z.array(z.uuid()).min(1, "학생을 선택하세요.").max(3, "형제는 최대 3명까지 선택할 수 있습니다."),
  attendCount: z.coerce.number().int().min(1).max(4).default(1),
});

/** 비재원생 예약 (명세 §5.6-⑵ · 10.5) */
export async function createGuestReservationAction(
  _prev: CreateReservationState,
  formData: FormData,
): Promise<CreateReservationState> {
  const parsed = guestSchema.safeParse({
    sessionId: formData.get("sessionId"),
    channel: formData.get("channel") ?? "manual",
    name: formData.get("name"),
    school: formData.get("school") ?? "",
    grade: formData.get("grade") ?? "",
    phone: formData.get("phone"),
    attendCount: formData.get("attendCount") ?? 1,
  });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    const reservation = await createReservation({ ...parsed.data, studentId: null, member: false });
    revalidateReservationViews();
    return successState({ codes: [reservation.code] }, "예약이 완료되었습니다.");
  } catch (e) {
    return toErrorState(e);
  }
}

/** 재원생 예약 — 1명이면 단건, 2명 이상이면 가족(형제) 묶음 (명세 10.2 · 12.13) */
export async function createMemberReservationAction(
  _prev: CreateReservationState,
  formData: FormData,
): Promise<CreateReservationState> {
  const parsed = memberSchema.safeParse({
    sessionId: formData.get("sessionId"),
    channel: formData.get("channel") ?? "manual",
    studentIds: formData.getAll("studentIds"),
    attendCount: formData.get("attendCount") ?? 1,
  });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  const { sessionId, channel, studentIds, attendCount } = parsed.data;

  try {
    const drafts: ReservationDraft[] = [];
    for (const studentId of studentIds) {
      const student = await getStudent(studentId);
      if (!student) return errorState("재원생을 찾을 수 없습니다.");
      drafts.push({
        sessionId,
        studentId: student.id,
        name: student.name,
        school: student.school,
        grade: student.grade,
        phone: student.parentPhone,
        channel,
        attendCount,
        member: true,
      });
    }

    const created =
      drafts.length === 1
        ? [await createReservation(drafts[0])]
        : await createFamilyReservation(drafts);

    revalidateReservationViews();
    return successState(
      { codes: created.map((r) => r.code) },
      `${created.length}명 예약이 완료되었습니다.`,
    );
  } catch (e) {
    return toErrorState(e);
  }
}

function revalidateReservationViews() {
  revalidatePath("/sessions");
  revalidatePath("/phone");
  revalidatePath("/reserve");
}

function toErrorState(e: unknown): CreateReservationState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
