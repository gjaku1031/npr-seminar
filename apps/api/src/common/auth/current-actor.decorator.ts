import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { type Request } from "express";
import { type AuthenticatedActor } from "./authenticated-actor.js";

export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedActor => {
  const request = context.switchToHttp().getRequest<Request>();
  return request.session.actor!;
});
