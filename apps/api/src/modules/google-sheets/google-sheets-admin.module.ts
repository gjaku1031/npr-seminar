import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SheetAdminController } from "./sheet-admin.controller.js";
import { SheetAdminService } from "./sheet-admin.service.js";

/**
 * 관리자 시트 반영 상태 조회 모듈. API 프로세스용
 */
@Module({
  imports: [AdminAuthModule],
  controllers: [SheetAdminController],
  providers: [SheetAdminService],
})
export class GoogleSheetsAdminModule {}
