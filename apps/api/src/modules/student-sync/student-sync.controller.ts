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

const SNAPSHOT_PATH = "/var/lib/npr-seminar/tongtong/snapshots/20260717-143745";
class ReasonDto { @IsString() @Length(3, 500) public reason!: string; }
class PublishDto {
  @IsUUID() public runId!: string;
  @Matches(/^PUBLISH INITIAL SNAPSHOT [0-9a-fA-F-]{36}$/) public confirmationText!: string;
}
class ResetDto {
  @IsString() public confirmationText!: string;
  @IsString() @Length(10, 1000) public reason!: string;
}
class PageQuery {
  @IsOptional() @IsString() public status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) public page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public pageSize = 50;
}
class CursorQuery {
  @IsOptional() @IsUUID() public runId?: string;
  @IsOptional() @Matches(/^\d+$/) public afterSequence?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

@Controller("api/v1/admin/student-sync")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class StudentSyncController {
  public constructor(private readonly admin: StudentSyncAdminService, private readonly offline: OfflineSnapshotService) {}

  @Get("status") @SensitiveResponse()
  public status() { return this.admin.status(); }
  @Get("runs") public runs(@Query() query: PageQuery) { return this.admin.list(query.status, query.page, query.pageSize); }
  @Get("runs/:runId") public run(@Param("runId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.admin.get(id); }

  @Post("runs/manual") @HttpCode(202) @UseGuards(CsrfGuard)
  public manual(
    @Body() body: ReasonDto,
    @Headers("idempotency-key") key: string | undefined,
    @CurrentActor() actor: AuthenticatedActor,
  ) { return this.admin.manual(body.reason, actor.subject, this.key(key)); }

  @Post("initial-snapshot/dry-runs") @HttpCode(202) @UseGuards(CsrfGuard)
  public async dryRun(@Body() _body: ReasonDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    this.key(key);
    const result = await this.offline.dryRun(SNAPSHOT_PATH, actor.subject);
    return this.admin.get(result.runId);
  }

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

  @Get("events") public events(@Query() query: CursorQuery) { return this.admin.events(query.runId, query.afterSequence, query.limit); }
  @Get("circuit") public circuit() { return this.admin.circuit(); }

  @Post("circuit/reset") @HttpCode(200) @UseGuards(CsrfGuard)
  public reset(@Body() body: ResetDto, @Headers("idempotency-key") key: string | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.admin.resetCircuit(body.confirmationText, body.reason, actor.subject, this.key(key));
  }

  @Get("circuit/events") public circuitEvents(@Query() query: CursorQuery) { return this.admin.circuitEvents(query.afterSequence, query.limit); }

  private key(value?: string): string {
    if (value === undefined || value.length < 8 || value.length > 200) throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    return value;
  }
}
