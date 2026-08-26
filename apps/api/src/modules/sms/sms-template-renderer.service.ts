import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { SMS_TEMPLATE_POLICY, SMS_TEMPLATE_VARIABLES, type SmsTemplatePurpose } from "./sms-template-policy.js";

/** 기존 import 경로를 사용하는 호출자의 런타임 상수와 타입을 유지한다. */
export { SMS_TEMPLATE_VARIABLES } from "./sms-template-policy.js";
export type { SmsTemplatePurpose } from "./sms-template-policy.js";

/** 변수 치환에 필요한 학생·회차·예약 정보. 비어 있는 사용 변수는 렌더링 오류다. */
export interface SmsTemplateContext {
  readonly verificationCode?: string;
  readonly studentName: string;
  readonly seminarTitle: string;
  readonly sessionDateTime: string;
  readonly place: string;
  readonly bookingUrl: string;
  readonly inquiryPhone: string;
}

/** {@link SMS_TEMPLATE_POLICY}의 용도별 허용 변수로 템플릿을 검증하고 치환한다. */
@Injectable()
export class SmsTemplateRenderer {
  /**
   * 제목 또는 본문에 알 수 없거나 해당 용도에서 허용하지 않은 변수가 있으면 거절한다.
   * @throws {DomainError} 미등록·잘못된 변수 또는 용도에 맞지 않는 변수가 있을 때.
   */
  public validate(value: string, field: "message" | "title" = "message", purpose?: SmsTemplatePurpose): void {
    const allowed: ReadonlySet<string> = new Set(
      purpose === undefined ? SMS_TEMPLATE_VARIABLES : SMS_TEMPLATE_POLICY[purpose].variables,
    );
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

  /**
   * {@link SmsTemplateContext}로 변수를 치환한 NFC 문자열을 반환한다.
   * @throws {DomainError} 허용하지 않는 변수나 값이 없는 변수를 사용했을 때.
   */
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

  /** 변수 오류를 HTTP 400 도메인 오류로 바꾼다. 항상 예외를 던진다. */
  private fail(code: string, field: string): never {
    throw new DomainError(400, code, `The SMS ${field} contains an invalid template variable.`);
  }
}
