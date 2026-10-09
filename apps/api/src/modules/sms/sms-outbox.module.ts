import { Module } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { SmsMessagePolicy } from "./sms-message-policy.service.js";
import { SmsOutboxService } from "./sms-outbox.service.js";
import { SmsTemplateRenderer } from "./sms-template-renderer.service.js";
import { SmsTemplateCatalog } from "./sms-template-catalog.service.js";

/**
 * 문자 발송 대기열 적재 모듈
 *
 * 예약·OTP·관리자 발송 등 문자를 만드는 모듈과 워커가 공유
 */
@Module({
  providers: [PhoneProtector, SmsMessagePolicy, SmsOutboxService, SmsTemplateRenderer, SmsTemplateCatalog],
  exports: [PhoneProtector, SmsMessagePolicy, SmsOutboxService, SmsTemplateRenderer, SmsTemplateCatalog],
})
export class SmsOutboxModule {}
