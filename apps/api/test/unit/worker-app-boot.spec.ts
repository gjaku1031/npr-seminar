import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetWorkerService } from "../../src/modules/google-sheets/sheet-worker.service.js";
import { SmsWorkerService } from "../../src/modules/sms/sms-worker.service.js";
import { WorkerAppModule } from "../../src/worker-app.module.js";

/**
 * 이 테스트가 지우고 복원하는 env 키.
 *
 * ⚠️ ConfigModule 은 NODE_ENV 가 production 이 아닐 때 `apps/api/.env` 를 읽는다(worker-app.module.ts).
 * vitest 의 NODE_ENV 는 test 이므로, 개발자 로컬 `.env` 의 **api 역할** 값이 그대로 새어 들어온다.
 * 그 상태로 worker 를 부팅하면 environmentProvider 의 역할 격리 검사(POSTER_STORAGE_DIR 등)에
 * 걸려 실패한다 — 검사 자체는 정상 동작이고, 테스트가 환경을 충분히 비우지 않은 것이다.
 * 따라서 worker 가 받아서는 안 되는 api 전용 키까지 전부 여기서 지운다.
 */
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
  // ── api 역할 전용 — worker 프로세스에 주입되면 안 되는 값들 ──
  "POSTER_STORAGE_DIR",
  "GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT",
  "REDIS_URL",
  "SESSION_SECRET",
  "PHONE_HMAC_KEY",
  "OTP_PEPPER",
  "SCANNER_PAIRING_HMAC_KEY",
  "QR_ENCRYPTION_KEY",
  "TONG_WIRE_CONTRACT_CONFIRMED",
  "TONG_WIRE_CONTRACT_JSON",
  "TONG_BASE_URL",
  "TONG_USERNAME",
  "TONG_PASSWORD",
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

    // abortOnError: false — 기본값이면 부팅 실패가 process.abort() 로 vitest worker 를 통째로
    // 죽여서 원인 메시지가 사라진다. 실패는 이 테스트의 실패로만 드러나야 한다.
    context = await NestFactory.createApplicationContext(WorkerAppModule, {
      abortOnError: false,
      logger: false,
    });

    expect(context.get(SmsWorkerService)).toBeInstanceOf(SmsWorkerService);
    expect(context.get(SheetWorkerService)).toBeInstanceOf(SheetWorkerService);
    expect(fetchSpy).not.toHaveBeenCalled();
    await context.close();
    context = undefined;
  });
});
