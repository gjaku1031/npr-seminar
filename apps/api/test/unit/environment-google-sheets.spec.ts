import { afterEach, describe, expect, it } from "vitest";
import { type AppEnvironment, environmentProvider } from "../../src/common/config/environment.js";

const managedKeys = [
  "APP_ENV",
  "PROCESS_ROLE",
  "GOOGLE_SHEETS_ENABLED",
  "GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT",
] as const;

describe("Google Sheets public-writer development override environment", () => {
  const previous = new Map<string, string | undefined>();

  afterEach(() => {
    for (const key of managedKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

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

  it("defaults to false", () => {
    expect(parse().googleSheetsAllowPublicWriterInDevelopment).toBe(false);
  });

  it("parses the explicit worker opt-in", () => {
    expect(parse("true").googleSheetsAllowPublicWriterInDevelopment).toBe(true);
  });

  it("rejects the opt-in in the HTTP API process", () => {
    expect(() => parse("true", "api")).toThrow(
      "The Google Sheets public-writer development override is restricted to the isolated worker",
    );
  });
});
