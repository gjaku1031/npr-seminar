import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { CurrentActor } from "../../common/auth/current-actor.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import type { AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { SmsAdminService } from "./sms-admin.service.js";
import { SMS_TEMPLATE_PURPOSES, type SmsTemplatePurpose } from "./sms-template-policy.js";

const branches = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"] as const;
const audiences = ["BOOKED_FAMILIES", "RESERVED_FAMILIES", "CHECKED_IN_FAMILIES", "CANCELLED_FAMILIES", "TEST_ACCOUNTS"] as const;
const messageStatuses = [
  "PENDING", "CLAIMED", "SENDING", "SENT", "BLOCKED_DISABLED", "BLOCKED_ALLOWLIST",
  "FAILED_PERMANENT", "DELIVERY_UNKNOWN", "DEAD", "CANCELLED",
] as const;

/** 새 템플릿 본문과 {@link SMS_TEMPLATE_PURPOSES} 용도를 검증하는 요청 본문. */
class CreateTemplateDto {
  @IsString() @Matches(/^[A-Z0-9_]{3,80}$/) public key!: string;
  @IsString() @Length(1, 160) public name!: string;
  /** {@link SMS_TEMPLATE_PURPOSES}에 포함된 저장 용도. */
  @IsIn(SMS_TEMPLATE_PURPOSES) public purpose!: SmsTemplatePurpose;
  @IsOptional() @IsString() @Length(1, 200) public title?: string;
  @IsString() @Length(1, 2000) public body!: string;
  @IsOptional() @IsBoolean() public isDefault?: boolean;
}

/** 기존 템플릿의 선택 변경과 필수 버전을 검증하는 요청 본문. */
class UpdateTemplateDto {
  @IsOptional() @IsString() @Length(1, 160) public name?: string;
  /** 변경 시 {@link SMS_TEMPLATE_PURPOSES}에 포함되어야 하는 용도. */
  @IsOptional() @IsIn(SMS_TEMPLATE_PURPOSES) public purpose?: SmsTemplatePurpose;
  @IsOptional() @ValidateIf((_object, value) => value !== null) @IsString() @Length(1, 200) public title?: string | null;
  @IsOptional() @IsString() @Length(1, 2000) public body?: string;
  @IsOptional() @IsBoolean() public active?: boolean;
  @IsOptional() @IsBoolean() public isDefault?: boolean;
  @IsString() @Matches(/^\d+$/) public version!: string;
}

class TargetCountsQueryDto {
  @IsIn(branches) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
  @IsUUID() public seminarSessionId!: string;
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
  /** 예약 발송 시각(ISO 8601). 생략하면 즉시 발송. 과거·너무 먼 미래는 서비스가 거절한다. */
  @IsOptional() @IsISO8601() public scheduledAt?: string;
}

/** 관리자 발송 이력의 선택 필터와 조회 한도를 검증하는 쿼리. */
class HistoryQueryDto {
  @IsOptional() @IsIn(messageStatuses) public status?: string;
  /** 문자 발송 출처 필터. 서버가 처리하는 모든 용도를 허용한다. */
  @IsOptional() @IsIn(SMS_TEMPLATE_PURPOSES) public source?: SmsTemplatePurpose;
  @IsOptional() @IsIn(branches) public branch?: string;
  @IsOptional() @IsUUID() public seminarSessionId?: string;
  @IsOptional() @IsUUID() public batchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

/** 관리자 문자 API. 모든 경로는 세션과 ADMIN 권한 검사를 거친다. */
@Controller("api/v1/admin/sms")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class SmsAdminController {
  public constructor(private readonly service: SmsAdminService) {}

  @Get("gateway-readiness")
  public readiness() { return this.service.readiness(); }

  /** 관리자에게 편집 가능한 용도와 변수 정책을 반환한다. 권한은 클래스 가드가 검사한다. */
  @Get("template-policy")
  public templatePolicy() { return this.service.templatePolicy(); }

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

  /** 대상별 수신 인원 — 읽기 전용. previewToken 을 만들지 않으므로 발송 자격이 생기지 않는다. */
  @Get("targets/counts")
  public counts(@Query() query: TargetCountsQueryDto) {
    return this.service.audienceCounts({ branch: query.branch, seminarSessionId: query.seminarSessionId });
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

  /** 예약 발송 취소 — 아직 나가지 않은 건만. 이미 발송된 문자는 되돌릴 수 없다. */
  @Post("sends/:batchId/cancel")
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  public cancelBatch(
    @Param("batchId", new ParseUUIDPipe({ version: "4" })) batchId: string,
    @CurrentActor() actor: AuthenticatedActor,
    @Headers("idempotency-key") key = "",
  ) {
    return this.service.cancelScheduledBatch(batchId, actor.subject, key);
  }

  @Get("messages")
  public history(@Query() query: HistoryQueryDto) { return this.service.history(query); }

  @Get("messages/:messageId")
  public detail(@Param("messageId", new ParseUUIDPipe({ version: "4" })) messageId: string) {
    return this.service.detail(messageId);
  }
}
