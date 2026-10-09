import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import type { Request } from "express";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { BookingAccessService } from "./booking-access.service.js";

/**
 * 예약 관리 링크 교환 본문
 */
export class BookingAccessExchangeDto {
  // 형식 검증은 의도적으로 BookingAccessService의 IP 제한 뒤에서 수행
  // 형식이 틀린 시도도 속도 제한과 감사를 우회하지 못하게 함
  /**
   * 예약 관리 링크 토큰. 1~200자
   */
  @IsString() @Length(1, 200) public accessToken!: string;

  /**
   * 예약 연락처. 8~40자
   */
  @IsString() @Length(8, 40) public contact!: string;
}

/**
 * 예약 관리 링크 교환 API
 *
 * 문자로 받은 관리 링크 토큰과 연락처를 확인해 예약 관리 세션 발급
 */
@Controller("api/v1/public/booking-access")
export class BookingAccessController {
  /**
   * 예약 관리 접근 서비스 주입
   */
  public constructor(private readonly service: BookingAccessService) {}

  /**
   * 링크 토큰과 연락처를 예약 관리 세션으로 교환. CSRF·Idempotency-Key 필수
   */
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
