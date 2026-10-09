import { Controller, Get, Headers, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { STUDENT_UNIT_GROUPS, type StudentUnitGroup } from "../student-sync/student-unit-group.js";
import { StudentsService } from "./students.service.js";

/**
 * 관리자 학생 목록 쿼리
 */
export class StudentListQuery {
  /**
   * 캠퍼스
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;

  /**
   * 이름·학교·학번 부분 검색어. 숫자 4자리면 연락처 끝 4자리도 검색
   */
  @IsOptional() @IsString() @MaxLength(100) public query?: string;

  /**
   * 학년 필터
   *
   * @deprecated unitGroup 사용. 기존 호출자를 위해 임시 유지
   */
  @IsOptional() @IsString() @MaxLength(40) public grade?: string;

  /**
   * 단위 그룹. 기본 ALL
   */
  @IsOptional() @IsIn(STUDENT_UNIT_GROUPS) public unitGroup: StudentUnitGroup = "ALL";

  /**
   * 대표 반 이름 일치
   */
  @IsOptional() @IsString() @MaxLength(100) public representativeClass?: string;

  /**
   * 수학 담임
   */
  @IsOptional() @IsString() @MaxLength(100) public teacherName?: string;

  /**
   * 단위 이름
   */
  @IsOptional() @IsString() @MaxLength(100) public unitName?: string;

  /**
   * 대표 반 판정 결과
   */
  @IsOptional() @IsIn(["REGULAR", "SCIENCE_ALIAS", "MULTIPLE_REGULAR", "NO_CLASS", "FUTURE_TERM_ONLY"]) public resolution?: string;

  /**
   * 원천 재원 여부. 문자열 true·false를 불리언으로 변환
   */
  @IsOptional() @Transform(({ value }) => value === "true" ? true : value === "false" ? false : value) @IsBoolean() public sourceActive?: boolean;

  /**
   * 수학·과학 반이 하나라도 있는 학생만. 문자열 true·false를 불리언으로 변환
   */
  @IsOptional() @Transform(({ value }) => value === "true" ? true : value === "false" ? false : value) @IsBoolean() public categorizedOnly?: boolean;

  /**
   * 예약 정보를 붙일 회차 ID
   */
  @IsOptional() @IsUUID("4") public seminarSessionId?: string;

  /**
   * 페이지 번호. 1부터
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;

  /**
   * 페이지 크기. 1~200, 기본 50
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

/**
 * 반 분류 검토 필요 학생 쿼리
 */
export class StudentReviewRequiredQuery {
  /**
   * 캠퍼스
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;

  /**
   * 페이지 번호
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;

  /**
   * 페이지 크기. 1~200
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

/**
 * 학생 변경 이력 커서 쿼리
 */
class HistoryQuery {
  /**
   * 이 순번 다음부터
   */
  @IsOptional() @Matches(/^\d+$/) public afterSequence?: string;

  /**
   * 조회 건수. 1~200
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

/**
 * 공개 학생 검색 쿼리
 */
class PublicStudentQuery {
  /**
   * 이름·학번 앞부분 검색어. 최대 80자
   */
  @IsOptional() @IsString() @MaxLength(80) public query?: string;

  /**
   * 캠퍼스. 예약 증명의 캠퍼스와 같아야 함
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;

  /**
   * 페이지 번호
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;

  /**
   * 페이지 크기
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

/**
 * 학생 조회 API
 *
 * 공개 검색은 예약 증명 헤더로, 관리자 조회는 세션·역할로 보호
 */
@Controller("api/v1")
export class StudentsController {
  /**
   * 학생 서비스 주입
   */
  public constructor(private readonly service: StudentsService) {}

  /**
   * 예약 증명 연락처와 일치하는 재원생 공개 검색
   */
  @Get("public/students")
  public publicSearch(@Headers("x-booking-proof") proof = "", @Query() query: PublicStudentQuery) { return this.service.publicSearch(proof, query); }

  /**
   * 관리자 학생 목록·요약·담임 목록
   */
  @Get("admin/students") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public list(@Query() query: StudentListQuery) { return this.service.list(query); }

  /**
   * 반 분류 검토 필요 학생 목록
   */
  @Get("admin/students/review-required") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public reviewRequired(@Query() query: StudentReviewRequiredQuery) { return this.service.reviewRequired(query); }

  /**
   * 학생 상세
   */
  @Get("admin/students/:studentId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public get(@Param("studentId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.get(id); }

  /**
   * 학생 변경 이력
   */
  @Get("admin/students/:studentId/history") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public history(@Param("studentId", new ParseUUIDPipe({ version: "4" })) id: string, @Query() query: HistoryQuery) {
    return this.service.history(id, query.afterSequence, query.limit);
  }
}
