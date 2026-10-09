/**
 * 모든 문자 템플릿에서 인식하는 변수. 렌더링과 용도별 검증의 공통 기준
 */
/**
 * 모든 문자 템플릿에서 인식하는 변수. 렌더링과 용도별 검증의 공통 기준임
 */
export const SMS_TEMPLATE_VARIABLES = [
  "{인증번호}",
  "{학생명}",
  "{설명회명}",
  "{일시}",
  "{장소}",
  "{예약확인링크}",
  "{QR링크}",
  "{문의전화}",
] as const;

/**
 * SMS_TEMPLATE_VARIABLES에 포함된 치환 변수
 */
/**
 * {@link SMS_TEMPLATE_VARIABLES}에 포함된 실제 치환 변수
 */
export type SmsTemplateVariable = (typeof SMS_TEMPLATE_VARIABLES)[number];

/**
 * 서버가 허용하는 용도별 변수와 편집 화면 표시 정보
 *
 * FIRST_CHECK_IN은 서버 내부 템플릿으로만 허용하고 관리자 편집 목록에는 넣지 않음
 */
export const SMS_TEMPLATE_POLICY = {
  // 인증번호 문자
  OTP: {
    label: "인증번호",
    keyPrefix: "OTP",
    variables: ["{인증번호}"],
  },
  // 예약 확정·변경 안내. QR 링크 포함
  BOOKING_CONFIRMED: {
    label: "예약 확정",
    keyPrefix: "BOOKING_CONFIRMED",
    variables: ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{QR링크}", "{문의전화}"],
  },
  BOOKING_UPDATED: {
    label: "예약 변경",
    keyPrefix: "BOOKING_UPDATED",
    variables: ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{QR링크}", "{문의전화}"],
  },
  // 예약 취소 안내. QR 링크 없음
  BOOKING_CANCELLED: {
    label: "예약 취소",
    keyPrefix: "BOOKING_CANCELLED",
    variables: ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{문의전화}"],
  },
  // 첫 체크인 안내. 서버 내부 전용이라 표시 정보 없음
  FIRST_CHECK_IN: {
    variables: ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{문의전화}"],
  },
  // 관리자 그룹 발송. 모든 변수 허용
  ADMIN_GROUP: {
    label: "관리자 그룹 발송",
    keyPrefix: "GROUP",
    variables: SMS_TEMPLATE_VARIABLES,
  },
} as const satisfies Record<string, {
  /**
   * 화면 표시 이름. 서버 내부 용도는 없음
   */
  readonly label?: string;

  /**
   * 새 템플릿 키 접두어
   */
  readonly keyPrefix?: string;

  /**
   * 허용 변수
   */
  readonly variables: readonly SmsTemplateVariable[];
}>;

/**
 * SMS_TEMPLATE_POLICY에 선언된 저장·렌더링 가능 용도
 */
/**
 * {@link SMS_TEMPLATE_POLICY}에 선언된 저장·렌더링 가능 용도
 */
export type SmsTemplatePurpose = keyof typeof SMS_TEMPLATE_POLICY;

/**
 * DTO 용도 검사에 쓰는 서버 허용 용도 전체
 */
/**
 * DTO의 용도 검사에 사용하는 전체 서버 허용 목록
 */
export const SMS_TEMPLATE_PURPOSES = Object.keys(SMS_TEMPLATE_POLICY) as readonly SmsTemplatePurpose[];

/**
 * 관리자 템플릿 화면에서 편집 가능한 용도와 표시 순서
 */
/**
 * 관리자 템플릿 화면에서 편집 가능한 용도와 표시 순서
 */
export const EDITABLE_SMS_TEMPLATE_PURPOSES = [
  "ADMIN_GROUP",
  "OTP",
  "BOOKING_CONFIRMED",
  "BOOKING_UPDATED",
  "BOOKING_CANCELLED",
] as const satisfies readonly SmsTemplatePurpose[];

/**
 * 관리자 화면이 선택할 수 있는 용도. FIRST_CHECK_IN은 서버 내부 용도라 제외
 */
/**
 * 관리자 화면이 선택할 수 있는 용도. FIRST_CHECK_IN은 서버 내부 용도임
 */
export type EditableSmsTemplatePurpose = (typeof EDITABLE_SMS_TEMPLATE_PURPOSES)[number];

/**
 * 편집 가능한 용도 하나의 변수·표시·새 키 접두어
 */
/**
 * 편집 가능한 용도 하나의 변수·표시·새 키 접두어 계약
 */
export interface SmsTemplatePurposeView {
  /**
   * 용도
   */
  readonly purpose: EditableSmsTemplatePurpose;

  /**
   * 화면 표시 이름
   */
  readonly label: string;

  /**
   * 허용 변수
   */
  readonly variables: readonly SmsTemplateVariable[];

  /**
   * 새 템플릿 키 접두어
   */
  readonly keyPrefix: string;
}

/**
 * 관리자 화면이 최초 진입 또는 정책 재시도 시 받는 읽기 전용 정책
 */
/**
 * 관리자 화면이 최초 진입 또는 정책 재시도 후 받는 읽기 전용 계약
 */
export interface SmsTemplatePolicyView {
  /**
   * 기본 선택 용도
   */
  readonly defaultPurpose: EditableSmsTemplatePurpose;

  /**
   * 편집 가능 용도 목록. 표시 순서 유지
   */
  readonly purposes: readonly SmsTemplatePurposeView[];
}

/**
 * SMS_TEMPLATE_POLICY에서 파생한 관리자 편집용 공개 정책
 */
/**
 * {@link SMS_TEMPLATE_POLICY}에서 파생한 관리자 편집용 공개 정책
 */
export const SMS_TEMPLATE_EDITING_POLICY: SmsTemplatePolicyView = {
  defaultPurpose: "ADMIN_GROUP",
  purposes: EDITABLE_SMS_TEMPLATE_PURPOSES.map((purpose) => ({
    purpose,
    label: SMS_TEMPLATE_POLICY[purpose].label,
    variables: SMS_TEMPLATE_POLICY[purpose].variables,
    keyPrefix: SMS_TEMPLATE_POLICY[purpose].keyPrefix,
  })),
};
