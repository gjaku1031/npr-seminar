"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSeminar } from "@/server/services";

/** useActionState 호환 상태 — 실패는 throw가 아니라 상태로 반환한다 (설계 §7). */
export type CreateSeminarState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };

// Server Action은 사실상 공개 HTTP 엔드포인트 — 입력 검증은 필수 (결정 S6).
const inputSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(100, "제목은 100자 이내로 입력하세요."),
  speaker: z.string().trim().min(1, "발표자를 입력하세요.").max(50, "발표자는 50자 이내로 입력하세요."),
  startsAt: z
    .string()
    .min(1, "일시를 입력하세요.")
    .transform((value) => new Date(value))
    .refine((date) => !Number.isNaN(date.getTime()), "올바른 일시가 아닙니다."),
});

/**
 * 변경 진입점 (설계 §5·§7): zod 검증 → 서비스 호출 → revalidatePath → 상태 반환.
 * 도메인 규칙은 서비스에 — action은 HTTP 경계 어댑터(검증·캐시 무효화)만 담당한다.
 */
export async function createSeminarAction(
  _prev: CreateSeminarState,
  formData: FormData,
): Promise<CreateSeminarState> {
  const parsed = inputSchema.safeParse({
    title: formData.get("title"),
    speaker: formData.get("speaker"),
    startsAt: formData.get("startsAt"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  }

  await createSeminar(parsed.data);
  revalidatePath("/seminars");
  return { status: "success" };
}
