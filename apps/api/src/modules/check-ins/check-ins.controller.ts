import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { IsString, IsUUID, Length } from "class-validator";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { CurrentActor } from "../../common/auth/current-actor.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import type { AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { CheckInsService, MAX_ATTENDED_COUNT } from "./check-ins.service.js";

/**
 * 실제 입장 인원. 스캐너 컨텍스트(기기·세션·게이트)와 달리 이 값은 **현장 스태프의 답변**이라
 * 클라이언트가 보낸다. 생략하면 서버가 PARTY_SELECTION_REQUIRED 로 되묻고 예약을 건드리지 않는다.
 *
 * 예약 인원과 무관하다 — 1명 예약에 두 분이 오기도 한다. 상한은 숫자패드 오타만 막는다.
 */
class QrCheckInDto {
  @IsString() @Length(43, 512) public qrToken!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_ATTENDED_COUNT) public attendedCount?: number;
}
class ManualCheckInDto {
  @IsUUID() public familyBookingId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_ATTENDED_COUNT) public attendedCount?: number;
}
class ListEventsQueryDto {
  @IsOptional() @IsUUID() public familyBookingId?: string;
  @IsOptional() @IsUUID() public sessionId?: string;
  @IsOptional() @IsUUID() public deviceId?: string;
  @IsOptional() @IsIn(["CHECKED_IN", "PARTY_SELECTION_REQUIRED", "ALREADY_CHECKED_IN", "CANCELLED", "SESSION_MISMATCH", "EXPIRED_QR", "REVOKED_QR", "INVALID_QR", "RESERVATION_NOT_FOUND", "NOT_AUTHORIZED"])
  public result?: string;
  @IsOptional() @Matches(/^\d+$/) public afterSequence?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

@Controller("api/v1")
export class CheckInsController {
  public constructor(private readonly service: CheckInsService) {}

  @Get("scanner/check-in/sessions")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public sessions(@CurrentActor() actor: AuthenticatedActor) { return this.service.listEligibleSessions(actor); }

  @Get("scanner/check-in/candidates")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public candidates(@CurrentActor() actor: AuthenticatedActor, @Query("phoneLast4") phoneLast4: string) {
    return this.service.manualCandidates(actor, phoneLast4);
  }

  @Post("scanner/check-ins/qr")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public qr(
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: QrCheckInDto,
  ) { return this.service.byQr(actor, body.qrToken, this.key(key), body.attendedCount); }

  @Post("scanner/check-ins/manual")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public manual(
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: ManualCheckInDto,
  ) { return this.service.byManual(actor, body.familyBookingId, this.key(key), body.attendedCount); }

  @Get("admin/check-in-events")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public events(@Query() query: ListEventsQueryDto) {
    return this.service.listEvents(query);
  }

  private key(value: string | undefined): string {
    if (value === undefined) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
    return value;
  }
}
