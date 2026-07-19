import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { STUDENT_UNIT_GROUPS } from "../student-sync/student-unit-group.js";
import { SessionRosterService, type RosterUnitGroup } from "./session-roster.service.js";
import { SessionStatisticsService } from "./session-statistics.service.js";

class SessionRosterQuery {
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;
  @IsOptional() @IsIn(STUDENT_UNIT_GROUPS) public unitGroup: RosterUnitGroup = "ALL";
  @IsOptional() @IsString() @MaxLength(100) public teacherName?: string;
  @IsOptional() @IsString() @MaxLength(100) public query?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

class SessionStatisticsQuery {
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;
}

@Controller("api/v1/admin/seminar-sessions/:sessionId")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class SessionRosterController {
  public constructor(
    private readonly service: SessionRosterService,
    private readonly statisticsService: SessionStatisticsService,
  ) {}

  @Get("roster")
  @SensitiveResponse()
  public list(
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
    @Query() query: SessionRosterQuery,
  ) {
    return this.service.list(sessionId, query);
  }

  @Get("roster.xlsx")
  @SensitiveResponse()
  public async exportXlsx(
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
    @Query() query: SessionRosterQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.exportXlsx(sessionId, {
      ...(query.branch === undefined ? {} : { branch: query.branch }),
      unitGroup: query.unitGroup,
      ...(query.teacherName === undefined ? {} : { teacherName: query.teacherName }),
      ...(query.query === undefined ? {} : { query: query.query }),
    });
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="seminar-roster-${sessionId}.xlsx"; filename*=UTF-8''seminar-roster-${sessionId}.xlsx`,
    );
    response.setHeader("Content-Length", file.byteLength.toString());
    return file;
  }

  @Get("operations-summary")
  public operationsSummary(
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
  ) {
    return this.statisticsService.operationsSummary(sessionId);
  }

  @Get("statistics")
  public statistics(
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
    @Query() query: SessionStatisticsQuery,
  ) {
    return this.statisticsService.statistics(sessionId, query.branch);
  }
}
