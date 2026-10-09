import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { SeminarsService } from "./seminars.service.js";
import { CurrentActor } from "../../common/auth/current-actor.decorator.js";
import type { AuthenticatedActor } from "../../common/auth/authenticated-actor.js";

/**
 * 지점 코드
 */
type BranchCode = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

/**
 * 설명회 생성 본문
 */
class SeminarCreateDto {
  /**
   * 제목. 1~200자
   */
  @IsString() @Length(1, 200) public title!: string;

  /**
   * 설명. 0~5000자, null이면 없음
   */
  @IsOptional() @IsString() @Length(0, 5000) public description?: string | null;
}

/**
 * 설명회 변경 본문. 낙관적 잠금 버전 필수
 */
class SeminarUpdateDto {
  /**
   * 현재 버전. 1 이상
   */
  @IsInt() @Min(1) public expectedVersion!: number;

  /**
   * 제목
   */
  @IsOptional() @IsString() @Length(1, 200) public title?: string;

  /**
   * 설명. null이면 제거
   */
  @IsOptional() @IsString() @Length(0, 5000) public description?: string | null;

  /**
   * 공개 상태. DRAFT·PUBLISHED
   */
  @IsOptional() @IsIn(["DRAFT", "PUBLISHED"]) public status?: string;
}

/**
 * 보관 요청 본문
 */
class ArchiveDto {
  /**
   * 현재 버전
   */
  @IsInt() @Min(1) public expectedVersion!: number;

  /**
   * 사유. 3~500자
   */
  @IsString() @Length(3, 500) public reason!: string;
}

/**
 * 회차 생성 본문. 범위·지점·시각 관계는 서비스가 확인
 */
class SessionCreateDto {
  /**
   * 대상 범위. ALL 전 지점, BRANCH 한 지점
   */
  @IsIn(["ALL", "BRANCH"]) public scope!: "ALL" | "BRANCH";

  /**
   * 지점. BRANCH일 때만 지정, ALL이면 null
   */
  @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C", null]) public branch!: BranchCode | null;

  /**
   * 시작 시각
   */
  @IsDateString() public startsAt!: string;

  /**
   * 종료 시각
   */
  @IsDateString() public endsAt!: string;

  /**
   * 장소. 1~300자
   */
  @IsString() @Length(1, 300) public location!: string;

  /**
   * 예약 시작 시각
   */
  @IsDateString() public bookingOpensAt!: string;

  /**
   * 예약 마감 시각
   */
  @IsDateString() public bookingClosesAt!: string;

  /**
   * 비재원생 예약 허용 여부
   */
  @IsOptional() @IsBoolean() public guestBookingEnabled?: boolean;
}

/**
 * 회차 변경 본문. 낙관적 잠금 버전 필수, 나머지는 선택
 */
class SessionUpdateDto {
  /**
   * 현재 버전
   */
  @IsInt() @Min(1) public expectedVersion!: number;

  /**
   * 대상 범위
   */
  @IsOptional() @IsIn(["ALL", "BRANCH"]) public scope?: "ALL" | "BRANCH";

  /**
   * 지점
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C", null]) public branch?: BranchCode | null;

  /**
   * 시작 시각
   */
  @IsOptional() @IsDateString() public startsAt?: string;

  /**
   * 종료 시각
   */
  @IsOptional() @IsDateString() public endsAt?: string;

  /**
   * 장소
   */
  @IsOptional() @IsString() @Length(1, 300) public location?: string;

  /**
   * 예약 시작 시각
   */
  @IsOptional() @IsDateString() public bookingOpensAt?: string;

  /**
   * 예약 마감 시각
   */
  @IsOptional() @IsDateString() public bookingClosesAt?: string;

  /**
   * 회차 상태
   */
  @IsOptional() @IsIn(["DRAFT", "OPEN", "CLOSED", "CANCELLED"]) public status?: string;

  /**
   * 비재원생 예약 허용 여부
   */
  @IsOptional() @IsBoolean() public guestBookingEnabled?: boolean;
}

/**
 * 설명회·회차 API
 *
 * 공개 회차 조회와 관리자 설명회·회차 관리. 관리자 변경 요청은 세션·역할·CSRF·Idempotency-Key 필요
 */
@Controller("api/v1")
export class SeminarsController {
  /**
   * 설명회 서비스 주입
   */
  public constructor(private readonly service: SeminarsService) {}

  /**
   * 공개 회차 조회. 지점을 지정하면 전 지점 회차와 해당 지점 회차 반환
   */
  @Get("public/seminar-sessions")
  public publicSessions(@Query("branch") branch?: BranchCode) { return this.service.listPublic(branch); }

  /**
   * 관리자 설명회 목록
   */
  @Get("admin/seminars") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public list(@Query("status") status?: string) { return this.service.list(status); }

  /**
   * 설명회 생성
   */
  @Post("admin/seminars") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public create(@Body() body: SeminarCreateDto, @Headers("idempotency-key") key?: string) {
    return this.service.create(body, this.key(key));
  }

  /**
   * 설명회 상세
   */
  @Get("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public get(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.get(id); }

  /**
   * 설명회 변경. 버전 충돌은 409
   */
  @Patch("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public update(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SeminarUpdateDto, @Headers("idempotency-key") key?: string) {
    return this.service.update(id, body, this.key(key));
  }

  /**
   * 설명회 보관
   */
  @Delete("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public archive(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: ArchiveDto, @Headers("idempotency-key") key?: string) {
    return this.service.archive(id, body.expectedVersion, body.reason, this.key(key));
  }

  /**
   * 설명회의 회차와 예약 운영 요약
   */
  @Get("admin/seminars/:seminarId/sessions") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public sessions(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.listSessions(id); }

  /**
   * 회차 생성. 비재원생 예약 정책 감사에 관리자 식별자 전달
   */
  @Post("admin/seminars/:seminarId/sessions") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public createSession(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SessionCreateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.createSession(id, body, this.key(key), actor.subject);
  }

  /**
   * 회차 상세
   */
  @Get("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public getSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.getSession(id); }

  /**
   * 회차 변경. 잠금·버전 검사는 서비스가 수행
   */
  @Patch("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public updateSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SessionUpdateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.updateSession(id, body, this.key(key), actor.subject);
  }

  /**
   * 회차 보관. 예약 유무·버전은 서비스가 검사
   */
  @Delete("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public archiveSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: ArchiveDto, @Headers("idempotency-key") key?: string) {
    return this.service.archiveSession(id, body.expectedVersion, body.reason, this.key(key));
  }

  /**
   * Idempotency-Key 헤더 필수 확인. 길이는 IdempotencyService가 검사
   *
   * @throws {DomainError} 400 IDEMPOTENCY_KEY_REQUIRED
   */
  private key(value?: string): string {
    if (value === undefined) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
    return value;
  }
}
