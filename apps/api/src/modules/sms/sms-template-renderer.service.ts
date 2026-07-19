import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";

export const SMS_TEMPLATE_VARIABLES = [
  "{학생명}",
  "{설명회명}",
  "{일시}",
  "{장소}",
  "{QR링크}",
  "{문의전화}",
  "{설문링크}",
] as const;

export interface SmsTemplateContext {
  readonly studentName: string;
  readonly seminarTitle: string;
  readonly sessionDateTime: string;
  readonly place: string;
  readonly bookingUrl: string;
  readonly inquiryPhone: string;
}

@Injectable()
export class SmsTemplateRenderer {
  public validate(value: string, field: "message" | "title" = "message"): void {
    const allowed = new Set<string>(SMS_TEMPLATE_VARIABLES);
    for (const match of value.matchAll(/\{[^{}]*\}/gu)) {
      if (!allowed.has(match[0])) this.fail("SMS_TEMPLATE_VARIABLE_UNKNOWN", field);
    }
    const withoutKnownVariables = SMS_TEMPLATE_VARIABLES.reduce(
      (current, variable) => current.replaceAll(variable, ""),
      value,
    );
    if (withoutKnownVariables.includes("{") || withoutKnownVariables.includes("}")) {
      this.fail("SMS_TEMPLATE_VARIABLE_INVALID", field);
    }
  }

  public render(value: string, context: SmsTemplateContext, field: "message" | "title" = "message"): string {
    this.validate(value, field);
    const replacements: Readonly<Record<(typeof SMS_TEMPLATE_VARIABLES)[number], string>> = {
      "{학생명}": context.studentName,
      "{설명회명}": context.seminarTitle,
      "{일시}": context.sessionDateTime,
      "{장소}": context.place,
      "{QR링크}": context.bookingUrl,
      "{문의전화}": context.inquiryPhone,
      "{설문링크}": context.bookingUrl,
    };
    let rendered = value;
    for (const variable of SMS_TEMPLATE_VARIABLES) {
      if (rendered.includes(variable) && replacements[variable].trim().length === 0) {
        this.fail("SMS_TEMPLATE_VARIABLE_UNRESOLVED", field);
      }
      rendered = rendered.replaceAll(variable, replacements[variable]);
    }
    if (rendered.includes("{") || rendered.includes("}")) {
      this.fail("SMS_TEMPLATE_VARIABLE_UNRESOLVED", field);
    }
    return rendered.normalize("NFC");
  }

  private fail(code: string, field: string): never {
    throw new DomainError(400, code, `The SMS ${field} contains an invalid template variable.`);
  }
}
