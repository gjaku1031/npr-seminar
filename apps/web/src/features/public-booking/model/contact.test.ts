/**
 * 연락처 정규화·검증 순수 테스트 (node:test + tsx). 루트 조회·개인 링크 교환·OTP 가 공유하는 규칙.
 *
 * 실행: node --import tsx --test src/features/public-booking/model/contact.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatContactInput, isCompleteContact, normalizeContactDigits } from "./contact";

describe("normalizeContactDigits — 숫자만 남긴다", () => {
  it("하이픈·공백을 제거한다", () => {
    assert.equal(normalizeContactDigits("010-1234-5678"), "01012345678");
    assert.equal(normalizeContactDigits(" 010 1234 5678 "), "01012345678");
  });

  it("숫자가 아닌 문자를 모두 버린다", () => {
    assert.equal(normalizeContactDigits("abc010def"), "010");
    assert.equal(normalizeContactDigits(""), "");
  });
});

describe("isCompleteContact — 계약 길이(8~15자리)", () => {
  it("8자리 미만은 미완성", () => {
    assert.equal(isCompleteContact("0101234"), false);
  });

  it("8~15자리는 완성", () => {
    assert.equal(isCompleteContact("01012345"), true);
    assert.equal(isCompleteContact("01012345678"), true);
    assert.equal(isCompleteContact("123456789012345"), true);
  });

  it("15자리 초과는 미완성", () => {
    assert.equal(isCompleteContact("1234567890123456"), false);
  });
});

describe("formatContactInput — 표시용 하이픈 표기(숫자만 입력)", () => {
  it("한 자리씩 입력해도 진행형으로 하이픈이 붙는다", () => {
    const steps: Array<[string, string]> = [
      ["0", "0"],
      ["01", "01"],
      ["010", "010"],
      ["0107", "010-7"],
      ["01077", "010-77"],
      ["010776", "010-776"],
      ["0107769", "010-7769"],
      ["01077697", "010-7769-7"],
      ["010776976", "010-7769-76"],
      ["0107769762", "010-7769-762"],
      ["01077697629", "010-7769-7629"],
    ];
    for (const [typed, shown] of steps) {
      assert.equal(formatContactInput(typed), shown);
    }
  });

  it("01077697629 는 010-7769-7629 로 보인다", () => {
    assert.equal(formatContactInput("01077697629"), "010-7769-7629");
  });

  it("하이픈·공백이 섞인 붙여넣기도 같은 표기로 정규화한다", () => {
    assert.equal(formatContactInput("010-7769-7629"), "010-7769-7629");
    assert.equal(formatContactInput("010 7769 7629"), "010-7769-7629");
    assert.equal(formatContactInput(" 010-7769 7629 "), "010-7769-7629");
    assert.equal(formatContactInput("010-77697629"), "010-7769-7629");
  });

  it("지우면(숫자 삭제) 남은 숫자에 맞춰 다시 표기한다", () => {
    // 끝 한 글자 삭제 → 마지막 그룹이 줄어든다.
    assert.equal(formatContactInput("010-7769-762"), "010-7769-762");
    // 그룹 경계를 넘어 지우면 하이픈도 사라진다.
    assert.equal(formatContactInput("010-7769"), "010-7769");
    assert.equal(formatContactInput("010-776"), "010-776");
    assert.equal(formatContactInput(""), "");
  });

  it("서울(02) 지역번호는 02-XXXX-XXXX 로 끊는다", () => {
    assert.equal(formatContactInput("0212345678"), "02-1234-5678");
  });

  it("10자리 지역번호(031 등)는 fmtPhone 과 같이 3-3-4 로 끊는다", () => {
    assert.equal(formatContactInput("0312345678"), "031-234-5678");
    assert.equal(formatContactInput("031-234-5678"), "031-234-5678");
  });

  it("휴대폰(010)은 진행 중 10자리에서도 3-4-… 를 유지한다 — 지역번호와 섞이지 않는다", () => {
    assert.equal(formatContactInput("0107769762"), "010-7769-762");
    assert.equal(formatContactInput("01077697629"), "010-7769-7629");
  });

  it("11자리 비휴대폰도 3-4-4 로 끊는다", () => {
    assert.equal(formatContactInput("01112345678"), "011-1234-5678");
  });

  it("계약 15자리를 넘으면 하이픈 없이 숫자만 돌려준다", () => {
    assert.equal(formatContactInput("1234567890123456"), "1234567890123456");
    assert.equal(formatContactInput("123-4567-8901-2345-6"), "1234567890123456");
    // 15자리 이하는 여전히 표기한다.
    assert.equal(formatContactInput("123456789012345"), "123-4567-89012345");
  });

  it("표기는 값을 바꾸지 않는다 — 정규화하면 입력 숫자와 같다", () => {
    assert.equal(normalizeContactDigits(formatContactInput("01077697629")), "01077697629");
  });
});
