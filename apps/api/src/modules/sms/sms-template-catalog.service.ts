import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  SmsTemplateRenderer,
  type SmsTemplateContext,
  type SmsTemplatePurpose,
} from "./sms-template-renderer.service.js";

/**
 * 기본 템플릿 렌더링 결과
 */
export interface RenderedSmsTemplate {
  /**
   * 본문
   */
  readonly message: string;

  /**
   * LMS 제목. 없으면 null
   */
  readonly title: string | null;

  /**
   * 발송 기록용 템플릿 정보
   */
  readonly snapshot: Readonly<{
    /**
     * 템플릿 공개 ID. 내장 대체 문구면 null
     */
    templateId: string | null;

    /**
     * 템플릿 키
     */
    templateKey: string;

    /**
     * 템플릿 버전. 내장 대체 문구면 null
     */
    templateVersion: string | null;

    /**
     * 용도
     */
    templatePurpose: SmsTemplatePurpose;
  }>;
}

/**
 * 용도별 기본 문자 템플릿 선택과 렌더링
 */
@Injectable()
export class SmsTemplateCatalog {
  /**
   * 템플릿 렌더러 주입
   */
  public constructor(private readonly renderer: SmsTemplateRenderer) {}

  /**
   * 용도의 활성 기본 템플릿 렌더링
   *
   * 활성 기본 템플릿이 여러 개면 ID가 가장 작은 것 사용. 없으면 내장 대체 문구 사용
   *
   * @param fallback 기본 템플릿이 없을 때 쓸 키·본문·제목
   * @throws {DomainError} 400 허용 외 변수·값 없는 변수
   */
  public async renderDefault(
    transaction: Prisma.TransactionClient,
    purpose: SmsTemplatePurpose,
    context: SmsTemplateContext,
    fallback: { readonly key: string; readonly body: string; readonly title?: string | null },
  ): Promise<RenderedSmsTemplate> {
    const template = await transaction.smsTemplate.findFirst({
      where: { purpose, active: true, isDefault: true },
      orderBy: { id: "asc" },
    });
    const body = template?.body ?? fallback.body;
    const titleTemplate = template?.title ?? fallback.title ?? null;
    return {
      message: this.renderer.render(body, context, "message", purpose),
      title: titleTemplate === null ? null : this.renderer.render(titleTemplate, context, "title", purpose),
      snapshot: {
        templateId: template?.publicId ?? null,
        templateKey: template?.key ?? fallback.key,
        templateVersion: template?.version.toString() ?? null,
        templatePurpose: purpose,
      },
    };
  }
}
