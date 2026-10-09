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

/**
 * 페어링 코드 발급 요청 본문
 */
class CreatePairingDto {
  /**
   * 기기를 쓸 캠퍼스
   */
  @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 등록 예정 기기 이름. 1~100자
   */
  @IsString() @Length(1, 100) public intendedDeviceName!: string;

  /**
   * 출입구 코드. 1~100자
   */
  @IsString() @Length(1, 100) public gateCode!: string;
}

/**
 * 페어링 코드 사용 요청 본문
 */
export class ClaimPairingDto {
  /**
   * 페어링 코드. NFKC·공백 제거·대문자 변환 후 혼동 문자(0·1·I·O)를 뺀 6자 확인
   */
  @Transform(({ value }) => typeof value === "string" ? value.normalize("NFKC").trim().toUpperCase() : value)
  @IsString() @Matches(/^[2-9A-HJ-NP-Z]{6}$/) public pairingCode!: string;

  /**
   * 기기 이름. 1~100자
   */
  @IsString() @Length(1, 100) public deviceName!: string;

  /**
   * 클라이언트 플랫폼 설명. 1~200자
   */
  @IsString() @Length(1, 200) public clientPlatform!: string;
}

/**
 * 관리자 기기 목록 쿼리
 */
export class ListScannerDevicesQueryDto {
  /**
   * 캠퍼스 필터. 생략하면 전체
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"])
  public branch?: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 기기 상태 필터. 기본 ACTIVE
   */
  @IsIn(["ACTIVE", "REVOKED", "UNPAIRED"])
  public status: "ACTIVE" | "REVOKED" | "UNPAIRED" = "ACTIVE";

  /**
   * 페이지 번호. 1부터
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  public page = 1;

  /**
   * 페이지 크기. 1~200, 기본 50
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  public pageSize = 50;
}

/**
 * 스캐너 상태 보고 본문. clientTime은 형식만 검증하고 접속 시각은 서버 시각 기준
 */
class HeartbeatDto {
  /**
   * 기기 시각(ISO 8601)
   */
  @IsDateString() public clientTime!: string;

  /**
   * 배터리 잔량(%). 모르면 null·생략
   */
  @IsOptional() @IsInt() @Min(0) @Max(100) public batteryLevelPercent?: number | null;

  /**
   * 충전 중 여부. 모르면 null·생략
   */
  @IsOptional() @IsBoolean() public isCharging?: boolean | null;
}

/**
 * 스캐너 회차 선택 본문. 회차 공개 ID
 */
class SelectSessionDto { @IsUUID() public seminarSessionId!: string; }

/**
 * 관리자 해제·취소 사유 본문. reason 3~500자
 */
class ReasonDto { @IsString() @Length(3, 500) public reason!: string; }

/**
 * 스캐너 기기 API
 *
 * 관리자 기기 관리, 공개 페어링, 스캐너 자기 상태·회차 선택 경로에 각각 인증·역할·CSRF 경계 적용
 */
@Controller("api/v1")
export class ScannerDevicesController {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 스캐너 기기 서비스
     */
    private readonly service: ScannerDevicesService,

    /**
     * 실행 환경. 쿠키 속성 계산용
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * 일회성 페어링 코드 발급. 원문 코드는 최초 성공 응답에만 포함
   */
  @Post("admin/scanner-devices/pairing-codes")
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public createPairing(@Body() body: CreatePairingDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.createPairing({
      branchCode: body.branch,
      name: body.intendedDeviceName,
      gateCode: body.gateCode,
    }, actor.subject, this.key(key));
  }

  /**
   * 미사용 페어링 코드 취소 후 204. 이미 사용된 코드는 409
   */
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

  /**
   * 공개 브라우저의 페어링 코드 사용. 성공 시 SCANNER 세션과 CSRF 토큰을 새로 발급
   */
  @Post("public/scanner-pairing/claims")
  @UseGuards(CsrfGuard)
  public claim(@Req() request: Request, @Body() body: ClaimPairingDto, @Headers("idempotency-key") key: string | undefined) {
    return this.service.claim(request, body.pairingCode, body.clientPlatform, body.deviceName, this.key(key));
  }

  /**
   * 상태·캠퍼스별 기기 목록과 접속 상태 조회
   */
  @Get("admin/scanner-devices")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public list(@Query() query: ListScannerDevicesQueryDto) { return this.service.list(query); }

  /**
   * 기기 삭제. DB 삭제와 Redis 정리 후 204
   */
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

  /**
   * 기기 상세와 현재 회차 잠금 상태 조회
   */
  @Get("admin/scanner-devices/:deviceId")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public detail(@Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string) { return this.service.detail(deviceId); }

  /**
   * 기기 감사 이벤트를 순번 순서로 조회
   */
  @Get("admin/scanner-devices/:deviceId/events")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public events(
    @Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string,
    @Query("afterSequence") afterSequence?: string,
    @Query("limit") limit?: string,
  ) { return this.service.events(deviceId, afterSequence, limit === undefined ? undefined : Number(limit)); }

  /**
   * 현재 세션의 활성 스캐너와 회차 상태 조회
   */
  @Get("scanner/current")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public current(@CurrentActor() actor: AuthenticatedActor) {
    return this.service.current(actor.scannerDeviceId!);
  }

  /**
   * 기기 상태와 Redis 접속 표시 갱신. clientTime 대신 서버 시각 사용
   */
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

  /**
   * 현재 잠긴 회차 조회. 잠기지 않았으면 lock은 null
   */
  @Get("scanner/shifts/current")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public currentShift(@CurrentActor() actor: AuthenticatedActor) {
    return this.service.currentShift(actor.scannerDeviceId!);
  }

  /**
   * OPEN 회차 선택. 다른 회차가 이미 잠겨 있으면 409
   */
  @Post("scanner/shifts/current")
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public selectSession(@Req() request: Request, @Body() body: SelectSessionDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.selectSession(request, actor.scannerDeviceId!, body.seminarSessionId, this.key(key));
  }

  /**
   * 관리자 회차 잠금 해제. 잠금이 있었을 때만 SHIFT_RELEASED 감사를 남기고 해제 상태 반환
   */
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

  /**
   * 관리자 기기 취소 후 Redis 기기 세션·접속 표시를 지우고 최신 상세 반환
   */
  @Post("admin/scanner-devices/:deviceId/revoke")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public revoke(@Param("deviceId", new ParseUUIDPipe({ version: "4" })) deviceId: string, @Body() body: ReasonDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.service.revoke(deviceId, actor.subject, body.reason, this.key(key));
  }

  /**
   * 스캐너 자가 해제 후 Express 세션과 현재·이전 세션 쿠키 제거, 204 반환
   */
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

  /**
   * Idempotency-Key 헤더 확인(8~200자)
   *
   * @throws {DomainError} 400 IDEMPOTENCY_KEY_REQUIRED
   */
  private key(value?: string): string {
    if (value === undefined || value.length < 8 || value.length > 200) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    return value;
  }
}
