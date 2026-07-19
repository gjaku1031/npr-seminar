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

export class LoginRequestDto {
  @IsString() @Length(1, 120) public username!: string;
  @IsString() @Length(5, 512) public password!: string;
}

@Controller("api/v1/auth")
export class AdminAuthController {
  public constructor(
    private readonly service: AdminAuthService,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  @Get("csrf")
  @SensitiveResponse()
  public csrf(@Req() request: Request) { return this.service.csrf(request); }

  @Post("login")
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @SensitiveResponse()
  public login(@Req() request: Request, @Body() body: LoginRequestDto, @Headers("idempotency-key") key?: string) {
    return this.service.login(request, body.username, body.password, this.key(key));
  }

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

  @Get("me")
  @UseGuards(SessionGuard)
  @SensitiveResponse()
  public me(@Req() request: Request) { return this.service.me(request); }

  private key(value?: string): string {
    if (value === undefined || value.length < 8 || value.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
    return value;
  }
}
