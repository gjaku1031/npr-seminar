import { Inject, Injectable } from "@nestjs/common";
import { type AppEnvironment } from "../../common/config/environment.js";

/**
 * 알리고 발송 결과
 *
 * - SENT: 접수 성공
 * - BLOCKED_DISABLED: 발송 비활성으로 미전송
 * - BLOCKED_ALLOWLIST: 허용 목록 밖 수신자로 미전송
 * - RETRYABLE: 연결 전 실패라 재시도해도 중복 발송 위험 없음
 * - FAILED_PERMANENT: 거부 확정
 * - DELIVERY_UNKNOWN: 요청이 전달됐을 수 있어 접수 여부 불명. 중복 방지를 위해 자동 재시도 금지
 */
export type SmsGatewayResult =
  | { readonly kind: "SENT"; readonly providerMessageId: string; readonly providerResultCode: number; readonly providerMessageType: string | null }
  | { readonly kind: "BLOCKED_DISABLED" | "BLOCKED_ALLOWLIST" | "RETRYABLE" | "FAILED_PERMANENT" | "DELIVERY_UNKNOWN"; readonly errorCode: string; readonly providerResultCode?: number };

/**
 * 알리고 발송 요청
 */
export interface SmsGatewayRequest {
  /**
   * 발신 지점. 지점별 발신 번호 선택
   */
  readonly branch: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 수신 번호. 숫자만
   */
  readonly recipient: string;

  /**
   * 본문
   */
  readonly message: string;

  /**
   * 메시지 유형. 90바이트 이하 SMS, 초과 LMS
   */
  readonly messageType: "SMS" | "LMS";

  /**
   * LMS 제목. 없으면 null
   */
  readonly title: string | null;
}

/**
 * 알리고 문자 발송 HTTP 게이트웨이
 *
 * 워커 프로세스 전용. 요청 제한 시간 8초
 */
@Injectable()
export class AligoGateway {
  /**
   * 실행 환경 주입. 발송 사용 여부·자격 증명·발신 번호를 읽음
   */
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  /**
   * 발송 설정 상태
   *
   * @returns 사용 여부, 자격 증명·전 지점 발신 번호 설정 여부, 허용 목록·테스트 모드 여부
   */
  public readiness() {
    const sendersConfigured = Object.values(this.environment.smsSenders).every((value) => value !== undefined);
    return {
      enabled: this.environment.smsEnabled,
      configured: this.environment.aligoIdentifier !== undefined && this.environment.aligoKey !== undefined && sendersConfigured,
      allowlistEnabled: this.environment.smsRecipientAllowlistEnabled,
      testMode: this.environment.smsAligoTestMode,
    };
  }

  /**
   * 문자 1건 발송
   *
   * 1. 비활성·허용 목록 밖·설정 누락이면 전송 없이 결과 반환
   * 2. 알리고 /send/ 호출. 테스트 모드면 testmode_yn=Y
   * 3. 응답을 접수 성공·거부·불명으로 분류
   *
   * 예외를 던지지 않고 모든 실패를 결과 값으로 반환
   */
  public async send(request: SmsGatewayRequest): Promise<SmsGatewayResult> {
    if (!this.environment.smsEnabled) return { kind: "BLOCKED_DISABLED", errorCode: "SMS_DISABLED" };
    if (this.environment.smsRecipientAllowlistEnabled && !this.environment.smsTestRecipients.has(request.recipient)) {
      return { kind: "BLOCKED_ALLOWLIST", errorCode: "RECIPIENT_NOT_ALLOWLISTED" };
    }
    const sender = this.environment.smsSenders[request.branch];
    const identifier = this.environment.aligoIdentifier;
    const key = this.environment.aligoKey;
    if (sender === undefined || identifier === undefined || key === undefined) {
      return { kind: "FAILED_PERMANENT", errorCode: "SMS_CONFIGURATION_INCOMPLETE" };
    }
    const body = new URLSearchParams({
      key,
      user_id: identifier,
      sender,
      receiver: request.recipient,
      msg: request.message,
      msg_type: request.messageType,
    });
    if (request.title !== null) body.set("title", request.title);
    if (this.environment.smsAligoTestMode) body.set("testmode_yn", "Y");

    // 5xx는 처리 여부를 알 수 없어 불명, 4xx는 거부 확정
    try {
      const response = await fetch("https://apis.aligo.in/send/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        return response.status >= 500
          ? { kind: "DELIVERY_UNKNOWN", errorCode: "ALIGO_HTTP_UNCERTAIN" }
          : { kind: "FAILED_PERMANENT", errorCode: "ALIGO_HTTP_REJECTED" };
      }
      // result_code가 양수이고 성공 1건·실패 0건·msg_id가 있어야 접수 성공
      const payload = await response.json() as Record<string, unknown>;
      const resultCode = Number(payload.result_code);
      if (!Number.isInteger(resultCode)) return { kind: "DELIVERY_UNKNOWN", errorCode: "ALIGO_RESPONSE_INVALID" };
      const successCount = Number(payload.success_cnt);
      const errorCount = Number(payload.error_cnt);
      if (resultCode > 0 && payload.msg_id !== undefined && successCount === 1 && errorCount === 0) {
        return {
          kind: "SENT",
          providerMessageId: String(payload.msg_id).slice(0, 80),
          providerResultCode: resultCode,
          providerMessageType: typeof payload.msg_type === "string" ? payload.msg_type.slice(0, 16) : null,
        };
      }
      if (resultCode > 0 && Number.isInteger(successCount) && Number.isInteger(errorCount)) {
        return { kind: "FAILED_PERMANENT", errorCode: "ALIGO_RECIPIENT_REJECTED", providerResultCode: resultCode };
      }
      if (resultCode > 0) return { kind: "DELIVERY_UNKNOWN", errorCode: "ALIGO_ACCEPTANCE_RESPONSE_INCOMPLETE", providerResultCode: resultCode };
      return {
        kind: "FAILED_PERMANENT",
        errorCode: "ALIGO_PROVIDER_REJECTED",
        ...(Number.isInteger(resultCode) ? { providerResultCode: resultCode } : {}),
      };
    // DNS 실패·연결 거부·연결 시간 초과는 요청이 나가지 않았으므로 재시도 가능, 그 외는 불명
    } catch (error) {
      const code = this.errorCode(error);
      if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "UND_ERR_CONNECT_TIMEOUT") {
        return { kind: "RETRYABLE", errorCode: "ALIGO_NOT_CONNECTED" };
      }
      return { kind: "DELIVERY_UNKNOWN", errorCode: "ALIGO_ACCEPTANCE_UNKNOWN" };
    }
  }

  /**
   * fetch 오류 또는 cause의 시스템 오류 코드
   *
   * @returns 오류 코드. 없으면 undefined
   */
  private errorCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null) return undefined;
    const direct = "code" in error && typeof error.code === "string" ? error.code : undefined;
    const cause = "cause" in error && typeof error.cause === "object" && error.cause !== null ? error.cause : undefined;
    return direct ?? (cause !== undefined && "code" in cause && typeof cause.code === "string" ? cause.code : undefined);
  }
}
