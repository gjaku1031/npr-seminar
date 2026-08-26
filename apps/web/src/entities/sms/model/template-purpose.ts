/**
 * 기존 테스트가 직접 참조하는 문자 용도 도우미의 호환 모듈.
 *
 * 함수와 상수의 동작은 보존한다. 실제 화면은 서버의 template-policy 응답을 사용하므로
 * 이 고정 목록을 제품 코드에서 가져오지 않는다. FIRST_CHECK_IN은 이 편집 목록에 없다.
 */

import type { SmsPurpose } from "@/shared/api";

/** 호환 테스트가 참조하는 편집 용도 5종의 고정 목록. */
export const EDITABLE_SMS_PURPOSES = [
  "ADMIN_GROUP",
  "OTP",
  "BOOKING_CONFIRMED",
  "BOOKING_UPDATED",
  "BOOKING_CANCELLED",
] as const;

export type EditableSmsPurpose = (typeof EDITABLE_SMS_PURPOSES)[number];

/** 호환 테스트용 기본 용도. 실제 화면은 API의 defaultPurpose를 읽는다. */
export const DEFAULT_EDITABLE_PURPOSE: EditableSmsPurpose = "ADMIN_GROUP";

/** 호환 테스트용 고정 라벨. 실제 화면 라벨은 API 응답을 읽는다. */
export const SMS_PURPOSE_LABELS: Readonly<Record<EditableSmsPurpose, string>> = {
  ADMIN_GROUP: "관리자 그룹 발송",
  OTP: "인증번호",
  BOOKING_CONFIRMED: "예약 확정",
  BOOKING_UPDATED: "예약 변경",
  BOOKING_CANCELLED: "예약 취소",
};

/**
 * 호환 테스트용 고정 변수. 실제 화면 칩은 API 응답의 변수를 따른다.
 *
 * - OTP: 인증번호만
 * - BOOKING_CONFIRMED / BOOKING_UPDATED: 학생명·설명회명·일시·장소·예약확인링크·QR링크·문의전화
 * - BOOKING_CANCELLED: 위에서 QR링크만 뺀 것 (취소 안내에는 QR 이 없다)
 * - ADMIN_GROUP: 모든 실제 변수 9종
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
  ],
};

/** 호환 테스트용 고정 접두어. 실제 생성 키의 접두어는 API 응답을 따른다. */
const KEY_PREFIX: Readonly<Record<EditableSmsPurpose, string>> = {
  ADMIN_GROUP: "GROUP",
  OTP: "OTP",
  BOOKING_CONFIRMED: "BOOKING_CONFIRMED",
  BOOKING_UPDATED: "BOOKING_UPDATED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
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

/** 호환 테스트용 옵션. 실제 선택지는 API 응답 순서와 라벨을 따른다. */
export const EDITABLE_PURPOSE_OPTIONS: ReadonlyArray<{ value: EditableSmsPurpose; label: string }> =
  EDITABLE_SMS_PURPOSES.map((purpose) => ({ value: purpose, label: SMS_PURPOSE_LABELS[purpose] }));
