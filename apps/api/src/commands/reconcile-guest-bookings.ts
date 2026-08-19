import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { pathToFileURL } from "node:url";
import { EnvironmentModule } from "../common/config/environment.module.js";
import { PrismaModule } from "../common/prisma/prisma.module.js";
import { GuestBookingReconcilerService } from "../modules/student-sync/guest-booking-reconciler.service.js";

/**
 * 비재원 예약을 재원생 예약으로 잇는 작업만 한 번 돌린다.
 *
 * 왜 따로 두는가: 이 작업은 매일 학생 동기화 끝에 자동으로 돈다. 그런데 지금 당장
 * 반영하고 싶을 때 동기화를 통째로 부르면 **통통통 로그인이 따라온다**. 그 계정은 실패
 * 재시도가 0회라 한 번 어긋나면 동기화 전체가 멈추고 사람이 직접 로그인해 풀어야 한다.
 *
 * 이 명령은 통통통에 닿지 않는다 — 이미 DB 에 있는 학생 원장과 예약만 대조한다.
 * 그래서 급할 때 안전하게 부를 수 있다.
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

async function main(): Promise<void> {
  const context = await NestFactory.createApplicationContext(ReconcileGuestBookingsModule, { logger: false });
  try {
    const result = await context.get(GuestBookingReconcilerService).reconcile("system:manual-reconcile");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await context.close();
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "reconcile-guest-bookings failed"}\n`);
    process.exitCode = 1;
  });
}
