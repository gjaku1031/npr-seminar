import { afterEach, describe, expect, it } from "vitest";
import { type AppEnvironment, environmentProvider } from "../../src/common/config/environment.js";

/**
 * 테스트 중 바꾸고 복원하는 환경 변수
 */
const managedKeys = [
  "APP_ENV",
  "PROCESS_ROLE",
  "GOOGLE_SHEETS_ENABLED",
  "GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT",
] as const;

// 개발 환경 공개 편집 시트 허용 설정
describe("Google Sheets public-writer development override environment", () => {
  // 테스트 전 환경 변수 값
  const previous = new Map<string, string | undefined>();

  // 바꾼 환경 변수 복원
  afterEach(() => {
    for (const key of managedKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

  /**
   * 지정한 허용 값과 프로세스 역할로 실행 환경 생성
   * @param value 허용 설정. 생략하면 환경 변수 제거
   * @param processRole 기본 worker
   */
  function parse(value?: "true" | "false", processRole: "api" | "worker" = "worker"): AppEnvironment {
    for (const key of managedKeys) previous.set(key, process.env[key]);
    Object.assign(process.env, {
      APP_ENV: "test",
      PROCESS_ROLE: processRole,
      GOOGLE_SHEETS_ENABLED: "false",
    });
    if (value === undefined) delete process.env.GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT;
    else process.env.GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT = value;
    return (environmentProvider.useFactory as () => AppEnvironment)();
  }

  // 설정이 없으면 false
  it("defaults to false", () => {
    expect(parse().googleSheetsAllowPublicWriterInDevelopment).toBe(false);
  });

  // 워커에서 명시한 true를 그대로 읽음
  it("parses the explicit worker opt-in", () => {
    expect(parse("true").googleSheetsAllowPublicWriterInDevelopment).toBe(true);
  });

  // API 프로세스에 true를 주면 기동 실패
  it("rejects the opt-in in the HTTP API process", () => {
    expect(() => parse("true", "api")).toThrow(
      "The Google Sheets public-writer development override is restricted to the isolated worker",
    );
  });
});
