import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { SheetAdminService } from "./sheet-admin.service.js";

/**
 * 시트 반영 이력 조회 쿼리
 */
class DeliveryQueryDto {
  /**
   * 반영 상태
   */
  @IsOptional() @IsString() public status?: string;

  /**
   * 회차 공개 ID
   */
  @IsOptional() @IsUUID() public seminarSessionId?: string;

  /**
   * 조회 건수. 1~200, 기본 50
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

/**
 * 관리자 시트 반영 상태 조회 API. 읽기 전용
 */
@Controller("api/v1/admin/sheets")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class SheetAdminController {
  /**
   * 시트 관리 서비스 주입
   */
  public constructor(private readonly service: SheetAdminService) {}

  /**
   * 시트 반영 준비 상태
   */
  @Get("readiness") public readiness() { return this.service.readiness(); }

  /**
   * 회차별 시트 매핑 목록
   */
  @Get("mappings") public mappings() { return this.service.mappings(); }

  /**
   * 반영 대기열 목록
   */
  @Get("deliveries") public deliveries(@Query() query: DeliveryQueryDto) { return this.service.deliveries(query); }

  /**
   * 반영 1건과 시도 기록
   */
  @Get("deliveries/:deliveryId") public delivery(@Param("deliveryId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.delivery(id); }
}
