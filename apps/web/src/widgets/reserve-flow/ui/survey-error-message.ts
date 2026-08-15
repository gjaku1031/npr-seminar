/**
 * 설문 제출 실패 → 한국어 문구 매핑 (계약 POST /public/family-bookings/{id}/survey-response).
 *
 * 서버 detail 은 영어라 그대로 쓰지 않고 status·code 로 정확한 문구를 고른다.
 * 특히 자격 미달(SURVEY_NOT_AVAILABLE)과 중복(SURVEY_ALREADY_SUBMITTED)은 **둘 다 409** 라
 * status 만으로는 못 가른다 — code 로 갈라 "아직 참여 불가"와 "이미 제출"을 정확히 구분한다.
 *
 * 순수 함수라 node:test 로 값 검증한다(같은 폴더 survey-error-message.test.ts).
 */

import { defaultErrorMessage, isApiError } from "@/shared/api";

/** 자격 미달(미입장·미종료) 안내 — 409 SURVEY_NOT_AVAILABLE·422 공용. */
const SURVEY_UNAVAILABLE_MESSAGE =
  "아직 설문에 참여하실 수 없습니다. 설명회 입장 후 또는 종료 후에 가능합니다.";

/** 이미 제출된 예약 안내 — 409 SURVEY_ALREADY_SUBMITTED. */
const SURVEY_ALREADY_SUBMITTED_MESSAGE = "이 예약은 이미 설문을 보내셨습니다.";

export function surveyErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);

  switch (error.status) {
    case 401:
    case 403:
      return "인증이 만료되었거나 이미 사용됐습니다. 인증번호를 다시 받아 주세요.";
    case 409:
      // 자격 미달과 중복이 같은 409 로 오므로 code 로 정확히 가른다.
      // 알 수 없는 409 는 둘 중 하나라고 단정하지 않고 기본 문구로 위임한다.
      if (error.code === "SURVEY_NOT_AVAILABLE") return SURVEY_UNAVAILABLE_MESSAGE;
      if (error.code === "SURVEY_ALREADY_SUBMITTED") return SURVEY_ALREADY_SUBMITTED_MESSAGE;
      return defaultErrorMessage(error);
    case 422:
      return SURVEY_UNAVAILABLE_MESSAGE;
    case 429:
      return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}
