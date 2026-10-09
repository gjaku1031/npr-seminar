import { SetMetadata } from "@nestjs/common";
import { type AuthenticatedActor } from "./authenticated-actor.js";

/**
 * 허용 역할 메타데이터 키
 */
export const ROLES_KEY = "npr:roles";

/**
 * 핸들러·컨트롤러에 허용 역할 지정. RolesGuard가 읽음
 */
export const Roles = (...roles: readonly AuthenticatedActor["role"][]) => SetMetadata(ROLES_KEY, roles);
