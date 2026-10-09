import { Module } from "@nestjs/common";
import { AligoGateway } from "./aligo.gateway.js";
import { SmsOutboxModule } from "./sms-outbox.module.js";
import { SmsWorkerService } from "./sms-worker.service.js";

/**
 * 문자 발송 워커 모듈. 워커 프로세스 전용
 */
@Module({
  imports: [SmsOutboxModule],
  providers: [AligoGateway, SmsWorkerService],
  exports: [SmsWorkerService],
})
export class SmsWorkerModule {}
