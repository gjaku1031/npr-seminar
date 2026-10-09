import { Module } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DisabledTongTongTongGateway } from "./disabled-tongtontong.gateway.js";
import { HttpTongTongTongGateway } from "./http-tongtontong.gateway.js";
import { OfflineSnapshotParser } from "./offline-snapshot.parser.js";
import { OfflineSnapshotService } from "./offline-snapshot.service.js";
import { StudentSyncAdminService } from "./student-sync-admin.service.js";
import { StudentSyncController } from "./student-sync.controller.js";
import { StudentNormalizerService } from "./student-normalizer.service.js";
import { GuestBookingReconcilerService } from "./guest-booking-reconciler.service.js";
import { StudentPromotionService } from "./student-promotion.service.js";
import { StudentSyncOrchestratorService } from "./student-sync-orchestrator.service.js";
import { StudentSyncScheduler } from "./student-sync.scheduler.js";
import { TongTongTongGateway } from "./tongtontong.gateway.js";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import type { AppEnvironment } from "../../common/config/environment.js";

/**
 * 학생 동기화 모듈
 *
 * 통통통 연동 사용 설정이면 HTTP 게이트웨이, 아니면 비활성 게이트웨이를 TongTongTongGateway로 제공
 * 테스트에서 교체할 수 있도록 fetch를 TONG_HTTP_FETCH로 주입
 */
@Module({
  imports: [AdminAuthModule],
  controllers: [StudentSyncController],
  providers: [
    PhoneProtector, DisabledTongTongTongGateway, HttpTongTongTongGateway,
    { provide: "TONG_HTTP_FETCH", useValue: globalThis.fetch.bind(globalThis) },
    {
      provide: TongTongTongGateway,
      inject: ["APP_ENVIRONMENT", DisabledTongTongTongGateway, HttpTongTongTongGateway],
      useFactory: (environment: AppEnvironment, disabled: DisabledTongTongTongGateway, http: HttpTongTongTongGateway) =>
        environment.tongSyncEnabled ? http : disabled,
    },
    OfflineSnapshotParser, OfflineSnapshotService, StudentNormalizerService, StudentPromotionService,
    GuestBookingReconcilerService,
    StudentSyncOrchestratorService, StudentSyncScheduler, StudentSyncAdminService,
  ],
  exports: [TongTongTongGateway, OfflineSnapshotParser, OfflineSnapshotService, StudentSyncOrchestratorService],
})
export class StudentSyncModule {}
