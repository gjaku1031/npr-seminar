/**
 * 예시학원 브랜드 상수 — BrandMark 와 접근성 라벨의 단일 출처.
 *
 * 로고는 사용자 제공 실제 브랜드 자산이다. 텍스트·SVG·CSS 로 재현하지 않는다.
 * 원본(public/brand/academy-logo-source.jpg)은 무손실 그대로 보존하고,
 * BrandMark 가 클리핑(overflow) 프레젠테이션으로 여백만 잘라 타이트하게 보여준다.
 * 로고 안에는 흰색 한글 글자(예시)가 있으므로 흰색을 전역 제거하지 않는다.
 */

export const BRAND_NAME = "예시학원";
export const BRAND_SEMINAR = "입시설명회";

/** public/brand 원본 로고(무손실 원본, 1280×1280). */
export const BRAND_LOGO_SRC = "/brand/academy-logo-source.jpg";

/** 로고=허브 복귀 링크의 접근성 이름 (예: "예시학원 입시설명회 홈"). */
export function brandHomeLabel(): string {
  return `${BRAND_NAME} ${BRAND_SEMINAR} 홈`;
}
