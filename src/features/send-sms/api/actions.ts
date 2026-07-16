"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createSmsTemplate,
  deleteSmsTemplate,
  isDomainError,
  saveSmsTemplate,
  sendGroupSms,
} from "@/server/services";
import { errorState, successState, type ActionState } from "@/shared/lib/action";

export type SmsState = ActionState<{ recipients?: number; templateId?: string }>;

/**
 * 문자 발송 모듈 조작 (명세 §5) — 템플릿 CRUD + 그룹 발송.
 * ⚠️ 게이트웨이 미연동 — 발송은 로그 적재까지 (명세 §12). 수신 인원은 서버가 산출.
 */

/** 그룹 발송 — 설명회 × 그룹 × 캠퍼스, 본문은 수신자별 변수 치환 (명세 §5.1~5.2) */
export async function sendGroupSmsAction(_prev: SmsState, formData: FormData): Promise<SmsState> {
  const parsed = z
    .object({
      sessionId: z.uuid("설명회를 선택하세요."),
      group: z.enum(["all", "reserved", "entered", "cancelled"]),
      campus: z.enum(["A캠퍼스", "B캠퍼스", "C캠퍼스"]),
      templateName: z.string().trim().min(1).max(50).default("직접 작성"),
      body: z.string().trim().min(1, "본문을 입력하세요.").max(2000),
    })
    .safeParse({
      sessionId: formData.get("sessionId"),
      group: formData.get("group"),
      campus: formData.get("campus"),
      templateName: formData.get("templateName") ?? "직접 작성",
      body: formData.get("body"),
    });
  if (!parsed.success) return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");

  try {
    const log = await sendGroupSms(parsed.data);
    revalidatePath("/sms");
    revalidatePath("/");
    return successState({ recipients: log.to }, `${parsed.data.campus} ${log.to}명에게 문자를 발송했어요.`);
  } catch (e) {
    return toErrorState(e);
  }
}

/** 현재 내용 저장 (명세 §5.1) */
export async function saveTemplateAction(_prev: SmsState, formData: FormData): Promise<SmsState> {
  const parsed = z
    .object({ templateId: z.uuid(), body: z.string().max(2000) })
    .safeParse({ templateId: formData.get("templateId"), body: formData.get("body") ?? "" });
  if (!parsed.success) return errorState("템플릿을 찾을 수 없습니다.");

  try {
    await saveSmsTemplate(parsed.data.templateId, parsed.data.body);
    revalidatePath("/sms");
    return successState({}, "템플릿이 저장됐어요.");
  } catch (e) {
    return toErrorState(e);
  }
}

/** 새 템플릿 생성 (명세 §5.1) */
export async function createTemplateAction(_prev: SmsState, formData: FormData): Promise<SmsState> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(50), body: z.string().max(2000).default("[npr] ") })
    .safeParse({ name: formData.get("name"), body: formData.get("body") || "[npr] " });
  if (!parsed.success) return errorState("템플릿 이름을 확인하세요.");

  try {
    const t = await createSmsTemplate(parsed.data.name, parsed.data.body);
    revalidatePath("/sms");
    return successState({ templateId: t.id }, "새 템플릿을 만들었어요.");
  } catch (e) {
    return toErrorState(e);
  }
}

/** 템플릿 삭제 — 마지막 1개 보호는 서비스 불변식 (명세 §5.1) */
export async function deleteTemplateAction(_prev: SmsState, formData: FormData): Promise<SmsState> {
  const parsed = z.uuid().safeParse(formData.get("templateId"));
  if (!parsed.success) return errorState("템플릿을 찾을 수 없습니다.");

  try {
    await deleteSmsTemplate(parsed.data);
    revalidatePath("/sms");
    return successState({}, "템플릿을 삭제했어요.");
  } catch (e) {
    return toErrorState(e);
  }
}

function toErrorState(e: unknown): SmsState {
  if (isDomainError(e)) return errorState(e.message, e.code);
  throw e;
}
