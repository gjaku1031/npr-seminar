import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import type { Request } from "express";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { BookingAccessService } from "./booking-access.service.js";

export class BookingAccessExchangeDto {
  // Format validation intentionally lives behind BookingAccessService's IP
  // limiter so malformed attempts cannot bypass rate limiting and audit.
  @IsString() @Length(1, 200) public accessToken!: string;
  @IsString() @Length(8, 40) public contact!: string;
}

@Controller("api/v1/public/booking-access")
export class BookingAccessController {
  public constructor(private readonly service: BookingAccessService) {}

  @Post("session")
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @SensitiveResponse()
  public exchange(
    @Req() request: Request,
    @Body() body: BookingAccessExchangeDto,
    @Headers("idempotency-key") key?: string,
  ) {
    return this.service.exchange(request, body.accessToken, body.contact, this.key(key));
  }

  private key(value?: string): string {
    if (value === undefined || value.length < 8 || value.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
    return value;
  }
}
