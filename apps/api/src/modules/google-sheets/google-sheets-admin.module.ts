import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SheetAdminController } from "./sheet-admin.controller.js";
import { SheetAdminService } from "./sheet-admin.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [SheetAdminController],
  providers: [SheetAdminService],
})
export class GoogleSheetsAdminModule {}
