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
class SeminarCreateDto {
  @IsString() @Length(1, 200) public title!: string;
  @IsOptional() @IsString() @Length(0, 5000) public description?: string | null;
}
class SeminarUpdateDto {
  @IsInt() @Min(1) public expectedVersion!: number;
  @IsOptional() @IsString() @Length(1, 200) public title?: string;
  @IsOptional() @IsString() @Length(0, 5000) public description?: string | null;
  @IsOptional() @IsIn(["DRAFT", "PUBLISHED"]) public status?: string;
}
class ArchiveDto {
  @IsInt() @Min(1) public expectedVersion!: number;
  @IsString() @Length(3, 500) public reason!: string;
}
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

@Controller("api/v1")
export class SeminarsController {
  public constructor(private readonly service: SeminarsService) {}

  @Get("public/seminar-sessions")
  public publicSessions(@Query("branch") branch?: BranchCode) { return this.service.listPublic(branch); }

  @Get("admin/seminars") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public list(@Query("status") status?: string) { return this.service.list(status); }

  @Post("admin/seminars") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public create(@Body() body: SeminarCreateDto, @Headers("idempotency-key") key?: string) {
    return this.service.create(body, this.key(key));
  }

  @Get("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public get(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.get(id); }

  @Patch("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public update(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SeminarUpdateDto, @Headers("idempotency-key") key?: string) {
    return this.service.update(id, body, this.key(key));
  }

  @Delete("admin/seminars/:seminarId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public archive(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: ArchiveDto, @Headers("idempotency-key") key?: string) {
    return this.service.archive(id, body.expectedVersion, body.reason, this.key(key));
  }

  @Get("admin/seminars/:seminarId/sessions") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public sessions(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.listSessions(id); }

  @Post("admin/seminars/:seminarId/sessions") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public createSession(@Param("seminarId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SessionCreateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.createSession(id, body, this.key(key), actor.subject);
  }

  @Get("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public getSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.getSession(id); }

  @Patch("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public updateSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: SessionUpdateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.updateSession(id, body, this.key(key), actor.subject);
  }

  @Delete("admin/seminar-sessions/:sessionId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public archiveSession(@Param("sessionId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: ArchiveDto, @Headers("idempotency-key") key?: string) {
    return this.service.archiveSession(id, body.expectedVersion, body.reason, this.key(key));
  }

  private key(value?: string): string {
    if (value === undefined) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
    return value;
  }
}
