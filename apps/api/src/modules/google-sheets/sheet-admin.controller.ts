import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { SheetAdminService } from "./sheet-admin.service.js";

class DeliveryQueryDto {
  @IsOptional() @IsString() public status?: string;
  @IsOptional() @IsUUID() public seminarSessionId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) public limit?: number;
}

@Controller("api/v1/admin/sheets")
@UseGuards(SessionGuard, RolesGuard)
@Roles("ADMIN")
export class SheetAdminController {
  public constructor(private readonly service: SheetAdminService) {}

  @Get("readiness") public readiness() { return this.service.readiness(); }
  @Get("mappings") public mappings() { return this.service.mappings(); }
  @Get("deliveries") public deliveries(@Query() query: DeliveryQueryDto) { return this.service.deliveries(query); }
  @Get("deliveries/:deliveryId") public delivery(@Param("deliveryId", new ParseUUIDPipe({ version: "4" })) id: string) { return this.service.delivery(id); }
}
