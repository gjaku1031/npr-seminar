import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { CurrentActor } from "../../common/auth/current-actor.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import type { AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { SmsAdminService } from "./sms-admin.service.js";
import type { SmsSource } from "./sms-outbox.service.js";

const branches = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"] as const;
const purposes = ["OTP", "BOOKING_CONFIRMED", "BOOKING_UPDATED", "BOOKING_CANCELLED", "FIRST_CHECK_IN", "ADMIN_GROUP", "SURVEY"] as const;
const audiences = ["BOOKED_FAMILIES", "RESERVED_FAMILIES", "CHECKED_IN_FAMILIES", "CANCELLED_FAMILIES"] as const;
const messageStatuses = [
  "PENDING", "CLAIMED", "SENDING", "SENT", "BLOCKED_DISABLED", "BLOCKED_ALLOWLIST",
  "FAILED_PERMANENT", "DELIVERY_UNKNOWN", "DEAD", "CANCELLED",
] as const;

class CreateTemplateDto {
  @IsString() @Matches(/^[A-Z0-9_]{3,80}$/) public key!: string;
  @IsString() @Length(1, 160) public name!: string;
  @IsIn(purposes) public purpose!: SmsSource;
  @IsOptional() @IsString() @Length(1, 200) public title?: string;
  @IsString() @Length(1, 2000) public body!: string;
  @IsOptional() @IsBoolean() public isDefault?: boolean;
}

class UpdateTemplateDto {
  @IsOptional() @IsString() @Length(1, 160) public name?: string;
  @IsOptional() @IsIn(purposes) public purpose?: SmsSource;
  @IsOptional() @ValidateIf((_object, value) => value !== null) @IsString() @Length(1, 200) public title?: string | null;
  @IsOptional() @IsString() @Length(1, 2000) public body?: string;
  @IsOptional() @IsBoolean() public active?: boolean;
  @IsOptional() @IsBoolean() public isDefault?: boolean;
  @IsString() @Matches(/^\d+$/) public version!: string;
}

class TargetDto {
  @IsIn(branches) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  @IsUUID() public seminarSessionId!: string;
  @IsIn(audiences) public audience!: (typeof audiences)[number];
  @IsOptional() @IsUUID() public templateId?: string;
  @IsOptional() @IsString() @Length(1, 2000) public message?: string;
  @IsOptional() @IsString() @Length(1, 200) public title?: string;
}

class EnqueueDto extends TargetDto {
  @IsString() @Length(20, 100) public previewToken!: string;
}

class HistoryQueryDto {
  @IsOptional() @IsIn(messageStatuses) public status?: string;
  @IsOptional() @IsIn(purposes) public source?: string;
  @IsOptional() @IsIn(branches) public branch?: string;
  @IsOptional() @IsUUID() public seminarSessionId?: string;
  @IsOptional() @IsUUID() public batchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

@Controller("api/v1/admin/sms")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class SmsAdminController {
  public constructor(private readonly service: SmsAdminService) {}

  @Get("gateway-readiness")
  public readiness() { return this.service.readiness(); }

  @Get("templates")
  public listTemplates() { return this.service.listTemplates(); }

  @Post("templates")
  @UseGuards(CsrfGuard)
  public createTemplate(@Body() body: CreateTemplateDto, @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.createTemplate(body, actor.subject, key);
  }

  @Get("templates/:templateId")
  public getTemplate(@Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string) {
    return this.service.getTemplate(templateId);
  }

  @Patch("templates/:templateId")
  @UseGuards(CsrfGuard)
  public updateTemplate(@Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string, @Body() body: UpdateTemplateDto, @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.updateTemplate(templateId, body, actor.subject, key);
  }

  @Delete("templates/:templateId")
  @UseGuards(CsrfGuard)
  public removeTemplate(@Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string, @Headers("if-match") version = "", @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.removeTemplate(templateId, version, actor.subject, key);
  }

  @Post("targets/preview")
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  public preview(@Body() body: TargetDto) { return this.service.preview(body); }

  @Post("sends")
  @HttpCode(202)
  @UseGuards(CsrfGuard)
  public enqueue(@Body() body: EnqueueDto, @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.enqueue(body, actor.subject, key, "ADMIN_GROUP");
  }

  @Post("survey-sends")
  @HttpCode(202)
  @UseGuards(CsrfGuard)
  public enqueueSurvey(@Body() body: EnqueueDto, @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.enqueue(body, actor.subject, key, "SURVEY");
  }

  @Get("messages")
  public history(@Query() query: HistoryQueryDto) { return this.service.history(query); }

  @Get("messages/:messageId")
  public detail(@Param("messageId", new ParseUUIDPipe({ version: "4" })) messageId: string) {
    return this.service.detail(messageId);
  }
}
