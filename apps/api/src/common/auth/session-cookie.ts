import type { CookieOptions } from "express";
import type { AppEnvironment } from "../config/environment.js";

/**
 * 세션 쿠키 이름
 */
export const SESSION_COOKIE_NAME = "npr_seminar_session";

/**
 * 이전 관리자 전용 세션 쿠키 이름. 로그아웃 시 함께 지우기 위해 유지
 */
export const LEGACY_SESSION_COOKIE_NAME = "npr_admin_session";

/**
 * 세션 쿠키 속성
 *
 * HttpOnly·SameSite=Lax·경로 전체. production에서만 Secure
 */
export function sessionCookieOptions(environment: AppEnvironment): CookieOptions {
  return {
    httpOnly: true,
    secure: environment.appEnv === "production",
    sameSite: "lax",
    path: "/",
  };
}
