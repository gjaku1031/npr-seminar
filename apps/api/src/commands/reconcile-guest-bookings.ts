import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { pathToFileURL } from "node:url";
import { EnvironmentModule } from "../common/config/environment.module.js";
import { PrismaModule } from "../common/prisma/prisma.module.js";
import { GuestBookingReconcilerService } from "../modules/student-sync/guest-booking-reconciler.service.js";

/**
 * 비재원생 예약을 재원생 예약으로 연결하는 작업만 1회 실행하는 명령 모듈
 *
 * 이 작업은 학생 동기화 끝에 자동으로 실행됨. 즉시 반영하려고 동기화 전체를 실행하면 통통통 로그인이 함께 일어나고,
 * 그 계정은 실패 재시도가 0회라 한 번 어긋나면 동기화 전체가 멈춰 사람이 직접 풀어야 함
 * 이 명령은 통통통에 접속하지 않고 DB의 학생 원장과 예약만 대조하므로 급할 때 안전하게 실행 가능
 *
 * 사용: node dist/commands/reconcile-guest-bookings.js. 결과 JSON 출력, 실패 시 종료 코드 1
 */
@Module({
  imports: [
    ConfigModule.forRoot({ cache: true, isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === "production" }),
    EnvironmentModule,
    PrismaModule,
  ],
  providers: [GuestBookingReconcilerService],
})
class ReconcileGuestBookingsModule {}

/**
 * 연결 작업 실행 후 결과 JSON 출력
 */
async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(ReconcileGuestBookingsModule, { logger: false });
  try {
    const result = await context.get(GuestBookingReconcilerService).reconcile("system:manual-reconcile");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
}

// 직접 실행할 때만 main 호출
const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "reconcile-guest-bookings failed"}\n`);
    process.exitCode = 1;
  });
}
