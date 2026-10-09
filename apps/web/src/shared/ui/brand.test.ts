import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BRAND_NAME,
  BRAND_SEMINAR,
  BRAND_NAME_ROMAN,
  BRAND_SMS_TAG,
  BRAND_QR_DOWNLOAD_BASENAME,
  BRAND_LOGO_SRC,
  brandSeminarTitle,
  brandHomeLabel,
} from "./brand";

// 브랜드 상수 계약. 실제 로고 자산과 접근성 라벨의 단일 출처(brand.ts) 고정
// 로고 경로가 재현 자산이 아닌 보존된 원본을 가리킴
test("brand mark points at the preserved source logo (not a recreated asset)", () => {
  assert.equal(BRAND_LOGO_SRC, "/brand/academy-logo-source.jpg");
});

// 학원 이름·행사 이름은 한국어 브랜드 문자열
test("brand name/seminar copy are the Korean brand strings", () => {
  assert.equal(BRAND_NAME, "예시학원");
  assert.equal(BRAND_SEMINAR, "입시설명회");
});

// 로고 홈 링크의 접근성 이름
test("brandHomeLabel is the accessible name for the logo=home link", () => {
  assert.equal(brandHomeLabel(), "예시학원 입시설명회 홈");
  // 인접 '입시설명회' 문구를 접근성 이름에 보존함
  assert.ok(brandHomeLabel().includes(BRAND_SEMINAR));
  assert.ok(brandHomeLabel().startsWith(BRAND_NAME));
});

// 화면·metadata 공용 전체 명칭
test("brandSeminarTitle is the brand+seminar heading used on 화면·metadata", () => {
  assert.equal(brandSeminarTitle(), "예시학원 입시설명회");
  // 홈 라벨은 이 제목 뒤에 ' 홈' 을 붙인 것임 — 단일 출처를 지킴
  assert.equal(brandHomeLabel(), `${brandSeminarTitle()} 홈`);
});

// 문자 머리표·QR 파일명 상수에 새 브랜드가 반영되고 이전 npr 표기가 없음
test("brand messaging/download constants carry the 예시학원 브랜드 (no legacy npr)", () => {
  // SMS 발신 머리표는 브랜드명 대괄호 표기 — 옛 '[npr]' 자리를 대체함
  assert.equal(BRAND_SMS_TAG, "[예시학원]");
  assert.equal(BRAND_SMS_TAG, `[${BRAND_NAME}]`);
  // 대문자 eyebrow·QR 카드 라벨용 로마자 워드마크 — 로고 원본 파일명과 일치함
  assert.equal(BRAND_NAME_ROMAN, "ACADEMY");
  assert.ok(BRAND_LOGO_SRC.includes(BRAND_NAME_ROMAN.toLowerCase()));
  // 다운로드 파일명에 옛 'npr' 흔적이 남지 않음
  assert.equal(BRAND_QR_DOWNLOAD_BASENAME, "academy-admission-qr");
  assert.ok(!BRAND_QR_DOWNLOAD_BASENAME.includes("npr"));
});
