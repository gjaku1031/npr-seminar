import type { CookieOptions } from "express";
import type { AppEnvironment } from "../config/environment.js";

export const SESSION_COOKIE_NAME = "npr_seminar_session";
export const LEGACY_SESSION_COOKIE_NAME = "npr_admin_session";

export function sessionCookieOptions(environment: AppEnvironment): CookieOptions {
  return {
    httpOnly: true,
    secure: environment.appEnv === "production",
    sameSite: "lax",
    path: "/",
  };
}
