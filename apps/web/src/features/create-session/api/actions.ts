"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, isDomainError } from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type CreateSessionState = ActionState<{ id: string }>;

/**
 * 설명회 생성 (명세 §6.2) — 명*·날짜*·회차·정원·장소* + 설명 + 참석 인원 토글 + 페이지 꾸미기.
 * ⚠️ 명세가 지적한 공백: 생성 모달에 시작 시각 입력이 없어 10:00 고정 저장 — 서버는 값을 받는다.
 */
const schema = z.object({
  title: z.string().trim().min(1, "설명회명을 입력하세요.").max(100),
  campus: z.enum(["전체", "송파캠퍼스", "위례캠퍼스", "광진캠퍼스"]).default("전체"),
  date: z.coerce.date({ message: "날짜를 입력하세요." }),
  round: z.coerce.number().int().min(1).max(99).default(1),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시각은 HH:mm 형식으로 입력하세요.")
    .default("10:00"),
  place: z.string().trim().min(1, "장소를 입력하세요.").max(100),
  capacity: z.coerce.number().int().min(1, "정원은 1명 이상이어야 합니다.").max(9999),
  desc: z.string().trim().max(1000).default(""),
  attendField: z.coerce.boolean().default(false),
  banner: z.enum(["violet", "mint", "slate"]).default("violet"),
  notice: z.string().trim().max(1000).default(""),
});

export async function createSessionAction(
  _prev: CreateSessionState,
  formData: FormData,
): Promise<CreateSessionState> {
  const parsed = schema.safeParse({
    title: formData.get("title"),
    campus: formData.get("campus") ?? "전체",
    date: formData.get("date"),
    round: formData.get("round") ?? 1,
    time: formData.get("time") ?? "10:00",
    place: formData.get("place"),
    capacity: formData.get("capacity"),
    desc: formData.get("desc") ?? "",
    attendField: formData.get("attendField") === "on",
    banner: formData.get("banner") ?? "violet",
    notice: formData.get("notice") ?? "",
  });
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
  }

  try {
    const session = await createSession(parsed.data);
    // 학부모 예약 앱은 루트, 콘솔 허브는 /admin (라우트 이동 반영).
    revalidatePath("/sessions");
    revalidatePath("/");
    revalidatePath("/admin");
    return successState({ id: session.id }, "설명회가 생성되었습니다. 모바일 예약에 즉시 노출됩니다.");
  } catch (e) {
    if (isDomainError(e)) return errorState(e.message, e.code);
    throw e;
  }
}
