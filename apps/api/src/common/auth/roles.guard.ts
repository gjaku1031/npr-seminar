import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Request } from "express";
import { DomainError } from "../errors/domain-error.js";
import { type AuthenticatedActor } from "./authenticated-actor.js";
import { ROLES_KEY } from "./roles.decorator.js";

/**
 * Roles 메타데이터 기반 역할 검사 가드
 *
 * 핸들러 지정값이 컨트롤러 지정값보다 우선. 지정이 없거나 빈 목록이면 통과
 */
@Injectable()
export class RolesGuard implements CanActivate {
  /**
   * 메타데이터 조회기 주입
   */
  public constructor(private readonly reflector: Reflector) {}

  /**
   * 세션 주체 역할이 허용 목록에 있는지 확인
   *
   * @throws {DomainError} 403 주체 없음 또는 역할 불일치
   */
  public canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly AuthenticatedActor["role"][]>(ROLES_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (required === undefined || required.length === 0) return true;
    const actor = context.switchToHttp().getRequest<Request>().session.actor;
    if (actor === undefined || !required.includes(actor.role)) {
      throw new DomainError(403, "NOT_AUTHORIZED", "The session is not authorized for this operation.");
    }
    return true;
  }
}
