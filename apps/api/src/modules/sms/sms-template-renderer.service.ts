import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";

export const SMS_TEMPLATE_VARIABLES = [
  "{인증번호}",
  "{학생명}",
  "{설명회명}",
  "{일시}",
  "{장소}",
  "{예약확인링크}",
  "{QR링크}",
  "{문의전화}",
  "{설문링크}",
] as const;

export type SmsTemplatePurpose = "OTP" | "BOOKING_CONFIRMED" | "BOOKING_UPDATED"
  | "BOOKING_CANCELLED" | "FIRST_CHECK_IN" | "ADMIN_GROUP" | "SURVEY";

const PURPOSE_VARIABLES: Readonly<Record<SmsTemplatePurpose, ReadonlySet<string>>> = {
  OTP: new Set(["{인증번호}"]),
  BOOKING_CONFIRMED: new Set(["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{QR링크}", "{문의전화}"]),
  BOOKING_UPDATED: new Set(["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{QR링크}", "{문의전화}"]),
  BOOKING_CANCELLED: new Set(["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{문의전화}"]),
  FIRST_CHECK_IN: new Set(["{학생명}", "{설명회명}", "{일시}", "{장소}", "{문의전화}"]),
  ADMIN_GROUP: new Set(SMS_TEMPLATE_VARIABLES),
  SURVEY: new Set(["{학생명}", "{설명회명}", "{일시}", "{장소}", "{설문링크}", "{문의전화}"]),
};

export interface SmsTemplateContext {
  readonly verificationCode?: string;
  readonly studentName: string;
  readonly seminarTitle: string;
  readonly sessionDateTime: string;
  readonly place: string;
  readonly bookingUrl: string;
  readonly inquiryPhone: string;
}

@Injectable()
export class SmsTemplateRenderer {
  public validate(value: string, field: "message" | "title" = "message", purpose?: SmsTemplatePurpose): void {
    const allowed = purpose === undefined ? new Set<string>(SMS_TEMPLATE_VARIABLES) : PURPOSE_VARIABLES[purpose];
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

  public render(value: string, context: SmsTemplateContext, field: "message" | "title" = "message", purpose?: SmsTemplatePurpose): string {
    this.validate(value, field, purpose);
    const replacements: Readonly<Record<(typeof SMS_TEMPLATE_VARIABLES)[number], string>> = {
      "{인증번호}": context.verificationCode ?? "",
      "{학생명}": context.studentName,
      "{설명회명}": context.seminarTitle,
      "{일시}": context.sessionDateTime,
      "{장소}": context.place,
      "{예약확인링크}": context.bookingUrl,
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
