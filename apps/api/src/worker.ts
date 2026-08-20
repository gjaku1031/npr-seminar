import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerAppModule } from "./worker-app.module.js";
import { SmsWorkerService } from "./modules/sms/sms-worker.service.js";
import { SheetWorkerService } from "./modules/google-sheets/sheet-worker.service.js";

async function bootstrapWorker(): Promise<void> {
  const context = await NestFactory.createApplicationContext(WorkerAppModule, { bufferLogs: true });
  context.enableShutdownHooks();
  const worker = context.get(SmsWorkerService);
  const sheetWorker = context.get(SheetWorkerService);
  let running = true;
  const stop = () => { running = false; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  /**
   * 한 바퀴가 실패해도 워커는 계속 돈다.
   *
   * 예전에는 여기서 나온 오류가 그대로 프로세스를 죽였고 systemd 가 5초 뒤 다시 띄웠다.
   * 그런데 큐 워커에게 일시적 오류는 예외 상황이 아니라 일상이다 — DB 연결이 잠깐 모자라는
   * 것 하나로 프로세스가 죽으면, 죽는 동안 붙잡고 있던 작업의 리스가 만료되고 그 작업은
   * **보냈는지 알 수 없는 상태**로 남는다. 실제로 문자 77건이 그렇게 됐다.
   *
   * 되살릴 수 없는 오류(설정 누락 등)는 어차피 매 바퀴 같은 자리에서 실패하므로, 계속
   * 도는 것이 조용히 넘어가는 것과 다르지 않다 — 그래서 로그를 남긴다.
   */
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
      // 실패가 이어지면 물러선다 — 같은 오류로 초당 한 번씩 두드려 봐야 나아지지 않는다.
      await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 1_000 * consecutiveFailures)));
    }
  }
  await context.close();
}

void bootstrapWorker();
