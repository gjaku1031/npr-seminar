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

/**
 * 지점 코드 목록
 */
const branches = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"] as const;

/**
 * 관리자 발송 대상 구분 목록
 */
const audiences = ["BOOKED_FAMILIES", "RESERVED_FAMILIES", "CHECKED_IN_FAMILIES", "CANCELLED_FAMILIES", "TEST_ACCOUNTS"] as const;

/**
 * 발송 이력 상태 필터 허용값
 */
const messageStatuses = [
  "PENDING", "CLAIMED", "SENDING", "SENT", "BLOCKED_DISABLED", "BLOCKED_ALLOWLIST",
  "FAILED_PERMANENT", "DELIVERY_UNKNOWN", "DEAD", "CANCELLED",
] as const;

/**
 * 새 템플릿 생성 요청 본문
 */
class CreateTemplateDto {
  /**
   * 템플릿 키. 대문자·숫자·밑줄 3~80자
   */
  @IsString() @Matches(/^[A-Z0-9_]{3,80}$/) public key!: string;

  /**
   * 표시 이름. 1~160자
   */
  @IsString() @Length(1, 160) public name!: string;

  /**
   * 용도. SMS_TEMPLATE_PURPOSES 중 하나
   */
  @IsIn(SMS_TEMPLATE_PURPOSES) public purpose!: SmsTemplatePurpose;

  /**
   * LMS 제목. 생략 시 제목 없음
   */
  @IsOptional() @IsString() @Length(1, 200) public title?: string;

  /**
   * 본문. 1~2,000자
   */
  @IsString() @Length(1, 2000) public body!: string;

  /**
   * 기본 템플릿 지정 여부. 해당 용도의 첫 템플릿은 생략해도 기본이 됨
   */
  @IsOptional() @IsBoolean() public isDefault?: boolean;
}

/**
 * 템플릿 부분 변경 요청 본문. version은 낙관적 잠금용 필수 값
 */
class UpdateTemplateDto {
  /**
   * 표시 이름
   */
  @IsOptional() @IsString() @Length(1, 160) public name?: string;

  /**
   * 용도. 변경 시 SMS_TEMPLATE_PURPOSES 중 하나
   */
  @IsOptional() @IsIn(SMS_TEMPLATE_PURPOSES) public purpose?: SmsTemplatePurpose;

  /**
   * LMS 제목. null이면 제목 제거, 생략이면 유지
   */
  @IsOptional() @ValidateIf((_object, value) => value !== null) @IsString() @Length(1, 200) public title?: string | null;

  /**
   * 본문
   */
  @IsOptional() @IsString() @Length(1, 2000) public body?: string;

  /**
   * 활성 여부
   */
  @IsOptional() @IsBoolean() public active?: boolean;

  /**
   * 기본 템플릿 지정 여부
   */
  @IsOptional() @IsBoolean() public isDefault?: boolean;

  /**
   * 현재 버전(숫자 문자열). 다르면 409
   */
  @IsString() @Matches(/^\d+$/) public version!: string;
}

/**
 * 대상별 수신 인원 조회 쿼리
 */
class TargetCountsQueryDto {
  /**
   * 지점
   */
  @IsIn(branches) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 회차 공개 ID
   */
  @IsUUID() public seminarSessionId!: string;
}

/**
 * 발송 대상과 내용 지정 본문
 *
 * templateId와 직접 입력(message·title) 중 하나만 사용
 */
class TargetDto {
  /**
   * 지점
   */
  @IsIn(branches) public branch!: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

  /**
   * 회차 공개 ID
   */
  @IsUUID() public seminarSessionId!: string;

  /**
   * 대상 구분
   */
  @IsIn(audiences) public audience!: (typeof audiences)[number];

  /**
   * 사용할 템플릿 ID
   */
  @IsOptional() @IsUUID() public templateId?: string;

  /**
   * 직접 입력 본문
   */
  @IsOptional() @IsString() @Length(1, 2000) public message?: string;

  /**
   * 직접 입력 LMS 제목
   */
  @IsOptional() @IsString() @Length(1, 200) public title?: string;
}

/**
 * 발송 등록 본문. 미리보기에서 받은 previewToken 필수
 */
class EnqueueDto extends TargetDto {
  /**
   * 미리보기 결과 토큰. 대상·본문이 바뀌었으면 409
   */
  @IsString() @Length(20, 100) public previewToken!: string;

  /**
   * 예약 발송 시각(ISO 8601). 생략하면 즉시 발송. 과거·180일 초과는 서비스가 거부
   */
  @IsOptional() @IsISO8601() public scheduledAt?: string;
}

/**
 * 발송 이력 조회 필터와 한도
 */
class HistoryQueryDto {
  /**
   * 발송 상태
   */
  @IsOptional() @IsIn(messageStatuses) public status?: string;

  /**
   * 발송 원인 필터. 서버가 처리하는 모든 용도 허용
   */
  @IsOptional() @IsIn(SMS_TEMPLATE_PURPOSES) public source?: SmsTemplatePurpose;

  /**
   * 지점
   */
  @IsOptional() @IsIn(branches) public branch?: string;

  /**
   * 회차 공개 ID
   */
  @IsOptional() @IsUUID() public seminarSessionId?: string;

  /**
   * 발송 배치 ID
   */
  @IsOptional() @IsUUID() public batchId?: string;

  /**
   * 조회 건수. 1~200, 기본 50
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

/**
 * 관리자 문자 API. 모든 경로에 세션과 ADMIN 권한 필요, 변경 요청은 CSRF 추가 확인
 */
@Controller("api/v1/admin/sms")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class SmsAdminController {
  /**
   * 관리자 문자 서비스 주입
   */
  public constructor(private readonly service: SmsAdminService) {}

  /**
   * 문자 발송 설정 상태 조회
   */
  @Get("gateway-readiness")
  public readiness() { return this.service.readiness(); }

  /**
   * 편집 가능한 용도와 변수 정책 조회
   */
  @Get("template-policy")
  public templatePolicy() { return this.service.templatePolicy(); }

  /**
   * 템플릿 전체 목록 조회. 비활성 포함
   */
  @Get("templates")
  public listTemplates() { return this.service.listTemplates(); }

  /**
   * 템플릿 생성
   */
  @Post("templates")
  @UseGuards(CsrfGuard)
  public createTemplate(@Body() body: CreateTemplateDto, @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.createTemplate(body, actor.subject, key);
  }

  /**
   * 템플릿 단건 조회
   */
  @Get("templates/:templateId")
  public getTemplate(@Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string) {
    return this.service.getTemplate(templateId);
  }

  /**
   * 템플릿 변경. 버전 일치 시에만 반영
   */
  @Patch("templates/:templateId")
  @UseGuards(CsrfGuard)
  public updateTemplate(@Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string, @Body() body: UpdateTemplateDto, @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.updateTemplate(templateId, body, actor.subject, key);
  }

  /**
   * 템플릿 삭제. If-Match에 현재 버전 필요, 사용 이력이 있으면 비활성 보관
   */
  @Delete("templates/:templateId")
  @UseGuards(CsrfGuard)
  public removeTemplate(@Param("templateId", new ParseUUIDPipe({ version: "4" })) templateId: string, @Headers("if-match") version = "", @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.removeTemplate(templateId, version, actor.subject, key);
  }

  /**
   * 대상별 수신 인원 조회. 읽기 전용이며 previewToken을 만들지 않아 발송 자격이 생기지 않음
   */
  @Get("targets/counts")
  public counts(@Query() query: TargetCountsQueryDto) {
    return this.service.audienceCounts({ branch: query.branch, seminarSessionId: query.seminarSessionId });
  }

  /**
   * 발송 미리보기. 실제 대상·치환 결과·previewToken 반환
   */
  @Post("targets/preview")
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  public preview(@Body() body: TargetDto) { return this.service.preview(body); }

  /**
   * 발송 등록. 대기열에 적재하고 202 반환, 실제 전송은 워커가 수행
   */
  @Post("sends")
  @HttpCode(202)
  @UseGuards(CsrfGuard)
  public enqueue(@Body() body: EnqueueDto, @CurrentActor() actor: AuthenticatedActor, @Headers("idempotency-key") key = "") {
    return this.service.enqueue(body, actor.subject, key, "ADMIN_GROUP");
  }

  /**
   * 예약 발송 취소. 아직 나가지 않은 건만 취소되며 이미 발송된 문자는 되돌릴 수 없음
   */
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

  /**
   * 발송 이력과 배치 집계 조회
   */
  @Get("messages")
  public history(@Query() query: HistoryQueryDto) { return this.service.history(query); }

  /**
   * 발송 1건과 시도 기록 조회
   */
  @Get("messages/:messageId")
  public detail(@Param("messageId", new ParseUUIDPipe({ version: "4" })) messageId: string) {
    return this.service.detail(messageId);
  }
}
