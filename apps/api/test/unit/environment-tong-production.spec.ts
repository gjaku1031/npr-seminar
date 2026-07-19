import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type AppEnvironment, environmentProvider } from "../../src/common/config/environment.js";

describe("production Tong environment contract", () => {
  it("parses the exact deployed production wire JSON when the one-shot toggle confirms it", () => {
    const wire = readFileSync(resolve(import.meta.dirname, "../../../../ops/pve-release/tong-wire-contract.production.json"), "utf8").trim();
    const updates = {
      APP_ENV: "test", PROCESS_ROLE: "api", TONG_SYNC_ENABLED: "true", TONG_WIRE_CONTRACT_CONFIRMED: "true",
      TONG_WIRE_CONTRACT_JSON: wire, TONG_BASE_URL: "https://www9.hakwonsarang.co.kr",
      TONG_USERNAME: "fixture-user", TONG_PASSWORD: "fixture-password",
    } as const;
    const previous = Object.fromEntries(Object.keys(updates).map((key) => [key, process.env[key]]));
    try {
      Object.assign(process.env, updates);
      const environment = (environmentProvider.useFactory as () => AppEnvironment)();
      expect(environment).toMatchObject({
        tongSyncEnabled: true, tongWireContractConfirmed: true,
        tongBaseUrl: "https://www9.hakwonsarang.co.kr",
        tongWireContract: {
          login: { securityPath: "/mmsc/Login_security_Proc.asp", academyCode: "SE8A" },
          switchBranch: { path: "/mmsc/targetranch_proc.asp" },
          students: { pageSize: 5000, filterValue: "NN", maxPages: 100 },
          columns: { sourceUniqueNo: "고유번호", classRegistrationNo: "반등록번호" },
        },
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
});
