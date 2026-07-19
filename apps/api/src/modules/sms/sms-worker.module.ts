import { Module } from "@nestjs/common";
import { AligoGateway } from "./aligo.gateway.js";
import { SmsOutboxModule } from "./sms-outbox.module.js";
import { SmsWorkerService } from "./sms-worker.service.js";

@Module({
  imports: [SmsOutboxModule],
  providers: [AligoGateway, SmsWorkerService],
  exports: [SmsWorkerService],
})
export class SmsWorkerModule {}
