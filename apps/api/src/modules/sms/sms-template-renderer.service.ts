import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { SMS_TEMPLATE_POLICY, SMS_TEMPLATE_VARIABLES, type SmsTemplatePurpose } from "./sms-template-policy.js";

/**
 * 기존 import 경로를 쓰는 호출자를 위해 정책 모듈의 상수·타입 재수출
 */
/**
 * 기존 import 경로를 사용하는 호출자의 런타임 상수와 타입을 유지함
 */
export { SMS_TEMPLATE_VARIABLES } from "./sms-template-policy.js";
export type { SmsTemplatePurpose } from "./sms-template-policy.js";

/**
 * 변수 치환에 쓰는 학생·회차·예약 정보. 사용한 변수의 값이 비어 있으면 렌더링 오류
 */
/**
 * 변수 치환에 필요한 학생·회차·예약 정보. 비어 있는 사용 변수는 렌더링 오류임
 */
export interface SmsTemplateContext {
  /**
   * 인증번호. OTP 문자에서만 사용
   */
  readonly verificationCode?: string;

  /**
   * 학생 이름
   */
  readonly studentName: string;

  /**
   * 설명회 제목
   */
  readonly seminarTitle: string;

  /**
   * 표시용 회차 일시
   */
  readonly sessionDateTime: string;

  /**
   * 장소
   */
  readonly place: string;

  /**
   * 예약 확인 링크. {예약확인링크}와 {QR링크}에 같은 값 사용
   */
  readonly bookingUrl: string;

  /**
   * 문의 전화번호
   */
  readonly inquiryPhone: string;
}

/**
 * SMS_TEMPLATE_POLICY의 용도별 허용 변수로 템플릿 검증과 치환
 */
@Injectable()
export class SmsTemplateRenderer {
  /**
   * 템플릿 변수 검증
   *
   * 알 수 없는 변수, 해당 용도에서 허용하지 않는 변수, 짝이 맞지 않는 중괄호 거부
   *
   * @param purpose 용도. 생략하면 전체 변수 허용
   * @throws {DomainError} 400 미등록·잘못된 변수 또는 용도에 맞지 않는 변수
   */
  public validate(value: string, field: "message" | "title" = "message", purpose?: SmsTemplatePurpose): void {
    const allowed: ReadonlySet<string> = new Set(
      purpose === undefined ? SMS_TEMPLATE_VARIABLES : SMS_TEMPLATE_POLICY[purpose].variables,
    );
    for (const match of value.matchAll(/\{[^{}]*\}/gu)) {
      if (!allowed.has(match[0])) this.fail("SMS_TEMPLATE_VARIABLE_UNKNOWN", field);
    }
    // 알려진 변수를 지운 뒤에도 중괄호가 남으면 형식 오류
    const withoutKnownVariables = SMS_TEMPLATE_VARIABLES.reduce(
      (current, variable) => current.replaceAll(variable, ""),
      value,
    );
    if (withoutKnownVariables.includes("{") || withoutKnownVariables.includes("}")) {
      this.fail("SMS_TEMPLATE_VARIABLE_INVALID", field);
    }
  }

  /**
   * SmsTemplateContext로 변수를 치환한 NFC 문자열 반환
   *
   * @throws {DomainError} 400 허용하지 않는 변수나 값이 없는 변수 사용
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
    // 사용한 변수 값이 비어 있으면 빈칸 문자가 나가지 않도록 거부
    let rendered = value;
    for (const variable of SMS_TEMPLATE_VARIABLES) {
      if (rendered.includes(variable) && replacements[variable].trim().length === 0) {
        this.fail("SMS_TEMPLATE_VARIABLE_UNRESOLVED", field);
      }
      rendered = rendered.replaceAll(variable, replacements[variable]);
    }
    // 치환 값에 중괄호가 섞여 남은 경우도 미해결로 거부
    if (rendered.includes("{") || rendered.includes("}")) {
      this.fail("SMS_TEMPLATE_VARIABLE_UNRESOLVED", field);
    }
    return rendered.normalize("NFC");
  }

  /**
   * 템플릿 변수 오류 발생
   *
   * @throws {DomainError} 400 지정 코드
   */
  private fail(code: string, field: string): never {
    throw new DomainError(400, code, `The SMS ${field} contains an invalid template variable.`);
  }
}
