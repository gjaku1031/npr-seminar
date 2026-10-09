/**
 * 세션에 저장된 인증 주체
 *
 * 관리자 로그인 또는 스캐너 기기 페어링 성공 시 생성됨
 */
export interface AuthenticatedActor {
  /**
   * 감사 기록용 주체 식별자. 관리자는 계정 기준, 스캐너는 기기 기준
   */
  readonly subject: string;

  /**
   * 권한 역할. ADMIN 관리자 콘솔, SCANNER 체크인 전용 기기
   */
  readonly role: "ADMIN" | "SCANNER";

  /**
   * 스캐너 기기 공개 ID. SCANNER 역할에서만 존재
   */
  readonly scannerDeviceId?: string;

  /**
   * 스캐너가 선택한 설명회 회차 ID. 선택 전이면 생략
   */
  readonly selectedSessionId?: string;
}
