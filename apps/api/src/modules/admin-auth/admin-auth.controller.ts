import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { IsString, Length } from "class-validator";
import { type Request, type Response } from "express";
import type { AppEnvironment } from "../../common/config/environment.js";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { LEGACY_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME, sessionCookieOptions } from "../../common/auth/session-cookie.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";

/**
 * 관리자 로그인 요청 본문
 */
export class LoginRequestDto {
  /**
   * 로그인 ID. 1~120자
   */
  @IsString() @Length(1, 120) public username!: string;

  /**
   * 비밀번호. 5~512자
   */
  @IsString() @Length(5, 512) public password!: string;
}

/**
 * 관리자 인증 API
 *
 * CSRF 토큰 발급, 로그인·로그아웃, 현재 세션 조회
 */
@Controller("api/v1/auth")
export class AdminAuthController {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 인증 서비스
     */
    private readonly service: AdminAuthService,

    /**
     * 실행 환경. 쿠키 속성 계산용
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * 세션 CSRF 토큰 발급. 로그인 전에도 호출 가능
   */
  @Get("csrf")
  @SensitiveResponse()
  public csrf(@Req() request: Request) { return this.service.csrf(request); }

  /**
   * 관리자 로그인
   *
   * CSRF·Idempotency-Key 필수. 성공 시 세션 재생성
   */
  @Post("login")
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @SensitiveResponse()
  public login(@Req() request: Request, @Body() body: LoginRequestDto, @Headers("idempotency-key") key?: string) {
    return this.service.login(request, body.username, body.password, this.key(key));
  }

  /**
   * 로그아웃
   *
   * 세션 파기 후 현재·이전 세션 쿠키를 모두 지움
   */
  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionGuard, CsrfGuard)
  @SensitiveResponse()
  public async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers("idempotency-key") key?: string,
  ): Promise<void> {
    await this.service.logout(request, this.key(key));
    const options = sessionCookieOptions(this.environment);
    response.clearCookie(SESSION_COOKIE_NAME, options);
    response.clearCookie(LEGACY_SESSION_COOKIE_NAME, options);
  }

  /**
   * 현재 세션 주체와 만료 시각 조회
   */
  @Get("me")
  @UseGuards(SessionGuard)
  @SensitiveResponse()
  public me(@Req() request: Request) { return this.service.me(request); }

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
