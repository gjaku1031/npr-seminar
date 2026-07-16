"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  isDomainError,
  sendSurveySms,
  submitMobileSurvey,
  updateSurveySms,
} from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type SurveyState = ActionState<{ recipients?: number }>;

/** 만족도 설문 (명세 §6.4 · §10.9) — 문자 편집·발송(콘솔) + 응답 제출(모바일). */

/** 설문 문자 내용 저장 — Session.surveySms (명세 §6.4) */
export async function saveSurveySmsAction(_prev: SurveyState, formData: FormData): Promise<SurveyState> {
  const parsed = z
    .object({ sessionId: z.uuid(), body: z.string().max(2000) })
    .safeParse({ sessionId: formData.get("sessionId"), body: formData.get("body") ?? "" });
  if (!parsed.success) return errorState("설명회를 찾을 수 없습니다.");

  try {
    await updateSurveySms(parsed.data.sessionId, parsed.data.body);
    revalidatePath("/sessions");
    return successState({}, "설문 문자 내용이 저장됐어요.");
  } catch (e) {
    return toErrorState(e);
  }
}

/** 설문 발송 — 대상 = 참석(입장 완료) 학부모, 0명이면 서버가 거부 (명세 §6.4) */
export async function sendSurveyAction(_prev: SurveyState, formData: FormData): Promise<SurveyState> {
  const parsed = z.uuid().safeParse(formData.get("sessionId"));
  if (!parsed.success) return errorState("설명회를 찾을 수 없습니다.");

  try {
    const log = await sendSurveySms(parsed.data);
    revalidatePath("/sessions");
    revalidatePath("/sms");
    return successState({ recipients: log.to }, `참석 학부모 ${log.to}명에게 설문 문자를 발송했어요.`);
  } catch (e) {
    return toErrorState(e);
  }
}

/** 모바일 설문 제출 — 별점 필수, 스냅샷은 서버가 예약에서 채움 (명세 §10.9) */
export async function submitSurveyAction(_prev: SurveyState, formData: FormData): Promise<SurveyState> {
  const parsed = z
    .object({
      sessionId: z.uuid(),
      rating: z.coerce.number().int().min(1, "별점을 선택해 주세요.").max(5),
      comment: z.string().trim().max(1000).default(""),
      photo: z.coerce.boolean().default(false),
      reservationId: z.uuid().nullable().default(null),
    })
    .safeParse({
      sessionId: formData.get("sessionId"),
      rating: formData.get("rating"),
      comment: formData.get("comment") ?? "",
      photo: formData.get("photo") === "on" || formData.get("photo") === "true",
      reservationId: formData.get("reservationId") || null,
    });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    await submitMobileSurvey({
      ...parsed.data,
      rating: parsed.data.rating as 1 | 2 | 3 | 4 | 5,
    });
    revalidatePath("/sessions");
    revalidatePath("/stats");
    return successState({}, "소중한 의견 감사해요.");
  } catch (e) {
    return toErrorState(e);
  }
}

function toErrorState(e: unknown): SurveyState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
