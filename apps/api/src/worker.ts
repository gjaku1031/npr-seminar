import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerAppModule } from "./worker-app.module.js";
import { SmsWorkerService } from "./modules/sms/sms-worker.service.js";
import { SheetWorkerService } from "./modules/google-sheets/sheet-worker.service.js";

/**
 * 문자·시트 발송 워커 프로세스 기동과 반복 실행
 *
 * SIGINT·SIGTERM을 받으면 현재 반복을 마친 뒤 종료
 * 처리한 작업이 없으면 1초 대기, 실패가 이어지면 1초씩 늘려 최대 30초 대기
 */
async function bootstrapWorker(): Promise<void> {
  const context = await NestFactory.createApplicationContext(WorkerAppModule, { bufferLogs: true });
  context.enableShutdownHooks();
  const worker = context.get(SmsWorkerService);
  const sheetWorker = context.get(SheetWorkerService);
  // 종료 신호 수신 시 다음 반복부터 멈춤
  let running = true;
  const stop = () => { running = false; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  // 한 번의 반복이 실패해도 워커는 계속 실행함
  // 큐 워커에게 일시적 오류는 일상임. DB 연결 부족만으로 프로세스가 죽으면 잡고 있던 작업의 리스가 만료되어
  // 발송 여부를 알 수 없는 상태로 남음(문자 77건 사례)
  // 설정 누락처럼 복구되지 않는 오류는 매번 같은 자리에서 실패하므로 계속 실행하되 로그를 남김
  let consecutiveFailures = 0;
  while (running) {
    try {
      const [smsProcessed, sheetProcessed] = await Promise.all([worker.runOnce(), sheetWorker.runOnce()]);
      consecutiveFailures = 0;
      const processed = smsProcessed + sheetProcessed;
      if (processed === 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
    } catch (error) {
      consecutiveFailures += 1;
      process.stderr.write(`worker iteration failed (${consecutiveFailures}): ${error instanceof Error ? error.message : "unknown"}\n`);
      // 연속 실패 시 대기를 늘림. 같은 오류로 초당 재시도해도 나아지지 않음
      // 실패가 이어지면 물러섬 — 같은 오류로 초당 한 번씩 두드려 봐야 나아지지 않음
      await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 1_000 * consecutiveFailures)));
    }
  }
  await context.close();
}

void bootstrapWorker();
