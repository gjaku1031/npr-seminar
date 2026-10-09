import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { STUDENT_UNIT_GROUPS } from "../student-sync/student-unit-group.js";
import { SessionRosterService, type RosterUnitGroup } from "./session-roster.service.js";
import { SessionStatisticsService } from "./session-statistics.service.js";

/**
 * 회차 명단 쿼리
 */
class SessionRosterQuery {
  /**
   * 캠퍼스
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;

  /**
   * 단위 그룹. 기본 ALL
   */
  @IsOptional() @IsIn(STUDENT_UNIT_GROUPS) public unitGroup: RosterUnitGroup = "ALL";

  /**
   * 수학 담임
   */
  @IsOptional() @IsString() @MaxLength(100) public teacherName?: string;

  /**
   * 이름·학교·학번 검색어
   */
  @IsOptional() @IsString() @MaxLength(100) public query?: string;

  /**
   * 페이지 번호
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;

  /**
   * 페이지 크기. 1~200, 기본 50
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

/**
 * 회차 통계 쿼리
 */
class SessionStatisticsQuery {
  /**
   * 캠퍼스. 생략하면 전체
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;
}

/**
 * 관리자 회차 명단·통계 API
 */
@Controller("api/v1/admin/seminar-sessions/:sessionId")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class SessionRosterController {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 명단 서비스
     */
    private readonly service: SessionRosterService,

    /**
     * 통계 서비스
     */
    private readonly statisticsService: SessionStatisticsService,
  ) {}

  /**
   * 회차 예약 명단
   */
  @Get("roster")
  @SensitiveResponse()
  public list(
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
    @Query() query: SessionRosterQuery,
  ) {
    return this.service.list(sessionId, query);
  }

  /**
   * 회차 명단 엑셀 내려받기. 페이지 없이 필터 결과 전체
   */
  @Get("roster.xlsx")
  @SensitiveResponse()
  public async exportXlsx(
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
    @Query() query: SessionRosterQuery,
  ) {
    const file = await this.service.exportXlsx(sessionId, {
      ...(query.branch === undefined ? {} : { branch: query.branch }),
      unitGroup: query.unitGroup,
      ...(query.teacherName === undefined ? {} : { teacherName: query.teacherName }),
      ...(query.query === undefined ? {} : { query: query.query }),
    });
    const filename = `seminar-roster-${sessionId}.xlsx`;
    return new StreamableFile(file, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
      length: file.byteLength,
    });
  }

  /**
   * 회차 운영 요약
   */
  @Get("operations-summary")
  public operationsSummary(
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
  ) {
    return this.statisticsService.operationsSummary(sessionId);
  }

  /**
   * 회차 통계
   */
  @Get("statistics")
  public statistics(
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
    @Query() query: SessionStatisticsQuery,
  ) {
    return this.statisticsService.statistics(sessionId, query.branch);
  }
}
