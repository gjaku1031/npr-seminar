import { Controller, Get, Headers, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { STUDENT_UNIT_GROUPS, type StudentUnitGroup } from "../student-sync/student-unit-group.js";
import { StudentsService } from "./students.service.js";

export class StudentListQuery {
  @IsOptional() @IsIn(["SONGPA", "WIRYE", "GWANGJIN"]) public branch?: string;
  @IsOptional() @IsString() @MaxLength(100) public query?: string;
  /** @deprecated Use unitGroup. Retained temporarily for existing callers. */
  @IsOptional() @IsString() @MaxLength(40) public grade?: string;
  @IsOptional() @IsIn(STUDENT_UNIT_GROUPS) public unitGroup: StudentUnitGroup = "ALL";
  @IsOptional() @IsString() @MaxLength(100) public representativeClass?: string;
  @IsOptional() @IsString() @MaxLength(100) public teacherName?: string;
  @IsOptional() @IsString() @MaxLength(100) public unitName?: string;
  @IsOptional() @IsIn(["REGULAR", "SCIENCE_ALIAS", "MULTIPLE_REGULAR", "NO_CLASS", "FUTURE_TERM_ONLY"]) public resolution?: string;
  @IsOptional() @Transform(({ value }) => value === "true" ? true : value === "false" ? false : value) @IsBoolean() public sourceActive?: boolean;
  @IsOptional() @Transform(({ value }) => value === "true" ? true : value === "false" ? false : value) @IsBoolean() public categorizedOnly?: boolean;
  @IsOptional() @IsUUID("4") public seminarSessionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}
export class StudentReviewRequiredQuery {
  @IsOptional() @IsIn(["SONGPA", "WIRYE", "GWANGJIN"]) public branch?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}
class HistoryQuery {
  @IsOptional() @Matches(/^\d+$/) public afterSequence?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}
class PublicStudentQuery {
  @IsOptional() @IsString() @MaxLength(80) public query?: string;
  @IsOptional() @IsIn(["SONGPA", "WIRYE", "GWANGJIN"]) public branch?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

@Controller("api/v1")
export class StudentsController {
  public constructor(private readonly service: StudentsService) {}

  @Get("public/students")
  public publicSearch(@Headers("x-booking-proof") proof = "", @Query() query: PublicStudentQuery) { return this.service.publicSearch(proof, query); }

  @Get("admin/students") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public list(@Query() query: StudentListQuery) { return this.service.list(query); }

  @Get("admin/students/review-required") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public reviewRequired(@Query() query: StudentReviewRequiredQuery) { return this.service.reviewRequired(query); }

  @Get("admin/students/:studentId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public get(@Param("studentId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.get(id); }

  @Get("admin/students/:studentId/history") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public history(@Param("studentId", new ParseUUIDPipe({ version: "4" })) id: string, @Query() query: HistoryQuery) {
    return this.service.history(id, query.afterSequence, query.limit);
  }
}
