import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppEnvironment, environmentProvider } from "../../src/common/config/environment.js";

/**
 * 테스트 중 비우고 복원하는 환경 변수
 */
const keys = [
  "APP_ENV", "PROCESS_ROLE", "DATABASE_URL", "WORKER_DATABASE_URL", "REDIS_URL",
  "SESSION_SECRET", "PHONE_ENCRYPTION_KEY", "PHONE_HMAC_KEY", "OTP_PEPPER",
  "SCANNER_PAIRING_HMAC_KEY", "QR_ENCRYPTION_KEY", "PUBLIC_BASE_URL", "POSTER_STORAGE_DIR",
  "ALIGO_IDENTIFIER", "ALIGO_KEY", "SMS_ENABLED", "SMS_SENDER_CAMPUS_A", "SMS_SENDER_CAMPUS_B",
  "SMS_SENDER_CAMPUS_C", "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT", "TONG_SYNC_ENABLED",
  "TONG_WIRE_CONTRACT_CONFIRMED", "TONG_WIRE_CONTRACT_JSON", "TONG_BASE_URL",
  "TONG_USERNAME", "TONG_PASSWORD",
] as const;

// 포스터 저장소 설정의 프로세스 역할 경계
describe("poster storage environment boundary", () => {
  // 테스트 전 환경 변수 값
  const previous = new Map<string, string | undefined>();

  // 관련 환경 변수를 저장 후 모두 제거
  beforeEach(() => {
    for (const key of keys) previous.set(key, process.env[key]);
    for (const key of keys) delete process.env[key];
  });

  // 저장한 값으로 복원
  afterEach(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

  // production API는 포스터 저장 디렉터리가 절대 경로로 있어야 함
  it("requires an absolute poster directory for the production API", () => {
    Object.assign(process.env, {
      APP_ENV: "production",
      PROCESS_ROLE: "api",
      DATABASE_URL: "postgresql://api:api@127.0.0.1:5432/npr",
      REDIS_URL: "redis://127.0.0.1:6379/0",
      SESSION_SECRET: Buffer.alloc(32, 1).toString("base64"),
      PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
      PHONE_HMAC_KEY: Buffer.alloc(32, 3).toString("base64"),
      OTP_PEPPER: Buffer.alloc(32, 4).toString("base64"),
      SCANNER_PAIRING_HMAC_KEY: Buffer.alloc(32, 5).toString("base64"),
      QR_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"),
      PUBLIC_BASE_URL: "https://seminar.example.test",
    });
    expect(() => (environmentProvider.useFactory as () => AppEnvironment)()).toThrow("Production configuration is incomplete");

    process.env.POSTER_STORAGE_DIR = "/var/lib/npr-seminar/poster";
    expect((environmentProvider.useFactory as () => AppEnvironment)().posterStorageDir)
      .toBe("/var/lib/npr-seminar/poster");
    process.env.POSTER_STORAGE_DIR = "../posters";
    expect(() => (environmentProvider.useFactory as () => AppEnvironment)()).toThrow();
    process.env.POSTER_STORAGE_DIR = "/";
    expect(() => (environmentProvider.useFactory as () => AppEnvironment)()).toThrow();
  });

  // production 워커는 포스터 저장소가 필요 없고 주어지면 거부
  it("does not require or expose poster storage to the production worker", () => {
    Object.assign(process.env, {
      APP_ENV: "production",
      PROCESS_ROLE: "worker",
      WORKER_DATABASE_URL: "postgresql://worker:worker@127.0.0.1:5432/npr",
      PHONE_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
      PUBLIC_BASE_URL: "https://seminar.example.test",
    });
    expect((environmentProvider.useFactory as () => AppEnvironment)().posterStorageDir).toBeUndefined();
    process.env.POSTER_STORAGE_DIR = "/var/lib/npr-seminar/poster";
    expect(() => (environmentProvider.useFactory as () => AppEnvironment)())
      .toThrow("Poster storage is restricted to the HTTP API process");
  });
});
