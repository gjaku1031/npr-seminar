import { Module } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { SmsMessagePolicy } from "./sms-message-policy.service.js";
import { SmsOutboxService } from "./sms-outbox.service.js";
import { SmsTemplateRenderer } from "./sms-template-renderer.service.js";
import { SmsTemplateCatalog } from "./sms-template-catalog.service.js";

@Module({
  providers: [PhoneProtector, SmsMessagePolicy, SmsOutboxService, SmsTemplateRenderer, SmsTemplateCatalog],
  exports: [PhoneProtector, SmsMessagePolicy, SmsOutboxService, SmsTemplateRenderer, SmsTemplateCatalog],
})
export class SmsOutboxModule {}
