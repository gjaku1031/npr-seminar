import { Module } from "@nestjs/common";
import { GoogleSheetsV4Client, SheetsClient } from "./google-sheets-v4.client.js";
import { GoogleSheetsGateway } from "./google-sheets.gateway.js";
import { GoogleSheetsOutboxModule } from "./google-sheets-outbox.module.js";
import { SheetWorkerService } from "./sheet-worker.service.js";
import { SheetMappingActivationService } from "./sheet-mapping-activation.service.js";

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
