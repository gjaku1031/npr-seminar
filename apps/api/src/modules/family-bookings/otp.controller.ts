import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import type { Request } from "express";
import { OtpService } from "./otp.service.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";

class ChallengeDto {
  @IsString() @Length(8, 40) public contact!: string;
  @IsIn(["FAMILY_BOOKING", "BOOKING_MANAGE"]) public purpose!: string;
  @IsOptional() @IsIn(["SONGPA", "WIRYE", "GWANGJIN"]) public branch?: "SONGPA" | "WIRYE" | "GWANGJIN";
}
class VerifyDto { @Matches(/^\d{6}$/) public oneTimeCode!: string; }

@Controller("api/v1/public/otp/challenges")
export class OtpController {
  public constructor(private readonly service: OtpService) {}

  @Post() @UseGuards(CsrfGuard) @SensitiveResponse()
  public create(@Req() request: Request, @Body() body: ChallengeDto, @Headers("idempotency-key") key?: string) {
    return this.service.create(request, body.contact, body.purpose as "FAMILY_BOOKING" | "BOOKING_MANAGE", this.key(key), body.branch);
  }

  @Post(":challengeId/verify") @HttpCode(200) @UseGuards(CsrfGuard) @SensitiveResponse()
  public verify(@Req() request: Request, @Param("challengeId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: VerifyDto, @Headers("idempotency-key") key?: string) {
    return this.service.verify(request, id, body.oneTimeCode, this.key(key));
  }

  private key(value?: string): string {
    if (value === undefined || value.length < 8 || value.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
    return value;
  }
}
