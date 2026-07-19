import { Inject, Injectable } from "@nestjs/common";
import { type AppEnvironment } from "../../common/config/environment.js";

export type SmsGatewayResult =
  | { readonly kind: "SENT"; readonly providerMessageId: string; readonly providerResultCode: number; readonly providerMessageType: string | null }
  | { readonly kind: "BLOCKED_DISABLED" | "BLOCKED_ALLOWLIST" | "RETRYABLE" | "FAILED_PERMANENT" | "DELIVERY_UNKNOWN"; readonly errorCode: string; readonly providerResultCode?: number };

export interface SmsGatewayRequest {
  readonly branch: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  readonly recipient: string;
  readonly message: string;
  readonly messageType: "SMS" | "LMS";
  readonly title: string | null;
}

@Injectable()
export class AligoGateway {
  public constructor(@Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment) {}

  public readiness() {
    const sendersConfigured = Object.values(this.environment.smsSenders).every((value) => value !== undefined);
    return {
      enabled: this.environment.smsEnabled,
      configured: this.environment.aligoIdentifier !== undefined && this.environment.aligoKey !== undefined && sendersConfigured,
      allowlistEnabled: this.environment.smsRecipientAllowlistEnabled,
      testMode: this.environment.smsAligoTestMode,
    };
  }

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
    } catch (error) {
      const code = this.errorCode(error);
      if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "UND_ERR_CONNECT_TIMEOUT") {
        return { kind: "RETRYABLE", errorCode: "ALIGO_NOT_CONNECTED" };
      }
      return { kind: "DELIVERY_UNKNOWN", errorCode: "ALIGO_ACCEPTANCE_UNKNOWN" };
    }
  }

  private errorCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null) return undefined;
    const direct = "code" in error && typeof error.code === "string" ? error.code : undefined;
    const cause = "cause" in error && typeof error.cause === "object" && error.cause !== null ? error.cause : undefined;
    return direct ?? (cause !== undefined && "code" in cause && typeof cause.code === "string" ? cause.code : undefined);
  }
}
