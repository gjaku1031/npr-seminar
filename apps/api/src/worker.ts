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
  while (running) {
    const [smsProcessed, sheetProcessed] = await Promise.all([worker.runOnce(), sheetWorker.runOnce()]);
    const processed = smsProcessed + sheetProcessed;
    if (processed === 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  await context.close();
}

void bootstrapWorker();
