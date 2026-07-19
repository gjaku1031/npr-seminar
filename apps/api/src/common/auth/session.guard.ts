import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { type Request } from "express";
import { DomainError } from "../errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class SessionGuard implements CanActivate {
  public constructor(private readonly prisma: PrismaService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const actor = request.session.actor;
    if (actor === undefined || request.session.absoluteExpiresAt === undefined) {
      throw new DomainError(401, "SESSION_REQUIRED", "An authenticated session is required.");
    }
    if (request.session.absoluteExpiresAt <= Date.now()) {
      request.session.destroy(() => undefined);
      throw new DomainError(401, "SESSION_EXPIRED", "The session has expired.");
    }
    if (actor.role === "SCANNER") {
      if (actor.scannerDeviceId === undefined) throw new DomainError(401, "SCANNER_SESSION_INVALID", "The scanner session is invalid.");
      const active = await this.prisma.scannerDevice.count({
        where: { publicId: actor.scannerDeviceId, status: "ACTIVE" },
      });
      if (active !== 1) throw new DomainError(401, "SCANNER_DEVICE_REVOKED", "The scanner device is unavailable.");
    }
    return true;
  }
}
