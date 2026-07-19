import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EnvironmentModule } from "./common/config/environment.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { PrismaModule } from "./common/prisma/prisma.module.js";
import { StudentSyncModule } from "./modules/student-sync/student-sync.module.js";
import { RedisModule } from "./common/redis/redis.module.js";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module.js";
import { ScannerDevicesModule } from "./modules/scanner-devices/scanner-devices.module.js";
import { FamilyBookingsModule } from "./modules/family-bookings/family-bookings.module.js";
import { QrModule } from "./modules/qr/qr.module.js";
import { CheckInsModule } from "./modules/check-ins/check-ins.module.js";
import { IdempotencyModule } from "./common/idempotency/idempotency.module.js";
import { SeminarsModule } from "./modules/seminars/seminars.module.js";
import { StudentsModule } from "./modules/students/students.module.js";
import { SmsAdminModule } from "./modules/sms/sms-admin.module.js";
import { GoogleSheetsAdminModule } from "./modules/google-sheets/google-sheets-admin.module.js";
import { SurveysModule } from "./modules/surveys/surveys.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === "production",
    }),
    EnvironmentModule,
    IdempotencyModule,
    HealthModule,
    PrismaModule,
    StudentSyncModule,
    RedisModule,
    AdminAuthModule,
    ScannerDevicesModule,
    FamilyBookingsModule,
    QrModule,
    CheckInsModule,
    SeminarsModule,
    StudentsModule,
    SmsAdminModule,
    GoogleSheetsAdminModule,
    SurveysModule,
  ],
})
export class AppModule {}
