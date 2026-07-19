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

class CreatePairingDto {
  @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  @IsString() @Length(1, 100) public intendedDeviceName!: string;
  @IsString() @Length(1, 100) public gateCode!: string;
}
export class ClaimPairingDto {
  @Transform(({ value }) => typeof value === "string" ? value.normalize("NFKC").trim().toUpperCase() : value)
  @IsString() @Matches(/^[2-9A-HJ-NP-Z]{6}$/) public pairingCode!: string;
  @IsString() @Length(1, 100) public deviceName!: string;
  @IsString() @Length(1, 200) public clientPlatform!: string;
}
export class ListScannerDevicesQueryDto {
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"])
  public branch?: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  @IsIn(["ACTIVE", "REVOKED", "UNPAIRED"])
  public status: "ACTIVE" | "REVOKED" | "UNPAIRED" = "ACTIVE";

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  public page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  public pageSize = 50;
}
class HeartbeatDto {
  @IsDateString() public clientTime!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) public batteryLevelPercent?: number | null;
  @IsOptional() @IsBoolean() public isCharging?: boolean | null;
}
class SelectSessionDto { @IsUUID() public seminarSessionId!: string; }
class ReasonDto { @IsString() @Length(3, 500) public reason!: string; }

@Controller("api/v1")
export class ScannerDevicesController {
  public constructor(
    private readonly service: ScannerDevicesService,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  @Post("admin/scanner-devices/pairing-codes")
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public createPairing(@Body() body: CreatePairingDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.createPairing({
      branchCode: body.branch,
      name: body.intendedDeviceName,
      gateCode: body.gateCode,
    }, actor.subject, this.key(key));
  }

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

  @Post("public/scanner-pairing/claims")
  @UseGuards(CsrfGuard)
  public claim(@Req() request: Request, @Body() body: ClaimPairingDto, @Headers("idempotency-key") key: string | undefined) {
    return this.service.claim(request, body.pairingCode, body.clientPlatform, body.deviceName, this.key(key));
  }

  @Get("admin/scanner-devices")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public list(@Query() query: ListScannerDevicesQueryDto) { return this.service.list(query); }

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

  @Get("admin/scanner-devices/:deviceId")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public detail(@Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string) { return this.service.detail(deviceId); }

  @Get("admin/scanner-devices/:deviceId/events")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public events(
    @Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string,
    @Query("afterSequence") afterSequence?: string,
    @Query("limit") limit?: string,
  ) { return this.service.events(deviceId, afterSequence, limit === undefined ? undefined : Number(limit)); }

  @Get("scanner/current")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public current(@CurrentActor() actor: AuthenticatedActor) {
    return this.service.current(actor.scannerDeviceId!);
  }

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

  @Get("scanner/shifts/current")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public currentShift(@CurrentActor() actor: AuthenticatedActor) {
    return this.service.currentShift(actor.scannerDeviceId!);
  }

  @Post("scanner/shifts/current")
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public selectSession(@Req() request: Request, @Body() body: SelectSessionDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.selectSession(request, actor.scannerDeviceId!, body.seminarSessionId, this.key(key));
  }

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

  @Post("admin/scanner-devices/:deviceId/revoke")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public revoke(@Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string, @Body() body: ReasonDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.revoke(deviceId, actor.subject, body.reason, this.key(key));
  }

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

  private key(value?: string): string {
    if (value === undefined || value.length < 8 || value.length > 200) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    return value;
  }
}
