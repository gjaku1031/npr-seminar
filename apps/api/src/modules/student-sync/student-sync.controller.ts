import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { CurrentActor } from "../../common/auth/current-actor.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import type { AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { OfflineSnapshotService } from "./offline-snapshot.service.js";
import { StudentSyncAdminService } from "./student-sync-admin.service.js";

/**
 * 초기 학생 스냅샷 파일 경로. 초기 이관 시점에 고정
 */
const SNAPSHOT_PATH = "/var/lib/npr-seminar/tongtong/snapshots/20260717-143745";

/**
 * 수동 실행 사유 본문. reason 3~500자
 */
class ReasonDto { @IsString() @Length(3, 500) public reason!: string; }

/**
 * 초기 스냅샷 반영 확인 본문
 */
class PublishDto {
  /**
   * 반영할 사전 점검 실행 ID
   */
  @IsUUID() public runId!: string;

  /**
   * 확인 문구 `PUBLISH INITIAL SNAPSHOT {실행 ID}`
   */
  @Matches(/^PUBLISH INITIAL SNAPSHOT [0-9a-fA-F-]{36}$/) public confirmationText!: string;
}

/**
 * 동기화 회로 초기화 본문
 */
class ResetDto {
  /**
   * 확인 문구. 서비스가 정확한 값 검사
   */
  @IsString() public confirmationText!: string;

  /**
   * 사유. 10~1000자
   */
  @IsString() @Length(10, 1000) public reason!: string;
}

/**
 * 실행 목록 페이지 쿼리
 */
class PageQuery {
  /**
   * 실행 상태 필터
   */
  @IsOptional() @IsString() public status?: string;

  /**
   * 페이지 번호. 1부터
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;

  /**
   * 페이지 크기. 1~200, 기본 50
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}

/**
 * 이벤트 커서 쿼리
 */
class CursorQuery {
  /**
   * 실행 ID 필터
   */
  @IsOptional() @IsUUID() public runId?: string;

  /**
   * 이 순번 다음부터 조회
   */
  @IsOptional() @Matches(/^\d+$/) public afterSequence?: string;

  /**
   * 조회 건수. 1~200
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

/**
 * 관리자 학생 동기화 API
 *
 * 상태·실행 이력 조회, 수동 실행, 초기 스냅샷 점검·반영, 회로 상태 조회·초기화
 */
@Controller("api/v1/admin/student-sync")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class StudentSyncController {
  /**
   * 의존성 주입. 동기화 관리 서비스와 초기 스냅샷 서비스
   */
  public constructor(private readonly admin: StudentSyncAdminService, private readonly offline: OfflineSnapshotService) {}

  /**
   * 동기화 상태 요약
   */
  @Get("status") @SensitiveResponse()
  public status() { return this.admin.status(); }

  /**
   * 실행 목록
   */
  @Get("runs") public runs(@Query() query: PageQuery) { return this.admin.list(query.status, query.page, query.pageSize); }

  /**
   * 실행 1건
   */
  @Get("runs/:runId") public run(@Param("runId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.admin.get(id); }

  /**
   * 수동 동기화 실행 요청. 202 후 결과는 실행 상태로 확인
   */
  @Post("runs/manual") @HttpCode(202) @UseGuards(CsrfGuard)
  public manual(
    @Body() body: ReasonDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ) { return this.admin.manual(body.reason, actor.subject, this.key(key)); }

  /**
   * 초기 스냅샷 사전 점검. DB 반영 없이 검증·요약
   */
  @Post("initial-snapshot/dry-runs") @HttpCode(202) @UseGuards(CsrfGuard)
  public async dryRun(@Body() _body: ReasonDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    this.key(key);
    const result = await this.offline.dryRun(SNAPSHOT_PATH, actor.subject);
    return this.admin.get(result.runId);
  }

  /**
   * 초기 스냅샷 반영
   *
   * 경로의 실행 ID와 본문 실행 ID·확인 문구가 모두 일치해야 함
   *
   * @throws {DomainError} 400 확인 문구 불일치
   */
  @Post("initial-snapshot/dry-runs/:runId/publish") @HttpCode(200) @UseGuards(CsrfGuard)
  public async publish(
    @Param("runId", new ParseUUIDPipe({ version: "4" })) runId: string,
    @Body() body: PublishDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    this.key(key);
    if (body.runId !== runId || body.confirmationText !== `PUBLISH INITIAL SNAPSHOT ${runId}`) {
      throw new DomainError(400, "INITIAL_PUBLISH_CONFIRMATION_REQUIRED", "The publish confirmation is invalid.");
    }
    await this.offline.publish(SNAPSHOT_PATH, runId, body.confirmationText, actor.subject);
    return this.admin.get(runId);
  }

  /**
   * 실행 이벤트 커서 조회
   */
  @Get("events") public events(@Query() query: CursorQuery) { return this.admin.events(query.runId, query.afterSequence, query.limit); }

  /**
   * 회로 상태
   */
  @Get("circuit") public circuit() { return this.admin.circuit(); }

  /**
   * 회로 초기화. 확인 문구·사유 필수
   */
  @Post("circuit/reset") @HttpCode(200) @UseGuards(CsrfGuard)
  public reset(@Body() body: ResetDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.admin.resetCircuit(body.confirmationText, body.reason, actor.subject, this.key(key));
  }

  /**
   * 회로 이벤트 커서 조회
   */
  @Get("circuit/events") public circuitEvents(@Query() query: CursorQuery) { return this.admin.circuitEvents(query.afterSequence, query.limit); }

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
