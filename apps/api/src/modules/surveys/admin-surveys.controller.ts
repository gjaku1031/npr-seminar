import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { SurveysService } from "./surveys.service.js";

class SurveyListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

@Controller("api/v1/admin/seminar-sessions/:seminarSessionId/survey-responses")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class AdminSurveysController {
  public constructor(private readonly service: SurveysService) {}

  @Get()
  @SensitiveResponse()
  public list(
    @Param("seminarSessionId", new ParseUUIDPipe({ version: "4" })) seminarSessionId: string,
    @Query() query: SurveyListQuery,
  ) { return this.service.listSession(seminarSessionId, query.page, query.pageSize); }
}
