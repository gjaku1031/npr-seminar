import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { DomainError } from "../../common/errors/domain-error.js";

/**
 * 예약 증명 헤더 필수 가드
 *
 * x-booking-proof가 base64url 43자 형식인지만 확인. 유효성·만료는 서비스가 DB로 확인
 */
@Injectable()
export class BookingProofRequiredGuard implements CanActivate {
  /**
   * 예약 증명 헤더 형식 확인
   *
   * @throws {DomainError} 401 BOOKING_PROOF_INVALID
   */
  public canActivate(context: ExecutionContext): boolean {
    const proof = context.switchToHttp().getRequest<Request>().get("x-booking-proof");
    if (proof === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(proof)) {
      throw new DomainError(401, "BOOKING_PROOF_INVALID", "The booking proof is invalid or expired.");
    }
    return true;
  }
}
