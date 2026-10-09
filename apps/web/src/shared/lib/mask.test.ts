// 공개 표시용 마스킹 순수 테스트. React·DOM을 import하지 않음
// 유니코드 안전·이중 마스킹 방지·원본 불변·국내 휴대전화 형식 고정
// 실행: pnpm --dir apps/web test

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskName, maskPhone } from "./mask";

describe("maskName — 이름 가운데 가리기", () => {
  it("세 글자 이름은 가운데를 가린다", () => {
    assert.equal(maskName("홍길동"), "홍*동");
  });

  it("두 글자 이름은 뒤를 가린다", () => {
    assert.equal(maskName("김민"), "김*");
  });

  it("네 글자 이름은 가운데 두 글자를 가린다", () => {
    assert.equal(maskName("남궁민수"), "남**수");
  });

  it("한 글자 이름도 원문을 노출하지 않고 가린다", () => {
    assert.equal(maskName("이"), "*");
    assert.equal(maskName(""), "");
  });

  it("이미 마스킹된 값은 다시 마스킹하지 않는다", () => {
    assert.equal(maskName("홍*동"), "홍*동");
  });

  it("서로게이트 쌍을 쪼개지 않는다 (유니코드 안전)", () => {
    // 고딕 문자 3자 — 각 글자가 BMP 밖(서로게이트 쌍)임
    assert.equal(maskName("𐌰𐌱𐌲"), "𐌰*𐌲");
  });
});

describe("maskPhone — 연락처 가리기", () => {
  it("11자리 휴대전화는 010-****-1234 형태로 가린다", () => {
    assert.equal(maskPhone("01012341234"), "010-****-1234");
  });

  it("하이픈이 섞인 입력도 숫자만으로 판단한다", () => {
    assert.equal(maskPhone("010-1234-1234"), "010-****-1234");
  });

  it("10자리 휴대전화(구 번호)는 가운데 세 자리를 가린다", () => {
    assert.equal(maskPhone("0111234567"), "011-***-4567");
  });

  it("알 수 없는 형식은 마지막 네 자리만 남긴다", () => {
    assert.equal(maskPhone("021234567"), "*****4567");
  });

  it("이미 마스킹된 값은 다시 마스킹하지 않는다", () => {
    assert.equal(maskPhone("010-****-1234"), "010-****-1234");
  });
});

describe("마스킹은 원본을 바꾸지 않는다", () => {
  it("입력 문자열을 그대로 두고 새 문자열만 돌려준다", () => {
    const name = "홍길동";
    const phone = "01012341234";
    maskName(name);
    maskPhone(phone);
    assert.equal(name, "홍길동");
    assert.equal(phone, "01012341234");
  });
});
