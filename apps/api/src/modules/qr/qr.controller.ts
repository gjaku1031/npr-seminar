import { Body, Controller, Delete, Headers, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { CurrentActor } from "../../common/auth/current-actor.decorator.js";
import { type AuthenticatedActor } from "../../common/auth/authenticated-actor.js";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { QrService } from "./qr.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";

class ReasonDto { @IsString() @Length(3, 500) public reason!: string; }

@Controller("api/v1/admin/family-bookings/:familyBookingId/qr")
@UseGuards(SessionGuard, RolesGuard, CsrfGuard)
@Roles("ADMIN")
export class QrController {
  public constructor(private readonly service: QrService) {}

  @Post("rotation")
  @HttpCode(200)
  @SensitiveResponse()
  public rotate(
    @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: ReasonDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.service.rotate(id, actor.subject, body.reason, this.key(key));
  }

  @Delete()
  public revoke(
    @Param("familyBookingId", new ParseUUIDPipe({ version: "4" })) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: ReasonDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.service.revoke(id, actor.subject, body.reason, this.key(key));
  }

  private key(value: string | undefined): string {
    if (value === undefined || value.length < 8 || value.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
    return value;
  }
}
