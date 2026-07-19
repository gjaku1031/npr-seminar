import { SetMetadata } from "@nestjs/common";
import { type AuthenticatedActor } from "./authenticated-actor.js";

export const ROLES_KEY = "npr:roles";
export const Roles = (...roles: readonly AuthenticatedActor["role"][]) => SetMetadata(ROLES_KEY, roles);
