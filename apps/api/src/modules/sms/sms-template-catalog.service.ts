import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  SmsTemplateRenderer,
  type SmsTemplateContext,
  type SmsTemplatePurpose,
} from "./sms-template-renderer.service.js";

export interface RenderedSmsTemplate {
  readonly message: string;
  readonly title: string | null;
  readonly snapshot: Readonly<{
    templateId: string | null;
    templateKey: string;
    templateVersion: string | null;
    templatePurpose: SmsTemplatePurpose;
  }>;
}

@Injectable()
export class SmsTemplateCatalog {
  public constructor(private readonly renderer: SmsTemplateRenderer) {}

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
