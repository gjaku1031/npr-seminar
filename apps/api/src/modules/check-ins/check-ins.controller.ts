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
 * QR 입장 요청 본문
 *
 * attendedCount는 실제 입장 인원. 스캐너 컨텍스트(기기·세션·게이트)와 달리 현장 스태프의 답변이라 클라이언트가 보냄
 * 생략하면 서버가 PARTY_SELECTION_REQUIRED로 되묻고 예약은 변경하지 않음
 * 예약 인원과 무관함(1명 예약에 두 명이 오기도 함). 상한은 숫자패드 오타 방지용
 */
class QrCheckInDto {
  /**
   * QR 토큰. 43~512자
   */
  @IsString() @Length(43, 512) public qrToken!: string;

  /**
   * 실제 입장 인원. 1~MAX_ATTENDED_COUNT
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_ATTENDED_COUNT) public attendedCount?: number;
}

/**
 * 수동 입장 요청 본문
 *
 * 입장 가능 판정에서 인원을 생략하면 서비스가 PARTY_SELECTION_REQUIRED 기록
 */
class ManualCheckInDto {
  /**
   * 가족 예약 공개 ID
   */
  @IsUUID() public familyBookingId!: string;

  /**
   * 실제 입장 인원
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_ATTENDED_COUNT) public attendedCount?: number;
}

/**
 * 관리자 입장 이벤트 조회 필터와 커서
 */
class ListEventsQueryDto {
  /**
   * 가족 예약 ID
   */
  @IsOptional() @IsUUID() public familyBookingId?: string;

  /**
   * 회차 ID
   */
  @IsOptional() @IsUUID() public sessionId?: string;

  /**
   * 스캐너 기기 ID
   */
  @IsOptional() @IsUUID() public deviceId?: string;

  /**
   * 판정 결과
   */
  @IsOptional() @IsIn(["CHECKED_IN", "PARTY_SELECTION_REQUIRED", "ALREADY_CHECKED_IN", "CANCELLED", "SESSION_MISMATCH", "EXPIRED_QR", "REVOKED_QR", "INVALID_QR", "RESERVATION_NOT_FOUND", "NOT_AUTHORIZED"])
  public result?: string;

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
 * 체크인 API
 *
 * 스캐너 입장 요청과 관리자 이벤트 조회의 인증·CSRF 경계. 실제 판정은 CheckInsService가 수행
 */
@Controller("api/v1")
export class CheckInsController {
  /**
   * 체크인 서비스 주입
   */
  public constructor(private readonly service: CheckInsService) {}

  /**
   * 스캐너가 선택할 수 있는 공개 회차와 현재 선택 회차
   */
  @Get("scanner/check-in/sessions")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public sessions(@CurrentActor() actor: AuthenticatedActor) { return this.service.listEligibleSessions(actor); }

  /**
   * 현재 스캐너 회차에서 연락처 끝 4자리로 수동 입장 후보 검색
   */
  @Get("scanner/check-in/candidates")
  @UseGuards(SessionGuard, RolesGuard) @Roles("SCANNER")
  public candidates(@CurrentActor() actor: AuthenticatedActor, @Query("phoneLast4") phoneLast4: string) {
    return this.service.manualCandidates(actor, phoneLast4);
  }

  /**
   * QR 입장
   *
   * 업무 판정 결과는 HTTP 200 결과 코드로 반환. 입력·인증·키 오류는 HTTP 오류
   */
  @Post("scanner/check-ins/qr")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public qr(
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: QrCheckInDto,
  ) { return this.service.byQr(actor, body.qrToken, this.key(key), body.attendedCount); }

  /**
   * 예약 ID로 수동 입장
   *
   * 입력·인증·키 검사를 통과하면 서비스가 판정과 이벤트를 기록해 HTTP 200 결과 반환
   */
  @Post("scanner/check-ins/manual")
  @HttpCode(200)
  @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("SCANNER")
  public manual(
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: ManualCheckInDto,
  ) { return this.service.byManual(actor, body.familyBookingId, this.key(key), body.attendedCount); }

  /**
   * 관리자 입장 이벤트 순차 조회. 스캐너 입장 권한과 별개
   */
  @Get("admin/check-in-events")
  @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public events(@Query() query: ListEventsQueryDto) {
    return this.service.listEvents(query);
  }

  /**
   * Idempotency-Key 헤더 필수 확인. 길이는 서비스가 검사
   *
   * @throws {DomainError} 400 IDEMPOTENCY_KEY_REQUIRED
   */
  private key(value: string | undefined): string {
    if (value === undefined) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
    return value;
  }
}
