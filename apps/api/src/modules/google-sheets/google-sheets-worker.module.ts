import { Module } from "@nestjs/common";
import { GoogleSheetsV4Client, SheetsClient } from "./google-sheets-v4.client.js";
import { GoogleSheetsGateway } from "./google-sheets.gateway.js";
import { GoogleSheetsOutboxModule } from "./google-sheets-outbox.module.js";
import { SheetWorkerService } from "./sheet-worker.service.js";
import { SheetMappingActivationService } from "./sheet-mapping-activation.service.js";

/**
 * 시트 반영 워커 모듈. Google 자격 증명을 쓰므로 워커 프로세스 전용
 */
@Module({
  imports: [GoogleSheetsOutboxModule],
  providers: [
    { provide: SheetsClient, useClass: GoogleSheetsV4Client },
    GoogleSheetsGateway,
    SheetMappingActivationService,
    SheetWorkerService,
  ],
  exports: [SheetMappingActivationService, SheetWorkerService],
})
export class GoogleSheetsWorkerModule {}
