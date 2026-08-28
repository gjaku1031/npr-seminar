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
/** 수동 입장 대상 예약과 실제 인원을 검증한다. 입장 가능 판정에서 인원을 생략하면 서비스가 PARTY_SELECTION_REQUIRED를 기록한다. */
class ManualCheckInDto {
  @IsUUID() public familyBookingId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_ATTENDED_COUNT) public attendedCount?: number;
}
/** 관리자 입장 사건 조회의 대상 필터와 순차 페이지 인자를 검증한다. */
class ListEventsQueryDto {
  @IsOptional() @IsUUID() public familyBookingId?: string;
  @IsOptional() @IsUUID() public sessionId?: string;
  @IsOptional() @IsUUID() public deviceId?: string;
  @IsOptional() @IsIn(["CHECKED_IN", "PARTY_SELECTION_REQUIRED", "ALREADY_CHECKED_IN", "CANCELLED", "SESSION_MISMATCH", "EXPIRED_QR", "REVOKED_QR", "INVALID_QR", "RESERVATION_NOT_FOUND", "NOT_AUTHORIZED"])
  public result?: string;
  @IsOptional() @Matches(/^\d+$/) public afterSequence?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

/** 스캐너 입장 요청과 관리자 사건 조회의 인증·CSRF 경계. 실제 판정은 {@link CheckInsService}가 한다. */
@Controller("api/v1")
export class CheckInsController {
  public constructor(private readonly service: CheckInsService) {}

  /** 활성 스캐너가 선택할 수 있는 공개 회차와 현재 고른 회차를 반환한다. */
  @Get("scanner/check-in/sessions")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public sessions(@CurrentActor() actor: AuthenticatedActor) { return this.service.listEligibleSessions(actor); }

  /** 현재 스캐너 회차에서 연락처 뒤 네 자리로 수동 입장 후보를 찾는다. */
  @Get("scanner/check-in/candidates")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public candidates(@CurrentActor() actor: AuthenticatedActor, @Query("phoneLast4") phoneLast4: string) {
    return this.service.manualCandidates(actor, phoneLast4);
  }

  /** QR 입장을 {@link CheckInsService.byQr}에 맡긴다. 서비스의 업무 판정은 HTTP 200 결과코드이며 입력·인증·키 오류는 HTTP 예외다. */
  @Post("scanner/check-ins/qr")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public qr(
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: QrCheckInDto,
  ) { return this.service.byQr(actor, body.qrToken, this.key(key), body.attendedCount); }

  /** 예약 ID로 수동 입장한다. 입력·인증·키 오류를 통과하면 서비스가 업무 판정과 사건을 기록해 HTTP 200 결과를 반환한다. */
  @Post("scanner/check-ins/manual")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public manual(
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: ManualCheckInDto,
  ) { return this.service.byManual(actor, body.familyBookingId, this.key(key), body.attendedCount); }

  /** 관리자가 입장 사건을 순서대로 조회한다. 스캐너 전용 입장 권한과 별개의 경계다. */
  @Get("admin/check-in-events")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public events(@Query() query: ListEventsQueryDto) {
    return this.service.listEvents(query);
  }

  /** 누락된 Idempotency-Key를 HTTP 400으로 거절하고 나머지 길이 검사는 서비스에 맡긴다. */
  private key(value: string | undefined): string {
    if (value === undefined) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
    return value;
  }
}
