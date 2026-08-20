/**
 * 용도별 변수 설정의 순수 테스트 (node:test + tsx).
 *
 * 지키려는 것은 두 가지다:
 *  1) 편집 가능한 용도 집합은 FIRST_CHECK_IN 을 절대 포함하지 않는다.
 *  2) 용도별 변수는 백엔드 PURPOSE_VARIABLES(sms-template-renderer.service.ts)와 **정확히** 같다.
 *
 * 아래 EXPECTED 는 서버 소스에서 손으로 옮긴 기대값이다 — 이 파일이 그 계약의 프론트 쪽 잠금이다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asEditablePurpose,
  DEFAULT_EDITABLE_PURPOSE,
  EDITABLE_PURPOSE_OPTIONS,
  EDITABLE_SMS_PURPOSES,
  isEditableSmsPurpose,
  newTemplateKey,
  SMS_PURPOSE_LABELS,
  SMS_PURPOSE_VARIABLES,
  variablesForPurpose,
  type EditableSmsPurpose,
} from "./template-purpose";

/** 백엔드 PURPOSE_VARIABLES 를 그대로 옮긴 기대값 (FIRST_CHECK_IN 제외 — 여기서 다루지 않는다). */
const EXPECTED: Record<EditableSmsPurpose, string[]> = {
  OTP: ["{인증번호}"],
  BOOKING_CONFIRMED: ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{QR링크}", "{문의전화}"],
  BOOKING_UPDATED: ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{예약확인링크}", "{QR링크}", "{문의전화}"],
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

describe("EDITABLE_SMS_PURPOSES", () => {
  it("FIRST_CHECK_IN 을 절대 포함하지 않는다 — 생성·수정·필터·선택·변수 어디에도 없어야 한다", () => {
    assert.equal((EDITABLE_SMS_PURPOSES as readonly string[]).includes("FIRST_CHECK_IN"), false);
    assert.equal(isEditableSmsPurpose("FIRST_CHECK_IN"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(SMS_PURPOSE_VARIABLES, "FIRST_CHECK_IN"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(SMS_PURPOSE_LABELS, "FIRST_CHECK_IN"), false);
  });

  it("편집 가능한 용도는 정확히 이 6종이다", () => {
    assert.deepEqual([...EDITABLE_SMS_PURPOSES].sort(), [
      "ADMIN_GROUP",
      "BOOKING_CANCELLED",
      "BOOKING_CONFIRMED",
      "BOOKING_UPDATED",
      "OTP",
    ]);
  });

  it("기본 뷰는 ADMIN_GROUP 이다 — 이 화면은 주로 그룹 발송에 쓰인다", () => {
    assert.equal(DEFAULT_EDITABLE_PURPOSE, "ADMIN_GROUP");
  });

  it("모든 용도에 한국어 라벨과 Select 옵션이 있다", () => {
    for (const purpose of EDITABLE_SMS_PURPOSES) {
      assert.equal(typeof SMS_PURPOSE_LABELS[purpose], "string");
      assert.notEqual(SMS_PURPOSE_LABELS[purpose].length, 0);
    }
    assert.equal(EDITABLE_PURPOSE_OPTIONS.length, EDITABLE_SMS_PURPOSES.length);
    assert.deepEqual(
      EDITABLE_PURPOSE_OPTIONS.map((option) => option.value).sort(),
      [...EDITABLE_SMS_PURPOSES].sort(),
    );
  });
});

describe("SMS_PURPOSE_VARIABLES — 백엔드 PURPOSE_VARIABLES 와 정확히 일치", () => {
  for (const purpose of EDITABLE_SMS_PURPOSES) {
    it(`${purpose} 는 기대한 변수 집합과 정확히 같다`, () => {
      // 집합으로 비교한다(순서 무관, 중복·누락·초과를 모두 잡는다).
      assert.deepEqual(
        [...SMS_PURPOSE_VARIABLES[purpose]].sort(),
        [...EXPECTED[purpose]].sort(),
      );
      assert.deepEqual([...variablesForPurpose(purpose)].sort(), [...EXPECTED[purpose]].sort());
    });
  }

  it("OTP 는 인증번호 하나뿐이다", () => {
    assert.deepEqual(SMS_PURPOSE_VARIABLES.OTP, ["{인증번호}"]);
  });

  it("BOOKING_CANCELLED 에는 QR링크가 없다 — CONFIRMED 와의 유일한 차이다", () => {
    assert.equal(SMS_PURPOSE_VARIABLES.BOOKING_CANCELLED.includes("{QR링크}"), false);
    assert.equal(SMS_PURPOSE_VARIABLES.BOOKING_CONFIRMED.includes("{QR링크}"), true);
  });

  it("ADMIN_GROUP 은 실제 변수 8종을 모두 담는다", () => {
    assert.equal(SMS_PURPOSE_VARIABLES.ADMIN_GROUP.length, 8);
    assert.equal(SMS_PURPOSE_VARIABLES.ADMIN_GROUP.includes("{인증번호}"), true);
  });

});

describe("isEditableSmsPurpose / asEditablePurpose", () => {
  it("편집 가능 용도는 전부 편집 가능으로 본다", () => {
    for (const purpose of EDITABLE_SMS_PURPOSES) {
      assert.equal(isEditableSmsPurpose(purpose), true);
    }
  });

  it("FIRST_CHECK_IN·알 수 없는 값은 편집 불가이고 기본 뷰로 떨어진다", () => {
    assert.equal(isEditableSmsPurpose("FIRST_CHECK_IN"), false);
    assert.equal(asEditablePurpose("FIRST_CHECK_IN"), "ADMIN_GROUP");
    assert.equal(asEditablePurpose("WHATEVER"), "ADMIN_GROUP");
  });

  it("편집 가능한 값은 그대로 통과시킨다", () => {
    assert.equal(asEditablePurpose("OTP"), "OTP");
  });
});

describe("newTemplateKey", () => {
  it("모든 편집 용도에서 계약 패턴 ^[A-Z0-9_]{3,80}$ 을 만족한다", () => {
    const pattern = /^[A-Z0-9_]{3,80}$/u;
    for (const purpose of EDITABLE_SMS_PURPOSES) {
      const key = newTemplateKey(purpose);
      assert.match(key, pattern);
    }
  });

  it("용도 접두어를 담아 로그에서 구분된다", () => {
    assert.match(newTemplateKey("ADMIN_GROUP"), /^GROUP_/u);
    assert.match(newTemplateKey("OTP"), /^OTP_/u);
  });

  it("호출마다 다른 key 를 만든다", () => {
    assert.notEqual(newTemplateKey("ADMIN_GROUP"), newTemplateKey("ADMIN_GROUP"));
  });
});
