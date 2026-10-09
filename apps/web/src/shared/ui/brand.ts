// 학원 브랜드 상수. BrandMark와 접근성 라벨의 단일 출처
// 로고는 실제 브랜드 자산이라 텍스트·SVG·CSS로 재현하지 않음
// 원본(public/brand/academy-logo-source.jpg)은 무손실로 보존하고 BrandMark가 여백만 잘라 표시
// 로고 안에 흰색 한글 글자가 있어 흰색을 전역 제거하지 않음

/**
 * 학원 이름
 */
export const BRAND_NAME = "예시학원";

/**
 * 행사 이름
 */
export const BRAND_SEMINAR = "입시설명회";

/**
 * 영문 워드마크. 대문자 eyebrow·QR 카드 라벨용, 로고 원본 파일명과 같은 표기
 */
export const BRAND_NAME_ROMAN = "ACADEMY";

/**
 * 문자 발신 머리표. 본문 맨 앞의 `[학원 이름]`
 */
export const BRAND_SMS_TAG = `[${BRAND_NAME}]`;

/**
 * 입장 QR PNG 내려받기 파일명(확장자 제외)
 *
 * 예약 ID·토큰·연락처·이름을 넣지 않는 고정 문구로 모든 사용자가 같은 값을 씀
 */
export const BRAND_QR_DOWNLOAD_BASENAME = "academy-admission-qr";

/**
 * 원본 로고 경로(무손실, 1280×1280)
 */
export const BRAND_LOGO_SRC = "/brand/academy-logo-source.jpg";

/**
 * 화면 헤더·metadata 공용 전체 명칭. `학원 이름 행사 이름`
 */
export function brandSeminarTitle(): string {
  return `${BRAND_NAME} ${BRAND_SEMINAR}`;
}

/**
 * 로고 홈 링크의 접근성 이름. `전체 명칭 홈`
 */
export function brandHomeLabel(): string {
  return `${brandSeminarTitle()} 홈`;
}
