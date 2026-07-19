import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../../src/common/auth/roles.decorator.js";
import { RolesGuard } from "../../src/common/auth/roles.guard.js";
import { SessionGuard } from "../../src/common/auth/session.guard.js";
import { SessionRosterController } from "../../src/modules/family-bookings/session-roster.controller.js";
import { neutralizeSpreadsheetText } from "../../src/modules/family-bookings/session-roster.service.js";

describe("session roster spreadsheet safety", () => {
  it("neutralizes formula-triggering values even after leading whitespace and preserves ordinary text", () => {
    for (const value of ["=1+1", "+SUM(A1:A2)", "-2+3", "@HYPERLINK(\"https://example.test\")", "\t=cmd"] as const) {
      expect(neutralizeSpreadsheetText(value)).toBe(`'${value}`);
    }
    expect(neutralizeSpreadsheetText("학생 = 1")).toBe("학생 = 1");
    expect(neutralizeSpreadsheetText("01012345678")).toBe("01012345678");
    expect(neutralizeSpreadsheetText(null)).toBe("");
  });

  it("protects the session endpoints and emits the XLSX download headers", async () => {
    expect(Reflect.getMetadata(ROLES_KEY, SessionRosterController)).toEqual(["ADMIN"]);
    expect(Reflect.getMetadata(GUARDS_METADATA, SessionRosterController)).toEqual([SessionGuard, RolesGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, SessionRosterController.prototype.exportXlsx)).toBe("roster.xlsx");
    expect(Reflect.getMetadata(PATH_METADATA, SessionRosterController.prototype.operationsSummary)).toBe("operations-summary");
    expect(Reflect.getMetadata(PATH_METADATA, SessionRosterController.prototype.statistics)).toBe("statistics");

    const headers = new Map<string, string>();
    const exportXlsx = vi.fn().mockResolvedValue(Buffer.from("xlsx"));
    const controller = new SessionRosterController({
      exportXlsx,
    } as never, {} as never);
    const result = await controller.exportXlsx(
      "00000000-0000-4000-8000-000000000123",
      {
        branch: "SONGPA",
        unitGroup: "HIGH",
        teacherName: "담임",
        query: "1234",
        page: 9,
        pageSize: 1,
      } as never,
      { setHeader: (name: string, value: string) => headers.set(name, value) } as never,
    );
    expect(result.toString()).toBe("xlsx");
    expect(exportXlsx).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000123", {
      branch: "SONGPA",
      unitGroup: "HIGH",
      teacherName: "담임",
      query: "1234",
    });
    expect(headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(headers.get("Content-Disposition")).toContain("seminar-roster-00000000-0000-4000-8000-000000000123.xlsx");
    expect(headers.get("Content-Length")).toBe("4");
  });
});
