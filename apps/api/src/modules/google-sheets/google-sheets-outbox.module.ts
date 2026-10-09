import { Module } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { SheetOutboxService } from "./sheet-outbox.service.js";

/**
 * 시트 반영 대기열 적재 모듈. 예약 변경 모듈과 워커가 공유
 */
@Module({
  providers: [PhoneProtector, SheetOutboxService],
  exports: [PhoneProtector, SheetOutboxService],
})
export class GoogleSheetsOutboxModule {}
