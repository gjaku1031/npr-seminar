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

type BranchCode = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
/** 세미나 생성 시 제목과 선택적 설명의 형식을 검증한다. */
class SeminarCreateDto {
  @IsString() @Length(1, 200) public title!: string;
  @IsOptional() @IsString() @Length(0, 5000) public description?: string | null;
}
/** 세미나 수정의 기대 버전과 변경할 필드의 형식을 검증한다. */
class SeminarUpdateDto {
  @IsInt() @Min(1) public expectedVersion!: number;
  @IsOptional() @IsString() @Length(1, 200) public title?: string;
  @IsOptional() @IsString() @Length(0, 5000) public description?: string | null;
  @IsOptional() @IsIn(["DRAFT", "PUBLISHED"]) public status?: string;
}
/** 보관 요청의 기대 버전과 사유 형식을 검증한다. */
class ArchiveDto {
  @IsInt() @Min(1) public expectedVersion!: number;
  @IsString() @Length(3, 500) public reason!: string;
}
/** 회차 생성 입력의 형식을 검증하며 범위·지점과 시간의 관계는 서비스에서 확인한다. */
class SessionCreateDto {
  @IsIn(["ALL", "BRANCH"]) public scope!: "ALL" | "BRANCH";
  @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C", null]) public branch!: BranchCode | null;
  @IsDateString() public startsAt!: string;
  @IsDateString() public endsAt!: string;
  @IsString() @Length(1, 300) public location!: string;
  @IsDateString() public bookingOpensAt!: string;
  @IsDateString() public bookingClosesAt!: string;
  @IsOptional() @IsBoolean() public guestBookingEnabled?: boolean;
}
/** 회차 수정의 기대 버전과 선택적 변경 필드의 형식을 검증한다. */
class SessionUpdateDto {
  @IsInt() @Min(1) public expectedVersion!: number;
  @IsOptional() @IsIn(["ALL", "BRANCH"]) public scope?: "ALL" | "BRANCH";
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C", null]) public branch?: BranchCode | null;
  @IsOptional() @IsDateString() public startsAt?: string;
  @IsOptional() @IsDateString() public endsAt?: string;
  @IsOptional() @IsString() @Length(1, 300) public location?: string;
  @IsOptional() @IsDateString() public bookingOpensAt?: string;
  @IsOptional() @IsDateString() public bookingClosesAt?: string;
  @IsOptional() @IsIn(["DRAFT", "OPEN", "CLOSED", "CANCELLED"]) public status?: string;
  @IsOptional() @IsBoolean() public guestBookingEnabled?: boolean;
}

/** 공개 회차 조회와 관리자 세미나·회차 요청을 {@link SeminarsService}에 전달한다. 변경 요청에는 세션·역할·CSRF 검사를 적용한다. */
@Controller("api/v1")
export class SeminarsController {
  public constructor(private readonly service: SeminarsService) {}

  /** 공개 가능한 회차를 조회한다. 지점을 지정하면 전체 지점 회차와 해당 지점 회차를 반환한다. */
  @Get("public/seminar-sessions")
  public publicSessions(@Query("branch") branch?: BranchCode) { return this.service.listPublic(branch); }

  /** 관리자에게 세미나 목록을 반환하며 상태 문자열은 서비스의 조회 조건으로 전달한다. */
  @Get("admin/seminars") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public list(@Query("status") status?: string) { return this.service.list(status); }

  /** 필수 멱등 키를 확인한 뒤 세미나를 생성한다. 키가 없으면 400을 반환한다. */
  @Post("admin/seminars") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public create(@Body() body: SeminarCreateDto, @Headers("idempotency-key") key?: string) {
    return this.service.create(body, this.key(key));
  }

  /** UUID로 관리자 세미나 상세를 조회한다. 존재하지 않으면 서비스에서 404를 반환한다. */
  @Get("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public get(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.get(id); }

  /** 기대 버전과 멱등 키를 서비스에 전달한다. 버전 충돌은 서비스에서 409로 처리한다. */
  @Patch("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public update(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SeminarUpdateDto, @Headers("idempotency-key") key?: string) {
    return this.service.update(id, body, this.key(key));
  }

  /** 사유와 기대 버전을 받아 세미나를 보관 처리한다. 멱등 키가 없으면 400을 반환한다. */
  @Delete("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public archive(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: ArchiveDto, @Headers("idempotency-key") key?: string) {
    return this.service.archive(id, body.expectedVersion, body.reason, this.key(key));
  }

  /** 세미나 회차와 예약 운영 요약을 반환한다. 세미나가 없으면 서비스에서 404를 반환한다. */
  @Get("admin/seminars/:seminarId/sessions") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public sessions(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.listSessions(id); }

  /** 회차 생성 요청과 게스트 예약 정책 감사에 쓸 관리자 식별자를 서비스에 전달한다. */
  @Post("admin/seminars/:seminarId/sessions") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public createSession(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SessionCreateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.createSession(id, body, this.key(key), actor.subject);
  }

  /** UUID로 관리자 회차 상세를 조회한다. 회차가 없으면 서비스에서 404를 반환한다. */
  @Get("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public getSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.getSession(id); }

  /** 회차 수정 요청과 관리자 식별자를 전달한다. 잠금과 버전 검사는 서비스에서 수행한다. */
  @Patch("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public updateSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SessionUpdateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.updateSession(id, body, this.key(key), actor.subject);
  }

  /** 예약 유무와 기대 버전을 검사하는 회차 보관 처리를 서비스에 위임한다. */
  @Delete("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public archiveSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: ArchiveDto, @Headers("idempotency-key") key?: string) {
    return this.service.archiveSession(id, body.expectedVersion, body.reason, this.key(key));
  }

  /** Idempotency-Key 헤더를 반환하며 없으면 {@link DomainError} 400을 던진다. */
  private key(value?: string): string {
    if (value === undefined) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
    return value;
  }
}
