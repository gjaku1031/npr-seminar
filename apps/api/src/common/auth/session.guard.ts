import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { type Request } from "express";
import { DomainError } from "../errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * 인증 세션 필수 가드
 *
 * 1. 주체와 절대 만료 시각 존재 확인
 * 2. 절대 만료가 지났으면 세션 파기 후 거부
 * 3. 스캐너 세션은 기기가 아직 ACTIVE인지 DB에서 매 요청 확인
 */
@Injectable()
export class SessionGuard implements CanActivate {
  /**
   * DB 클라이언트 주입. 스캐너 기기 상태 확인용
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * 세션 유효성 확인
   *
   * @throws {DomainError} 401 세션 없음·만료·스캐너 기기 무효
   */
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
    // 기기 삭제·해제 즉시 기존 스캐너 세션도 차단되도록 매 요청 DB 확인
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
