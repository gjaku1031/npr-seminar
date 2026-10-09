import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SmsAdminController } from "./sms-admin.controller.js";
import { SmsAdminService } from "./sms-admin.service.js";
import { SmsOutboxModule } from "./sms-outbox.module.js";

/**
 * 관리자 문자 발송·템플릿 관리 모듈
 */
@Module({
  imports: [AdminAuthModule, SmsOutboxModule],
  controllers: [SmsAdminController],
  providers: [SmsAdminService],
})
export class SmsAdminModule {}
