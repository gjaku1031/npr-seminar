/**
 * 개인 링크 fragment 파서 순수 테스트 (node:test + tsx). DOM·클라이언트 컴포넌트를 import 하지 않는다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBookingAccessFragment } from "./booking-access-fragment";

// 정확히 43자 base64url.
const VALID = "abcDEF012345678901234567890123456789012_-XY";

describe("parseBookingAccessFragment — 정상", () => {
  it("`#token=<43자>` 에서 원문을 뽑는다", () => {
    assert.equal(parseBookingAccessFragment(`#token=${VALID}`), VALID);
  });

  it("`#` 접두가 없어도 파싱한다", () => {
    assert.equal(parseBookingAccessFragment(`token=${VALID}`), VALID);
  });

  it("길이 검증 — 43자여야 한다", () => {
    assert.equal(VALID.length, 43);
  });
});

describe("parseBookingAccessFragment — 거절", () => {
  it("빈 fragment 는 null", () => {
    assert.equal(parseBookingAccessFragment(""), null);
    assert.equal(parseBookingAccessFragment("#"), null);
  });

  it("token 키가 아니면 null", () => {
    assert.equal(parseBookingAccessFragment(`#access=${VALID}`), null);
  });

  it("길이가 43자가 아니면 null (짧음/긺)", () => {
    assert.equal(parseBookingAccessFragment("#token=short"), null);
    assert.equal(parseBookingAccessFragment(`#token=${VALID}extra`), null);
  });

  it("base64url 이 아닌 문자는 null", () => {
    const bad = `${VALID.slice(0, 42)}!`;
    assert.equal(parseBookingAccessFragment(`#token=${bad}`), null);
  });

  it("파라미터가 여럿이거나 token 이 중복이면 null", () => {
    assert.equal(parseBookingAccessFragment(`#token=${VALID}&x=1`), null);
    assert.equal(parseBookingAccessFragment(`#token=${VALID}&token=${VALID}`), null);
  });

  it("값이 없으면 null", () => {
    assert.equal(parseBookingAccessFragment("#token="), null);
    assert.equal(parseBookingAccessFragment("#token"), null);
  });

  it("문자열이 아니면 null", () => {
    assert.equal(parseBookingAccessFragment(undefined as unknown as string), null);
  });
});
