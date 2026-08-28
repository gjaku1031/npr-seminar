import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from "class-validator";
import { type Request, type Response } from "express";
import type { AppEnvironment } from "../../common/config/environment.js";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME, sessionCookieOptions } from "../../common/auth/session-cookie.js";
import { CurrentActor } from "../../common/auth/current-actor.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { type AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { ScannerDevicesService } from "./scanner-devices.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

/** 관리자가 발급할 코드의 캠퍼스·기기 이름·게이트를 검증한다. */
class CreatePairingDto {
  @IsIn(["SONGPA", "WIRYE", "GWANGJIN"]) public branch!: "SONGPA" | "WIRYE" | "GWANGJIN";
  @IsString() @Length(1, 100) public intendedDeviceName!: string;
  @IsString() @Length(1, 100) public gateCode!: string;
}
/** 공개 페어링 코드와 등록할 기기 정보를 검증한다. 코드는 NFKC 정규화 후 검사한다. */
export class ClaimPairingDto {
  @Transform(({ value }) => typeof value === "string" ? value.normalize("NFKC").trim().toUpperCase() : value)
  @IsString() @Matches(/^[2-9A-HJ-NP-Z]{6}$/) public pairingCode!: string;
  @IsString() @Length(1, 100) public deviceName!: string;
  @IsString() @Length(1, 200) public clientPlatform!: string;
}
/** 관리자 기기 목록의 상태·캠퍼스 필터와 페이지 범위를 검증한다. */
export class ListScannerDevicesQueryDto {
  @IsOptional() @IsIn(["SONGPA", "WIRYE", "GWANGJIN"])
  public branch?: "SONGPA" | "WIRYE" | "GWANGJIN";

  @IsIn(["ACTIVE", "REVOKED", "UNPAIRED"])
  public status: "ACTIVE" | "REVOKED" | "UNPAIRED" = "ACTIVE";

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  public page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  public pageSize = 50;
}
/** 스캐너 상태 입력. clientTime은 검증만 하며 서버 presence 시각의 기준은 아니다. */
class HeartbeatDto {
  @IsDateString() public clientTime!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) public batteryLevelPercent?: number | null;
  @IsOptional() @IsBoolean() public isCharging?: boolean | null;
}
/** 스캐너가 잠글 설명회 회차의 공개 ID를 검증한다. */
class SelectSessionDto { @IsUUID() public seminarSessionId!: string; }
/** 관리자 해제·취소 사유를 검증한다. */
class ReasonDto { @IsString() @Length(3, 500) public reason!: string; }

/** 관리자·스캐너·공개 페어링 경로의 인증과 CSRF 경계를 {@link ScannerDevicesService} 앞에서 적용한다. */
@Controller("api/v1")
export class ScannerDevicesController {
  public constructor(
    private readonly service: ScannerDevicesService,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /** 관리자가 일회성 페어링 코드를 발급한다. 원문 코드는 최초 성공 응답에만 있다. */
  @Post("admin/scanner-devices/pairing-codes")
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public createPairing(@Body() body: CreatePairingDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.createPairing({
      branchCode: body.branch,
      name: body.intendedDeviceName,
      gateCode: body.gateCode,
    }, actor.subject, this.key(key));
  }

  /** 미사용 페어링 코드를 취소하고 본문 없는 204를 반환한다. 이미 claim한 코드는 409다. */
  @Delete("admin/scanner-devices/pairing-codes/:pairingCodeId")
  @HttpCode(204)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public async cancelPairing(
    @Param("pairingCodeId", new ParseUUIDPipe({ version: "4" })) pairingCodeId: string,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<void> {
    await this.service.cancelPairing(pairingCodeId, actor.subject, this.key(key));
  }

  /** 공개 브라우저가 코드를 claim한다. 성공 시 서비스가 SCANNER 세션과 CSRF를 새로 만든다. */
  @Post("public/scanner-pairing/claims")
  @UseGuards(CsrfGuard)
  public claim(@Req() request: Request, @Body() body: ClaimPairingDto, @Headers("idempotency-key") key: string | undefined) {
    return this.service.claim(request, body.pairingCode, body.clientPlatform, body.deviceName, this.key(key));
  }

  /** 관리자가 상태·캠퍼스별 기기 목록과 presence를 조회한다. */
  @Get("admin/scanner-devices")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public list(@Query() query: ListScannerDevicesQueryDto) { return this.service.list(query); }

  /** 관리자 기기를 삭제한다. 서비스의 DB 삭제·Redis 정리가 끝난 뒤 204를 반환한다. */
  @Delete("admin/scanner-devices/:deviceId")
  @HttpCode(204)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public async deleteDevice(
    @Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<void> {
    await this.service.deleteDevice(deviceId, actor.subject, this.key(key));
  }

  /** 관리자가 기기 상세와 현재 회차 잠금 상태를 조회한다. */
  @Get("admin/scanner-devices/:deviceId")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public detail(@Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string) { return this.service.detail(deviceId); }

  /** 기기의 감사 사건을 sequence 순으로 조회한다. */
  @Get("admin/scanner-devices/:deviceId/events")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public events(
    @Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string,
    @Query("afterSequence") afterSequence?: string,
    @Query("limit") limit?: string,
  ) { return this.service.events(deviceId, afterSequence, limit === undefined ? undefined : Number(limit)); }

  /** 현재 세션의 활성 스캐너와 회차 상태를 조회한다. */
  @Get("scanner/current")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public current(@CurrentActor() actor: AuthenticatedActor) {
    return this.service.current(actor.scannerDeviceId!);
  }

  /** 기기 상태와 Redis presence를 갱신한다. clientTime 대신 서버 시각을 사용한다. */
  @Post("scanner/heartbeat")
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public heartbeat(@Body() body: HeartbeatDto, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.heartbeat(
      actor.scannerDeviceId!,
      actor.scannerDeviceId,
      body.batteryLevelPercent,
      body.isCharging,
    );
  }

  /** 스캐너가 현재 잠근 회차를 조회한다. 잠기지 않았다면 lock은 null이다. */
  @Get("scanner/shifts/current")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public currentShift(@CurrentActor() actor: AuthenticatedActor) {
    return this.service.currentShift(actor.scannerDeviceId!);
  }

  /** 스캐너가 OPEN 회차를 선택한다. 다른 회차가 이미 잠겼다면 409다. */
  @Post("scanner/shifts/current")
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public selectSession(@Req() request: Request, @Body() body: SelectSessionDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.selectSession(request, actor.scannerDeviceId!, body.seminarSessionId, this.key(key));
  }

  /** 관리자가 회차 잠금을 푼다. 잠금이 있었을 때만 SHIFT_RELEASED 감사를 남기고 해제 상태를 반환한다. */
  @Post("admin/scanner-devices/:deviceId/shift/release")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public unlockSession(
    @Req() request: Request,
    @Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string,
    @Body() body: ReasonDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ) { return this.service.unlockSession(request, deviceId, actor.subject, body.reason, this.key(key)); }

  /** 관리자 취소 후 Redis 기기 세션·presence를 지우고 최신 상세를 반환한다. */
  @Post("admin/scanner-devices/:deviceId/revoke")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public revoke(@Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string, @Body() body: ReasonDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.revoke(deviceId, actor.subject, body.reason, this.key(key));
  }

  /** 스캐너 자가 해제 뒤 Express 세션과 두 세션 쿠키를 제거하고 204를 반환한다. */
  @Delete("scanner/device/pairing")
  @HttpCode(204)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public async selfUnpair(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<void> {
    await this.service.selfUnpair(request, actor.scannerDeviceId!, this.key(key));
    const options = sessionCookieOptions(this.environment);
    response.clearCookie(SESSION_COOKIE_NAME, options);
    response.clearCookie(LEGACY_SESSION_COOKIE_NAME, options);
  }

  /** 누락되거나 8~200자 밖인 Idempotency-Key를 HTTP 400으로 거절한다. */
  private key(value?: string): string {
    if (value === undefined || value.length < 8 || value.length > 200) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    return value;
  }
}
