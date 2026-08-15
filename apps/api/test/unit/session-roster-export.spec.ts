import { type INestApplication, StreamableFile } from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../../src/common/auth/roles.decorator.js";
import { RolesGuard } from "../../src/common/auth/roles.guard.js";
import { SessionGuard } from "../../src/common/auth/session.guard.js";
import { SessionRosterController } from "../../src/modules/family-bookings/session-roster.controller.js";
import {
  neutralizeSpreadsheetText,
  SessionRosterService,
} from "../../src/modules/family-bookings/session-roster.service.js";
import { SessionStatisticsService } from "../../src/modules/family-bookings/session-statistics.service.js";

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

    const exportXlsx = vi.fn().mockResolvedValue(Buffer.from("xlsx"));
    const controller = new SessionRosterController({
      exportXlsx,
    } as never, {} as never);
    const result = await controller.exportXlsx(
      "00000000-0000-4000-8000-000000000123",
      {
        branch: "CAMPUS_A",
        unitGroup: "HIGH",
        teacherName: "담임",
        query: "1234",
        page: 9,
        pageSize: 1,
      } as never,
    );
    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getHeaders()).toEqual({
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition:
        "attachment; filename=\"seminar-roster-00000000-0000-4000-8000-000000000123.xlsx\"; filename*=UTF-8''seminar-roster-00000000-0000-4000-8000-000000000123.xlsx",
      length: 4,
    });
    expect(exportXlsx).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000123", {
      branch: "CAMPUS_A",
      unitGroup: "HIGH",
      teacherName: "담임",
      query: "1234",
    });
  });

  it("sends XLSX bytes unchanged through the Nest HTTP adapter", async () => {
    const workbookBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x7f]);
    const exportXlsx = vi.fn().mockResolvedValue(workbookBytes);
    let app: INestApplication | undefined;

    try {
      const moduleReference = await Test.createTestingModule({
        controllers: [SessionRosterController],
        providers: [
          { provide: SessionRosterService, useValue: { exportXlsx } },
          { provide: SessionStatisticsService, useValue: {} },
        ],
      })
        .overrideGuard(SessionGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: () => true })
        .compile();
      app = moduleReference.createNestApplication();
      await app.listen(0, "127.0.0.1");

      const response = await fetch(
        `${await app.getUrl()}/api/v1/admin/seminar-sessions/00000000-0000-4000-8000-000000000123/roster.xlsx?unitGroup=ALL`,
      );
      const responseBytes = Buffer.from(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(response.headers.get("content-disposition")).toContain(
        "seminar-roster-00000000-0000-4000-8000-000000000123.xlsx",
      );
      expect(response.headers.get("content-length")).toBe(workbookBytes.byteLength.toString());
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(responseBytes).toEqual(workbookBytes);
      expect(response.headers.get("content-type")).not.toContain("application/json");
    } finally {
      await app?.close();
    }
  });
});
