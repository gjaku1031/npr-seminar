import { Module } from "@nestjs/common";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { SameOriginGuard } from "../../common/auth/same-origin.guard.js";

/**
 * 관리자 인증 모듈
 *
 * 다른 모듈이 쓰는 세션·역할·CSRF·동일 출처 가드도 함께 제공
 */
@Module({
  controllers: [AdminAuthController],
  providers: [AdminAuthService, CsrfGuard, SameOriginGuard, SessionGuard, RolesGuard],
  exports: [AdminAuthService, CsrfGuard, SameOriginGuard, SessionGuard, RolesGuard],
})
export class AdminAuthModule {}
