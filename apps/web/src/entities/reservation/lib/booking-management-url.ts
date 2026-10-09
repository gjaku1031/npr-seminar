/**
 * 예약 관리 URL 순수 헬퍼
 *
 * ⚠️ 여기서 만드는 것은 안전한 예약 관리 URL 뿐임 — 같은 오리진의 `/booking/{familyBookingId}`
 * 원문 QR 토큰(bearer credential)은 이 URL 어디에도 들어가지 않음. path·query·fragment 모두
 * FamilyBooking 식별자만 담음. 토큰을 URL 로 감싸는 경로는 존재하지 않음 (계약: path/query 금지)
 *
 * 순수 함수라 DOM 없이 테스트함. 클립보드 조정도 주입된 함수만 호출하므로 node:test 에서
 * 브라우저 API 없이 검증됨. 실제 DOM 폴백은 클라이언트 컴포넌트에 국소적으로 둠
 */

/**
 * 같은 오리진의 절대 예약 관리 URL 을 만듦
 * familyBookingId 는 encodeURIComponent 로 감싸 path 를 안전하게 이스케이프함
 * query·hash 는 붙이지 않음
 */
export function buildBookingManagementUrl(origin: string, familyBookingId: string): string {
  return `${origin}/booking/${encodeURIComponent(familyBookingId)}`;
}

/**
 * 1차(비동기 clipboard)와 폴백 복사를 조정함. DOM 을 요구하지 않도록 실행자를 주입받음
 */
export interface CopyExecutors {
  /**
   * navigator.clipboard.writeText 등 1차 비동기 복사. 없으면(불가) 폴백으로 넘어감
   */
  primary?: (text: string) => Promise<void>;
  /**
   * DOM textarea + execCommand 등 동기 폴백. true 면 성공
   */
  fallback?: (text: string) => boolean;
}

/**
 * 텍스트를 복사함: 1차가 있으면 먼저 시도하고, 없거나 reject 하면 폴백을 시도함
 * 둘 다 실패(또는 부재)하면 false 를 돌려주어 호출부가 오류 피드백을 띄우게 함
 * 1차가 성공하면 폴백은 호출하지 않음
 */
export async function copyManagementUrl(
  text: string,
  { primary, fallback }: CopyExecutors,
): Promise<boolean> {
  if (primary) {
    try {
      await primary(text);
      return true;
    } catch {
      // 1차 실패 — 아래 폴백으로 내려감
    }
  }
  if (fallback) {
    try {
      return fallback(text);
    } catch {
      return false;
    }
  }
  return false;
}
