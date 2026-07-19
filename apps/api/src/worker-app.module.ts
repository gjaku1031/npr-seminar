import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EnvironmentModule } from "./common/config/environment.module.js";
import { PrismaModule } from "./common/prisma/prisma.module.js";
import { GoogleSheetsWorkerModule } from "./modules/google-sheets/google-sheets-worker.module.js";
import { SmsWorkerModule } from "./modules/sms/sms-worker.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === "production",
    }),
    EnvironmentModule,
    PrismaModule,
    SmsWorkerModule,
    GoogleSheetsWorkerModule,
  ],
})
export class WorkerAppModule {}
