import { Module } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DisabledTongTongTongGateway } from "./disabled-tongtontong.gateway.js";
import { HttpTongTongTongGateway } from "./http-tongtontong.gateway.js";
import { OfflineSnapshotParser } from "./offline-snapshot.parser.js";
import { OfflineSnapshotService } from "./offline-snapshot.service.js";
import { StudentSyncAdminService } from "./student-sync-admin.service.js";
import { StudentSyncController } from "./student-sync.controller.js";
import { StudentNormalizerService } from "./student-normalizer.service.js";
import { StudentPromotionService } from "./student-promotion.service.js";
import { StudentSyncOrchestratorService } from "./student-sync-orchestrator.service.js";
import { StudentSyncScheduler } from "./student-sync.scheduler.js";
import { TongTongTongGateway } from "./tongtontong.gateway.js";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import type { AppEnvironment } from "../../common/config/environment.js";

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
    StudentSyncOrchestratorService, StudentSyncScheduler, StudentSyncAdminService,
  ],
  exports: [TongTongTongGateway, OfflineSnapshotParser, OfflineSnapshotService, StudentSyncOrchestratorService],
})
export class StudentSyncModule {}
