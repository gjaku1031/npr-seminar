import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SmsAdminController } from "./sms-admin.controller.js";
import { SmsAdminService } from "./sms-admin.service.js";
import { SmsOutboxModule } from "./sms-outbox.module.js";

@Module({
  imports: [AdminAuthModule, SmsOutboxModule],
  controllers: [SmsAdminController],
  providers: [SmsAdminService],
})
export class SmsAdminModule {}
