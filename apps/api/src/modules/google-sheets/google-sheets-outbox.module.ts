import { Module } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { SheetOutboxService } from "./sheet-outbox.service.js";

@Module({
  providers: [PhoneProtector, SheetOutboxService],
  exports: [PhoneProtector, SheetOutboxService],
})
export class GoogleSheetsOutboxModule {}
