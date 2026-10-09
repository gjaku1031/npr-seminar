import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDefined, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { CurrentActor } from "../../common/auth/current-actor.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import type { AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type { AttendanceParty } from "./attendance.js";
import { ADMIN_BOOKING_CANCELLATION_TYPES, type AdminBookingCancellationType } from "./booking-cancellation-type.js";
import { FamilyBookingsManagementService } from "./family-bookings-management.service.js";
import { FamilyBookingsService } from "./family-bookings.service.js";
import { SameOriginGuard } from "../../common/auth/same-origin.guard.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import type { Request } from "express";
import { GUEST_GRADES, type GuestGrade } from "./family-bookings.service.js";
import { FamilyBookingLookupService } from "./family-booking-lookup.service.js";
import { BookingProofRequiredGuard } from "./booking-proof-required.guard.js";
import { BookingAccessService } from "./booking-access.service.js";

/**
 * 비재원생 참가자 입력
 */
class GuestParticipantDto {
  /**
   * 이름. 1~100자
   */
  @IsString() @Length(1, 100) public name!: string;

  /**
   * 캠퍼스
   */
  @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 학교. 1~200자
   */
  @IsString() @Length(1, 200) public schoolName!: string;

  /**
   * 학년. GUEST_GRADES 중 하나
   */
  @IsIn(GUEST_GRADES) public grade!: GuestGrade;
}

/**
 * 공개 예약 생성 본문
 */
class PublicCreateDto {
  /**
   * 회차 공개 ID
   */
  @IsUUID() public seminarSessionId!: string;

  /**
   * 참석 보호자
   */
  @IsIn(["MOTHER", "FATHER", "BOTH"]) public attendanceParty!: AttendanceParty;

  /**
   * 참여 유형. 재원생은 증명 연락처로 찾은 학생 전체, 비재원생은 guest 입력
   */
  @IsIn(["ENROLLED", "GUEST"]) public participantType!: "ENROLLED" | "GUEST";

  /**
   * 비재원생 정보. GUEST일 때 필수
   */
  @ValidateIf((body: PublicCreateDto) => body.participantType === "GUEST") @IsDefined()
  @ValidateNested() @Type(() => GuestParticipantDto) public guest?: GuestParticipantDto;
}

/**
 * 공개 예약 변경 본문
 */
class PublicUpdateDto {
  /**
   * 현재 예약 버전
   */
  @IsInt() @Min(1) public expectedVersion!: number;

  /**
   * 옮길 회차 ID
   */
  @IsOptional() @IsUUID() public seminarSessionId?: string;

  /**
   * 참석 보호자
   */
  @IsOptional() @IsIn(["MOTHER", "FATHER", "BOTH"]) public attendanceParty?: AttendanceParty;
}

/**
 * 예약 취소 본문. expectedVersion 현재 버전, reason 선택 사유(최대 500자)
 */
class CancelDto { @IsInt() @Min(1) public expectedVersion!: number; @IsOptional() @IsString() @MaxLength(500) public reason?: string | null; }

/**
 * 연락처 예약 조회 본문. contact 8~40자
 */
class PublicLookupDto { @IsString() @Length(8, 40) public contact!: string; }

/**
 * 연락처 확인 읽기 세션 본문. contact 8~40자
 */
class PublicReadSessionDto { @IsString() @Length(8, 40) public contact!: string; }

/**
 * 관리자 예약 생성 본문
 */
export class AdminCreateDto {
  /**
   * 회차 공개 ID
   */
  @IsUUID() public seminarSessionId!: string;

  /**
   * 참석 보호자
   */
  @IsIn(["MOTHER", "FATHER", "BOTH"]) public attendanceParty!: AttendanceParty;

  /**
   * 참여 유형
   */
  @IsIn(["ENROLLED", "GUEST"]) public participantType!: "ENROLLED" | "GUEST";

  /**
   * 재원생 학생 ID 목록. ENROLLED일 때 1~10명, 중복 금지
   */
  @ValidateIf((body: AdminCreateDto) => body.participantType === "ENROLLED") @IsDefined()
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsUUID("4", { each: true }) public studentIds?: string[];

  /**
   * 비재원생 정보. GUEST일 때 필수
   */
  @ValidateIf((body: AdminCreateDto) => body.participantType === "GUEST") @IsDefined()
  @ValidateNested() @Type(() => GuestParticipantDto) public guest?: GuestParticipantDto;

  /**
   * 보호자 연락처. 8~40자
   */
  @IsString() @Length(8, 40) public contact!: string;

  /**
   * 예약 경로. 전화·선생님·현장
   */
  @IsIn(["PHONE", "TEACHER", "ON_SITE"]) public bookingSource!: "PHONE" | "TEACHER" | "ON_SITE";

  /**
   * 감사 사유. 생략하면 예약 경로 기반 기본 사유
   */
  @IsOptional() @IsString() @Length(3, 500) public reason?: string;
}

/**
 * 관리자 예약 변경 본문
 */
export class AdminUpdateDto extends PublicUpdateDto {
  /**
   * 교체할 재원생 학생 ID 목록. 1~10명
   */
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique()
  @IsUUID("4", { each: true }) public studentIds?: string[];

  /**
   * 감사 사유. 3~500자
   */
  @IsString() @Length(3, 500) public reason!: string;
}

/**
 * 테스트 예약 캠퍼스 변경 본문
 */
class TestBranchDto {
  /**
   * 옮길 캠퍼스
   */
  @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
}

/**
 * 관리자 예약 취소 본문
 */
export class AdminCancelDto {
  /**
   * 현재 예약 버전
   */
  @IsInt() @Min(1) public expectedVersion!: number;

  /**
   * 취소 유형. 전화·선생님·기타
   */
  @IsIn(ADMIN_BOOKING_CANCELLATION_TYPES) public cancellationType!: AdminBookingCancellationType;
}

/**
 * 관리자 예약 목록 쿼리
 */
class ListQuery {
  /**
   * 회차 ID
   */
  @IsOptional() @IsUUID() public sessionId?: string;

  /**
   * 캠퍼스
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;

  /**
   * 예약 상태
   */
  @IsOptional() @IsIn(["RESERVED", "CHECKED_IN", "CANCELLED", "NO_SHOW"]) public status?: string;

  /**
   * 검색어
   */
  @IsOptional() @IsString() @MaxLength(100) public query?: string;

  /**
   * 페이지 번호
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;

  /**
   * 페이지 크기. 1~200, 기본 50
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

/**
 * 이벤트 커서 쿼리. afterSequence 다음 순번부터 limit(1~200)건
 */
class CursorQuery { @IsOptional() @Matches(/^\d+$/) public afterSequence?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number; }

/**
 * 관리자 예약 생성 감사 사유
 *
 * 입력 사유를 NFC·공백 제거 후 최대 500자. 비어 있으면 `ADMIN_CREATE_{예약 경로}`
 */
export function adminCreateAuditReason(
  bookingSource: "PHONE" | "TEACHER" | "ON_SITE",
  reason?: string,
): string {
  const value = reason?.normalize("NFC").trim() || `ADMIN_CREATE_${bookingSource}`;
  return [...value].slice(0, 500).join("");
}

/**
 * 가족 예약 API
 *
 * 공개 경로는 OTP 예약 증명·예약 관리 세션·동일 출처로, 관리자 경로는 세션·역할·CSRF로 보호
 */
@Controller("api/v1")
export class FamilyBookingsController {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 예약 생성 서비스
     */
    private readonly createService: FamilyBookingsService,

    /**
     * 예약 조회·변경·취소 서비스
     */
    private readonly management: FamilyBookingsManagementService,

    /**
     * 연락처 예약 조회 서비스
     */
    private readonly lookupService: FamilyBookingLookupService,

    /**
     * 예약 관리 세션 서비스
     */
    private readonly bookingAccess: BookingAccessService,
  ) {}

  /**
   * 공개 예약 생성. 예약 증명 필요
   *
   * 최초 생성 응답에만 QR 원문 포함
   */
  @Post("public/family-bookings")
  @UseGuards(SameOriginGuard)
  @SensitiveResponse()
  public async publicCreate(@Body() body: PublicCreateDto, @Headers("x-booking-proof") proof = "", @Headers("idempotency-key") key?: string) {
    const result = await this.createService.create({
      sessionId: body.seminarSessionId, bookingProof: proof, attendanceParty: body.attendanceParty,
      participantType: body.participantType,
      ...(body.guest === undefined ? {} : { guest: body.guest }),
    }, this.key(key));
    const booking = await this.management.get(result.familyBookingId);
    return result.replayed ? { booking, replayed: true } : { booking, replayed: false, qrToken: result.qrToken, qrExpiresAt: result.qrExpiresAt };
  }

  /**
   * 예약 증명 연락처의 예약 목록
   */
  @Get("public/family-bookings")
  @SensitiveResponse()
  public publicList(@Headers("x-booking-proof") proof = "") { return this.management.listAuthorized(proof); }

  /**
   * 연락처로 마스킹된 예약 목록 조회
   */
  @Post("public/family-bookings/lookup")
  @HttpCode(200)
  @UseGuards(SameOriginGuard)
  @SensitiveResponse()
  public publicLookup(@Req() request: Request, @Body() body: PublicLookupDto) {
    return this.lookupService.lookup(request, body.contact);
  }

  /**
   * 예약 ID와 전체 연락처로 읽기 세션 발급
   */
  @Post("public/family-bookings/:familyBookingId/read-session")
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @SensitiveResponse()
  public publicReadSession(
    @Req() request: Request,
    @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: PublicReadSessionDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.bookingAccess.establishContactReadSession(request, id, body.contact, this.key(key));
  }

  /**
   * 공개 예약 상세. 예약 증명 또는 예약 관리 세션 필요
   */
  @Get("public/family-bookings/:familyBookingId")
  @SensitiveResponse()
  public publicGet(@Req() request: Request, @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Headers("x-booking-proof") proof = "") { return this.management.getAuthorized(id, proof, request); }

  /**
   * 공개 예약 변경. 예약 증명(BOOKING_MANAGE) 필수
   */
  @Patch("public/family-bookings/:familyBookingId")
  @UseGuards(BookingProofRequiredGuard, CsrfGuard)
  @SensitiveResponse()
  public publicUpdate(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: PublicUpdateDto, @Headers("x-booking-proof") proof = "", @Headers("idempotency-key") key?: string) {
    const requiredProof = this.proof(proof);
    return this.management.update(id, { ...body, reason: "PUBLIC_SELF_SERVICE" }, null, this.key(key), requiredProof);
  }

  /**
   * 공개 예약 취소. 예약 증명 필수, 사유가 없으면 PUBLIC_SELF_SERVICE
   */
  @Post("public/family-bookings/:familyBookingId/cancel")
  @HttpCode(200) @UseGuards(BookingProofRequiredGuard, CsrfGuard)
  @SensitiveResponse()
  public publicCancel(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: CancelDto, @Headers("x-booking-proof") proof = "", @Headers("idempotency-key") key?: string) {
    const requiredProof = this.proof(proof);
    return this.management.cancel(
      id,
      body.expectedVersion,
      "SELF_SERVICE",
      null,
      this.key(key),
      requiredProof,
      body.reason?.trim() || "PUBLIC_SELF_SERVICE",
    );
  }

  /**
   * 공개 예약 QR 재표시. 예약 증명 또는 예약 관리 세션 필요
   */
  @Get("public/family-bookings/:familyBookingId/qr")
  @SensitiveResponse()
  public publicQr(@Req() request: Request, @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Headers("x-booking-proof") proof = "") {
    return this.management.recoverQr(id, proof, request);
  }

  /**
   * QR 토큰으로 입장권 정보 조회
   *
   * @throws {DomainError} 401 X-QR-Token 헤더 없음
   */
  @Get("public/qr-pass")
  @SensitiveResponse()
  public qrPass(@Headers("x-qr-token") token?: string) { if (token === undefined) throw new DomainError(401, "QR_REQUIRED", "X-QR-Token is required."); return this.management.qrPass(token); }

  /**
   * 관리자 예약 목록
   */
  @Get("admin/family-bookings") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public list(@Query() query: ListQuery) { return this.management.list(query); }

  /**
   * 관리자 예약 생성. 최초 생성 응답에만 QR 원문 포함
   */
  @Post("admin/family-bookings") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public async adminCreate(@Body() body: AdminCreateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    const result = await this.createService.create({
      sessionId: body.seminarSessionId, contact: body.contact, attendanceParty: body.attendanceParty,
      participantType: body.participantType,
      ...(body.studentIds === undefined ? {} : { studentIds: body.studentIds }),
      ...(body.guest === undefined ? {} : { guest: body.guest }),
      adminOverride: {
        actorSubject: actor.subject,
        reason: adminCreateAuditReason(body.bookingSource, body.reason),
        bookingSource: body.bookingSource,
      },
    }, this.key(key));
    const booking = await this.management.get(result.familyBookingId);
    return result.replayed ? { booking, replayed: true } : { booking, replayed: false, qrToken: result.qrToken, qrExpiresAt: result.qrExpiresAt };
  }

  /**
   * 관리자 예약 상세
   */
  @Get("admin/family-bookings/:familyBookingId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public get(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.management.get(id); }

  /**
   * 관리자 예약 변경
   */
  @Patch("admin/family-bookings/:familyBookingId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public update(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: AdminUpdateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) { return this.management.update(id, body, actor.subject, this.key(key)); }

  /**
   * 테스트 예약 전용 캠퍼스 변경. 캠퍼스별 문자 발송 확인을 위해 리허설 예약을 옮김
   */
  @Post("admin/family-bookings/:familyBookingId/test-branch") @HttpCode(200) @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public changeTestBranch(
    @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: TestBranchDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ) { return this.management.changeTestBookingBranch(id, body.branch, actor.subject, this.key(key)); }

  /**
   * 테스트 예약 전용 입장 취소. 실제 입장 기록은 되돌릴 수 없음(서비스가 테스트 여부 강제)
   */
  @Post("admin/family-bookings/:familyBookingId/check-in-rollback") @HttpCode(200) @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  public rollbackCheckIn(
    @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ) { return this.management.rollbackCheckIn(id, actor.subject, this.key(key)); }

  /**
   * 관리자 예약 취소
   */
  @Post("admin/family-bookings/:familyBookingId/cancel") @HttpCode(200) @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public cancel(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: AdminCancelDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) { return this.management.cancel(id, body.expectedVersion, body.cancellationType, actor.subject, this.key(key)); }

  /**
   * 예약 이벤트 커서 조회
   */
  @Get("admin/family-bookings/:familyBookingId/events") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public events(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Query() query: CursorQuery) { return this.management.bookingEvents(id, query.afterSequence, query.limit); }

  /**
   * 예약 입장 이벤트 커서 조회
   */
  @Get("admin/family-bookings/:familyBookingId/check-in-events") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public checkIns(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Query() query: CursorQuery) { return this.management.checkInEvents(id, query.afterSequence, query.limit); }

  /**
   * Idempotency-Key 헤더 확인(8~200자)
   *
   * @throws {DomainError} 400 IDEMPOTENCY_KEY_REQUIRED
   */
  private key(value?: string): string { if (value === undefined || value.length < 8 || value.length > 200) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required."); return value; }

  /**
   * 예약 증명 헤더 필수 확인
   *
   * @throws {DomainError} 401 BOOKING_PROOF_INVALID 빈 값
   */
  private proof(value: string): string {
    if (value.trim().length === 0) {
      throw new DomainError(401, "BOOKING_PROOF_INVALID", "The booking proof is invalid or expired.");
    }
    return value;
  }
}
