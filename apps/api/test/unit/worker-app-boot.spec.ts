import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetWorkerService } from "../../src/modules/google-sheets/sheet-worker.service.js";
import { SmsWorkerService } from "../../src/modules/sms/sms-worker.service.js";
import { WorkerAppModule } from "../../src/worker-app.module.js";

const environmentKeys = [
  "APP_ENV",
  "PROCESS_ROLE",
  "DATABASE_URL",
  "WORKER_DATABASE_URL",
  "PHONE_ENCRYPTION_KEY",
  "PUBLIC_BASE_URL",
  "SMS_ENABLED",
  "SMS_RECIPIENT_ALLOWLIST_ENABLED",
  "SMS_TEST_RECIPIENTS",
  "ALIGO_IDENTIFIER",
  "ALIGO_KEY",
  "SMS_SENDER_SONGPA",
  "SMS_SENDER_WIRYE",
  "SMS_SENDER_GWANGJIN",
  "GOOGLE_SHEETS_ENABLED",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
] as const;

describe("WorkerAppModule boot", () => {
  let context: INestApplicationContext | undefined;
  const originalEnvironment = new Map<string, string | undefined>();

  afterEach(async () => {
    if (context !== undefined) await context.close();
    context = undefined;
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnvironment.clear();
    vi.restoreAllMocks();
  });

  it("boots and closes in production with disabled provider integrations", async () => {
    for (const key of environmentKeys) originalEnvironment.set(key, process.env[key]);
    for (const key of environmentKeys) delete process.env[key];
    Object.assign(process.env, {
      APP_ENV: "production",
      PROCESS_ROLE: "worker",
      WORKER_DATABASE_URL: "postgresql://worker:worker@127.0.0.1:9/npr_worker",
      PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      PUBLIC_BASE_URL: "https://seminar.example.test",
      SMS_ENABLED: "false",
      SMS_RECIPIENT_ALLOWLIST_ENABLED: "true",
      SMS_TEST_RECIPIENTS: "",
      GOOGLE_SHEETS_ENABLED: "false",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    context = await NestFactory.createApplicationContext(WorkerAppModule, { logger: false });

    expect(context.get(SmsWorkerService)).toBeInstanceOf(SmsWorkerService);
    expect(context.get(SheetWorkerService)).toBeInstanceOf(SheetWorkerService);
    expect(fetchSpy).not.toHaveBeenCalled();
    await context.close();
    context = undefined;
  });
});
