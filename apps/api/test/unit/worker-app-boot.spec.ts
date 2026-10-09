import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetWorkerService } from "../../src/modules/google-sheets/sheet-worker.service.js";
import { SmsWorkerService } from "../../src/modules/sms/sms-worker.service.js";
import { WorkerAppModule } from "../../src/worker-app.module.js";

/**
 * 테스트가 지우고 복원하는 환경 변수
 *
 * 주의: ConfigModule은 NODE_ENV가 production이 아니면 `apps/api/.env`를 읽음(worker-app.module.ts)
 * vitest의 NODE_ENV는 test라 개발자 로컬 `.env`의 API 역할 값이 그대로 들어옴
 * 그 상태로 워커를 기동하면 environmentProvider의 역할 격리 검사(POSTER_STORAGE_DIR 등)에 걸려 실패함
 * 검사는 정상이며 환경을 덜 비운 테스트 문제이므로 워커가 받으면 안 되는 API 전용 키까지 모두 지움
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
  "SMS_SENDER_CAMPUS_A",
  "SMS_SENDER_CAMPUS_B",
  "SMS_SENDER_CAMPUS_C",
  "GOOGLE_SHEETS_ENABLED",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_APPLICATION_CREDENTIALS",
  // API 역할 전용. 워커 프로세스에 주입되면 안 되는 값
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

// 워커 애플리케이션 기동
describe("WorkerAppModule boot", () => {
  // 기동한 애플리케이션 컨텍스트
  let context: INestApplicationContext | undefined;

  // 테스트 전 환경 변수 값
  const originalEnvironment = new Map<string, string | undefined>();

  // 컨텍스트 종료와 환경 변수 복원
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

  // 연동을 끈 production 설정으로 기동·종료 성공
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
    // 죽여서 원인 메시지가 사라짐. 실패는 이 테스트의 실패로만 드러나야 함
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
