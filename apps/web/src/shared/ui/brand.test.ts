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

// BrandMark 접근성·구조 계약 — 실제 로고 자산과 접근성 라벨의 단일 출처(brand.ts)를 잠근다.
test("brand mark points at the preserved source logo (not a recreated asset)", () => {
  assert.equal(BRAND_LOGO_SRC, "/brand/neulpureun-logo-source.jpg");
});

test("brand name/seminar copy are the Korean brand strings", () => {
  assert.equal(BRAND_NAME, "늘푸른수학원");
  assert.equal(BRAND_SEMINAR, "입시설명회");
});

test("brandHomeLabel is the accessible name for the logo=home link", () => {
  assert.equal(brandHomeLabel(), "늘푸른수학원 입시설명회 홈");
  // 인접 '입시설명회' 문구를 접근성 이름에 보존한다.
  assert.ok(brandHomeLabel().includes(BRAND_SEMINAR));
  assert.ok(brandHomeLabel().startsWith(BRAND_NAME));
});

test("brandSeminarTitle is the brand+seminar heading used on 화면·metadata", () => {
  assert.equal(brandSeminarTitle(), "늘푸른수학원 입시설명회");
  // 홈 라벨은 이 제목 뒤에 ' 홈' 을 붙인 것이다 — 단일 출처를 지킨다.
  assert.equal(brandHomeLabel(), `${brandSeminarTitle()} 홈`);
});

test("brand messaging/download constants carry the 늘푸른수학원 브랜드 (no legacy npr)", () => {
  // SMS 발신 머리표는 브랜드명 대괄호 표기 — 옛 '[npr]' 자리를 대체한다.
  assert.equal(BRAND_SMS_TAG, "[늘푸른수학원]");
  assert.equal(BRAND_SMS_TAG, `[${BRAND_NAME}]`);
  // 대문자 eyebrow·QR 카드 라벨용 로마자 워드마크 — 로고 원본 파일명과 일치한다.
  assert.equal(BRAND_NAME_ROMAN, "NEULPUREUN");
  assert.ok(BRAND_LOGO_SRC.includes(BRAND_NAME_ROMAN.toLowerCase()));
  // 다운로드 파일명에 옛 'npr' 흔적이 남지 않는다.
  assert.equal(BRAND_QR_DOWNLOAD_BASENAME, "neulpureun-admission-qr");
  assert.ok(!BRAND_QR_DOWNLOAD_BASENAME.includes("npr"));
});
