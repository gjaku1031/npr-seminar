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

class GuestParticipantDto {
  @IsString() @Length(1, 100) public name!: string;
  @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  @IsString() @Length(1, 200) public schoolName!: string;
  @IsIn(GUEST_GRADES) public grade!: GuestGrade;
}
class PublicCreateDto {
  @IsUUID() public seminarSessionId!: string;
  @IsIn(["MOTHER", "FATHER", "BOTH"]) public attendanceParty!: AttendanceParty;
  @IsIn(["ENROLLED", "GUEST"]) public participantType!: "ENROLLED" | "GUEST";
  @ValidateIf((body: PublicCreateDto) => body.participantType === "GUEST") @IsDefined()
  @ValidateNested() @Type(() => GuestParticipantDto) public guest?: GuestParticipantDto;
}
class PublicUpdateDto {
  @IsInt() @Min(1) public expectedVersion!: number;
  @IsOptional() @IsUUID() public seminarSessionId?: string;
  @IsOptional() @IsIn(["MOTHER", "FATHER", "BOTH"]) public attendanceParty?: AttendanceParty;
}
class CancelDto { @IsInt() @Min(1) public expectedVersion!: number; @IsOptional() @IsString() @MaxLength(500) public reason?: string | null; }
class PublicLookupDto { @IsString() @Length(8, 40) public contact!: string; }
class PublicReadSessionDto { @IsString() @Length(8, 40) public contact!: string; }
export class AdminCreateDto {
  @IsUUID() public seminarSessionId!: string;
  @IsIn(["MOTHER", "FATHER", "BOTH"]) public attendanceParty!: AttendanceParty;
  @IsIn(["ENROLLED", "GUEST"]) public participantType!: "ENROLLED" | "GUEST";
  @ValidateIf((body: AdminCreateDto) => body.participantType === "ENROLLED") @IsDefined()
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsUUID("4", { each: true }) public studentIds?: string[];
  @ValidateIf((body: AdminCreateDto) => body.participantType === "GUEST") @IsDefined()
  @ValidateNested() @Type(() => GuestParticipantDto) public guest?: GuestParticipantDto;
  @IsString() @Length(8, 40) public contact!: string;
  @IsIn(["PHONE", "TEACHER", "ON_SITE"]) public bookingSource!: "PHONE" | "TEACHER" | "ON_SITE";
  @IsOptional() @IsString() @Length(3, 500) public reason?: string;
}
export class AdminUpdateDto extends PublicUpdateDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique()
  @IsUUID("4", { each: true }) public studentIds?: string[];
  @IsString() @Length(3, 500) public reason!: string;
}
export class AdminCancelDto {
  @IsInt() @Min(1) public expectedVersion!: number;
  @IsIn(ADMIN_BOOKING_CANCELLATION_TYPES) public cancellationType!: AdminBookingCancellationType;
}
class ListQuery {
  @IsOptional() @IsUUID() public sessionId?: string;
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: string;
  @IsOptional() @IsIn(["RESERVED", "CHECKED_IN", "CANCELLED", "NO_SHOW"]) public status?: string;
  @IsOptional() @IsString() @MaxLength(100) public query?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}
class CursorQuery { @IsOptional() @Matches(/^\d+$/) public afterSequence?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number; }

export function adminCreateAuditReason(
  bookingSource: "PHONE" | "TEACHER" | "ON_SITE",
  reason?: string,
): string {
  const value = reason?.normalize("NFC").trim() || `ADMIN_CREATE_${bookingSource}`;
  return [...value].slice(0, 500).join("");
}

@Controller("api/v1")
export class FamilyBookingsController {
  public constructor(
    private readonly createService: FamilyBookingsService,
    private readonly management: FamilyBookingsManagementService,
    private readonly lookupService: FamilyBookingLookupService,
    private readonly bookingAccess: BookingAccessService,
  ) {}

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
  @Get("public/family-bookings")
  @SensitiveResponse()
  public publicList(@Headers("x-booking-proof") proof = "") { return this.management.listAuthorized(proof); }
  @Post("public/family-bookings/lookup")
  @HttpCode(200)
  @UseGuards(SameOriginGuard)
  @SensitiveResponse()
  public publicLookup(@Req() request: Request, @Body() body: PublicLookupDto) {
    return this.lookupService.lookup(request, body.contact);
  }
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
  @Get("public/family-bookings/:familyBookingId")
  @SensitiveResponse()
  public publicGet(@Req() request: Request, @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Headers("x-booking-proof") proof = "") { return this.management.getAuthorized(id, proof, request); }
  @Patch("public/family-bookings/:familyBookingId")
  @UseGuards(BookingProofRequiredGuard, CsrfGuard)
  @SensitiveResponse()
  public publicUpdate(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: PublicUpdateDto, @Headers("x-booking-proof") proof = "", @Headers("idempotency-key") key?: string) {
    const requiredProof = this.proof(proof);
    return this.management.update(id, { ...body, reason: "PUBLIC_SELF_SERVICE" }, null, this.key(key), requiredProof);
  }
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
  @Get("public/family-bookings/:familyBookingId/qr")
  @SensitiveResponse()
  public publicQr(@Req() request: Request, @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Headers("x-booking-proof") proof = "") {
    return this.management.recoverQr(id, proof, request);
  }
  @Get("public/qr-pass")
  @SensitiveResponse()
  public qrPass(@Headers("x-qr-token") token?: string) { if (token === undefined) throw new DomainError(401, "QR_REQUIRED", "X-QR-Token is required."); return this.management.qrPass(token); }

  @Get("admin/family-bookings") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public list(@Query() query: ListQuery) { return this.management.list(query); }

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

  @Get("admin/family-bookings/:familyBookingId") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public get(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.management.get(id); }

  @Patch("admin/family-bookings/:familyBookingId") @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public update(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: AdminUpdateDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) { return this.management.update(id, body, actor.subject, this.key(key)); }

  @Post("admin/family-bookings/:familyBookingId/cancel") @HttpCode(200) @UseGuards(SessionGuard, RolesGuard, CsrfGuard) @Roles("ADMIN")
  @SensitiveResponse()
  public cancel(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: AdminCancelDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) { return this.management.cancel(id, body.expectedVersion, body.cancellationType, actor.subject, this.key(key)); }

  @Get("admin/family-bookings/:familyBookingId/events") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public events(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Query() query: CursorQuery) { return this.management.bookingEvents(id, query.afterSequence, query.limit); }
  @Get("admin/family-bookings/:familyBookingId/check-in-events") @UseGuards(SessionGuard, RolesGuard) @Roles("ADMIN")
  public checkIns(@Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string, @Query() query: CursorQuery) { return this.management.checkInEvents(id, query.afterSequence, query.limit); }

  private key(value?: string): string { if (value === undefined || value.length < 8 || value.length > 200) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required."); return value; }
  private proof(value: string): string {
    if (value.trim().length === 0) {
      throw new DomainError(401, "BOOKING_PROOF_INVALID", "The booking proof is invalid or expired.");
    }
    return value;
  }
}
