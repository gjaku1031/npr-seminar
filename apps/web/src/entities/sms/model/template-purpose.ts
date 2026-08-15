/**
 * 문자 템플릿 용도(purpose)와 용도별 변수 — 백엔드 계약의 단일 진실을 프론트에서 그대로 비춘다.
 *
 * ⚠️ 이 모듈은 `apps/api/src/modules/sms/sms-template-renderer.service.ts` 의 `PURPOSE_VARIABLES`
 *   와 **정확히 같아야** 한다. 서버는 저장·프리뷰·발송에서 용도별 허용 변수만 통과시키므로,
 *   화면이 다른 목록을 쓰면 칩으로 넣은 변수가 저장 단계에서 400 으로 떨어진다.
 *
 * 관리 대상은 사람이 편집하는 6종뿐이다. `FIRST_CHECK_IN` 은 백엔드 enum 에는 있지만
 * 이 화면에서 생성·수정·필터·선택·변수 어디에도 나타나면 안 되므로 여기서 의도적으로 제외한다.
 * (옛 `entities/sms` 의 `SMS_VARIABLES`·`SURVEY_SMS_VARIABLES` 는 이 규칙과 무관한 레거시다 —
 *  용도별 변수는 반드시 이 모듈에서만 읽는다.)
 */

import type { SmsPurpose } from "@/shared/api";

/** 사람이 편집하는 용도 6종 — 계약 SmsPurpose 에서 FIRST_CHECK_IN 만 뺀 집합이다. */
export const EDITABLE_SMS_PURPOSES = [
  "ADMIN_GROUP",
  "OTP",
  "BOOKING_CONFIRMED",
  "BOOKING_UPDATED",
  "BOOKING_CANCELLED",
  "SURVEY",
] as const;

export type EditableSmsPurpose = (typeof EDITABLE_SMS_PURPOSES)[number];

/** 이 화면의 기본 뷰 — 이 화면은 주로 관리자 그룹 발송에 쓰인다. */
export const DEFAULT_EDITABLE_PURPOSE: EditableSmsPurpose = "ADMIN_GROUP";

/** 용도 한국어 라벨 — 필터·에디터 Select·목적 컨텍스트 표기에 함께 쓴다. */
export const SMS_PURPOSE_LABELS: Readonly<Record<EditableSmsPurpose, string>> = {
  ADMIN_GROUP: "관리자 그룹 발송",
  OTP: "인증번호",
  BOOKING_CONFIRMED: "예약 확정",
  BOOKING_UPDATED: "예약 변경",
  BOOKING_CANCELLED: "예약 취소",
  SURVEY: "설문",
};

/**
 * 용도별 허용 변수 — 백엔드 `PURPOSE_VARIABLES` 와 1:1. 칩 순서도 서버 집합 순서를 따른다.
 *
 * - OTP: 인증번호만
 * - BOOKING_CONFIRMED / BOOKING_UPDATED: 학생명·설명회명·일시·장소·예약확인링크·QR링크·문의전화
 * - BOOKING_CANCELLED: 위에서 QR링크만 뺀 것 (취소 안내에는 QR 이 없다)
 * - ADMIN_GROUP: 모든 실제 변수 9종
 * - SURVEY: 학생명·설명회명·일시·장소·설문링크·문의전화
 */
export const SMS_PURPOSE_VARIABLES: Readonly<Record<EditableSmsPurpose, readonly string[]>> = {
  OTP: ["{인증번호}"],
  BOOKING_CONFIRMED: [
    "{학생명}",
    "{설명회명}",
    "{일시}",
    "{장소}",
    "{예약확인링크}",
    "{QR링크}",
    "{문의전화}",
  ],
  BOOKING_UPDATED: [
    "{학생명}",
    "{설명회명}",
    "{일시}",
    "{장소}",
    "{예약확인링크}",
    "{QR링크}",
    "{문의전화}",
  ],
  BOOKING_CANCELLED: ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{문의전화}"],
  ADMIN_GROUP: [
    "{인증번호}",
    "{학생명}",
    "{설명회명}",
    "{일시}",
    "{장소}",
    "{예약확인링크}",
    "{QR링크}",
    "{문의전화}",
    "{설문링크}",
  ],
  SURVEY: ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{설문링크}", "{문의전화}"],
};

/** 계약 key 패턴 `^[A-Z0-9_]{3,80}$` — 용도 이름을 접두어로 쓰면 항상 유효하다. */
const KEY_PREFIX: Readonly<Record<EditableSmsPurpose, string>> = {
  ADMIN_GROUP: "GROUP",
  OTP: "OTP",
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_UPDATED: "BOOKING_UPDATED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
  SURVEY: "SURVEY",
};

/** 편집 가능한 용도인지 — FIRST_CHECK_IN(및 알 수 없는 값)을 걸러낸다. */
export function isEditableSmsPurpose(purpose: SmsPurpose | string): purpose is EditableSmsPurpose {
  return (EDITABLE_SMS_PURPOSES as readonly string[]).includes(purpose);
}

/** 서버가 준 용도를 편집 가능한 값으로 좁힌다 — 아니면 기본 뷰로 떨어뜨린다(지어내지 않는다). */
export function asEditablePurpose(purpose: SmsPurpose | string): EditableSmsPurpose {
  return isEditableSmsPurpose(purpose) ? purpose : DEFAULT_EDITABLE_PURPOSE;
}

/** 용도별 허용 변수 목록. */
export function variablesForPurpose(purpose: EditableSmsPurpose): readonly string[] {
  return SMS_PURPOSE_VARIABLES[purpose];
}

/** 생성 시 한 번 짓는 계약 key — 용도 접두어 + 임의 후행값(항상 `^[A-Z0-9_]{3,80}$`). */
export function newTemplateKey(purpose: EditableSmsPurpose): string {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `${KEY_PREFIX[purpose]}_${suffix}`;
}

/** 에디터·필터 Select 용 옵션 — 라벨은 한국어. */
export const EDITABLE_PURPOSE_OPTIONS: ReadonlyArray<{ value: EditableSmsPurpose; label: string }> =
  EDITABLE_SMS_PURPOSES.map((purpose) => ({ value: purpose, label: SMS_PURPOSE_LABELS[purpose] }));
