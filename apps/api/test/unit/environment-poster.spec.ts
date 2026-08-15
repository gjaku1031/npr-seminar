import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppEnvironment, environmentProvider } from "../../src/common/config/environment.js";

const keys = [
  "APP_ENV", "PROCESS_ROLE", "DATABASE_URL", "WORKER_DATABASE_URL", "REDIS_URL",
  "SESSION_SECRET", "PHONE_ENCRYPTION_KEY", "PHONE_HMAC_KEY", "OTP_PEPPER",
  "SCANNER_PAIRING_HMAC_KEY", "QR_ENCRYPTION_KEY", "PUBLIC_BASE_URL", "POSTER_STORAGE_DIR",
  "ALIGO_IDENTIFIER", "ALIGO_KEY", "SMS_ENABLED", "SMS_SENDER_SONGPA", "SMS_SENDER_WIRYE",
  "SMS_SENDER_GWANGJIN", "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT", "TONG_SYNC_ENABLED",
  "TONG_WIRE_CONTRACT_CONFIRMED", "TONG_WIRE_CONTRACT_JSON", "TONG_BASE_URL",
  "TONG_USERNAME", "TONG_PASSWORD",
] as const;

describe("poster storage environment boundary", () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of keys) previous.set(key, process.env[key]);
    for (const key of keys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

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
