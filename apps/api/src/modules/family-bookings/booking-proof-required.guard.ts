import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { DomainError } from "../../common/errors/domain-error.js";

@Injectable()
export class BookingProofRequiredGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const proof = context.switchToHttp().getRequest<Request>().get("x-booking-proof");
    if (proof === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(proof)) {
      throw new DomainError(401, "BOOKING_PROOF_INVALID", "The booking proof is invalid or expired.");
    }
    return true;
  }
}
