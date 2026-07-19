import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { FamilyBookingsModule } from "../family-bookings/family-bookings.module.js";
import { CheckInsController } from "./check-ins.controller.js";
import { CheckInsService } from "./check-ins.service.js";
import { GoogleSheetsOutboxModule } from "../google-sheets/google-sheets-outbox.module.js";

@Module({
  imports: [AdminAuthModule, FamilyBookingsModule, GoogleSheetsOutboxModule],
  controllers: [CheckInsController],
  providers: [CheckInsService],
  exports: [CheckInsService],
})
export class CheckInsModule {}
