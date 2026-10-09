import { Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import type { Request } from "express";
import { OtpService } from "./otp.service.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";

/**
 * OTP 요청 본문
 */
class ChallengeDto {
  /**
   * 연락처. 8~40자
   */
  @IsString() @Length(8, 40) public contact!: string;

  /**
   * 용도. 새 예약 또는 기존 예약 관리
   */
  @IsIn(["FAMILY_BOOKING", "BOOKING_MANAGE"]) public purpose!: string;

  /**
   * 선택 캠퍼스. 새 예약 학생 검색 범위
   */
  @IsOptional() @IsIn(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]) public branch?: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
}

/**
 * OTP 확인 본문. 6자리 숫자
 */
class VerifyDto { @Matches(/^\d{6}$/) public oneTimeCode!: string; }

/**
 * 공개 OTP API. 연락처 소유 확인 후 예약 증명 발급
 */
@Controller("api/v1/public/otp/challenges")
export class OtpController {
  /**
   * OTP 서비스 주입
   */
  public constructor(private readonly service: OtpService) {}

  /**
   * OTP 발송 요청. CSRF·Idempotency-Key 필수
   */
  @Post() @UseGuards(CsrfGuard) @SensitiveResponse()
  public create(@Req() request: Request, @Body() body: ChallengeDto, @Headers("idempotency-key") key?: string) {
    return this.service.create(request, body.contact, body.purpose as "FAMILY_BOOKING" | "BOOKING_MANAGE", this.key(key), body.branch);
  }

  /**
   * OTP 확인 후 예약 증명 발급
   */
  @Post(":challengeId/verify") @HttpCode(200) @UseGuards(CsrfGuard) @SensitiveResponse()
  public verify(@Req() request: Request, @Param("challengeId", new ParseUUIDPipe({ version: "4" })) id: string, @Body() body: VerifyDto, @Headers("idempotency-key") key?: string) {
    return this.service.verify(request, id, body.oneTimeCode, this.key(key));
  }

  /**
   * Idempotency-Key 헤더 확인(8~200자)
   *
   * @throws {DomainError} 400 IDEMPOTENCY_KEY_REQUIRED
   */
  private key(value?: string): string {
    if (value === undefined || value.length < 8 || value.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
    return value;
  }
}
