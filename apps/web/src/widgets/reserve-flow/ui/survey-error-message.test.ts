/**
 * 설문 실패 문구 매핑의 순수 규칙만 값으로 확인한다 (node:test + tsx).
 *
 * 핵심: SURVEY_NOT_AVAILABLE 과 SURVEY_ALREADY_SUBMITTED 는 **둘 다 409** 라
 * status 만으론 못 가른다 — code 로 갈라 서로 다른 문구를 내야 한다.
 *
 * 실행: npm --prefix apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { surveyErrorMessage } from "./survey-error-message";
import { ApiError, defaultErrorMessage } from "@/shared/api";

const problem = (status: number, code: string) =>
  new ApiError({ kind: "problem", status, code, message: "x" });

describe("surveyErrorMessage — 설문 제출 실패 문구", () => {
  it("409 SURVEY_NOT_AVAILABLE 은 '아직 참여 불가'로 (중복 문구가 아니다)", () => {
    const message = surveyErrorMessage(problem(409, "SURVEY_NOT_AVAILABLE"));
    assert.match(message, /아직 설문에 참여하실 수 없습니다/u);
  });

  it("409 SURVEY_ALREADY_SUBMITTED 은 '이미 제출'로", () => {
    const message = surveyErrorMessage(problem(409, "SURVEY_ALREADY_SUBMITTED"));
    assert.match(message, /이미 설문을 보내셨습니다/u);
  });

  it("두 409 는 서로 다른 문구여야 한다", () => {
    assert.notEqual(
      surveyErrorMessage(problem(409, "SURVEY_NOT_AVAILABLE")),
      surveyErrorMessage(problem(409, "SURVEY_ALREADY_SUBMITTED")),
    );
  });

  it("code 미상의 409 는 둘 중 하나라고 단정하지 않고 기본 문구로 위임한다", () => {
    const message = surveyErrorMessage(problem(409, "SOME_OTHER_CONFLICT"));
    // '이미 제출'·'참여 불가' 어느 쪽도 단정하지 않는다.
    assert.doesNotMatch(message, /이미 설문을 보내셨습니다/u);
    assert.doesNotMatch(message, /아직 설문에 참여하실 수 없습니다/u);
    // 기본 409 문구로 위임한다.
    assert.equal(message, defaultErrorMessage(problem(409, "SOME_OTHER_CONFLICT")));
  });

  it("401·403 은 인증 안내를 유지한다", () => {
    for (const status of [401, 403]) {
      assert.match(surveyErrorMessage(problem(status, "X")), /인증번호를 다시 받아/u);
    }
  });

  it("422 는 자격 미달 안내(409 SURVEY_NOT_AVAILABLE 과 같은 문구)", () => {
    assert.equal(
      surveyErrorMessage(problem(422, "SURVEY_NOT_AVAILABLE")),
      surveyErrorMessage(problem(409, "SURVEY_NOT_AVAILABLE")),
    );
  });

  it("429 는 재시도 안내를 유지한다", () => {
    assert.match(surveyErrorMessage(problem(429, "X")), /잠시 후 다시 시도/u);
  });

  it("ApiError 가 아니면 기본 문구로 위임한다", () => {
    assert.equal(typeof surveyErrorMessage(new Error("boom")), "string");
  });
});
