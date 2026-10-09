import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { type Request } from "express";
import { type AuthenticatedActor } from "./authenticated-actor.js";

/**
 * 컨트롤러 인자로 현재 세션의 인증 주체 주입
 *
 * SessionGuard 통과 후에만 사용. 세션에 주체가 있다고 가정함
 */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedActor => {
  const request = context.switchToHttp().getRequest<Request>();
  return request.session.actor!;
});
