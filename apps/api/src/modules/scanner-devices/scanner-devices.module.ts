import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { ScannerDevicesController } from "./scanner-devices.controller.js";
import { ScannerDevicesService } from "./scanner-devices.service.js";

/**
 * 스캐너 기기 페어링·관리 모듈
 */
@Module({
  imports: [AdminAuthModule],
  controllers: [ScannerDevicesController],
  providers: [ScannerDevicesService],
})
export class ScannerDevicesModule {}
