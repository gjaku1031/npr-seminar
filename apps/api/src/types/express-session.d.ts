import "express-session";

/**
 * express-session 세션 데이터 확장
 */
declare module "express-session" {
  /**
   * 서버 세션에 저장하는 값
   */
  interface SessionData {
    /**
     * 세션별 CSRF 토큰
     */
    csrfToken?: string;

    /**
     * 세션 절대 만료 시각(epoch 밀리초)
     */
    absoluteExpiresAt?: number;

    /**
     * 예약 관리 접근 증명 ID
     */
    bookingManagementSessionId?: string;

    /**
     * 예약 관리 접근 만료 시각(epoch 밀리초)
     */
    bookingManagementExpiresAt?: number;

    /**
     * 인증 주체. AuthenticatedActor와 같은 형태
     */
    actor?: {
      /**
       * 감사 기록용 주체 식별자
       */
      subject: string;

      /**
       * 권한 역할
       */
      role: "ADMIN" | "SCANNER";

      /**
       * 스캐너 기기 공개 ID
       */
      scannerDeviceId?: string;

      /**
       * 스캐너가 선택한 회차 ID
       */
      selectedSessionId?: string;
    };
  }
}
