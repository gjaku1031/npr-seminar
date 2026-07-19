import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Request } from "express";
import { DomainError } from "../errors/domain-error.js";
import { type AuthenticatedActor } from "./authenticated-actor.js";
import { ROLES_KEY } from "./roles.decorator.js";

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

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
