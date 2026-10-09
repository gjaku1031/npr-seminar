import { Module } from "@nestjs/common";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { BookingCryptoService } from "./booking-crypto.service.js";
import { FamilyBookingsController } from "./family-bookings.controller.js";
import { FamilyBookingsService } from "./family-bookings.service.js";
import { BookingProofService, OtpProofPort } from "./otp-proof.port.js";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { FamilyBookingsManagementService } from "./family-bookings-management.service.js";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { OtpController } from "./otp.controller.js";
import { SmsOutboxModule } from "../sms/sms-outbox.module.js";
import { OtpService } from "./otp.service.js";
import { GoogleSheetsOutboxModule } from "../google-sheets/google-sheets-outbox.module.js";
import { SameOriginGuard } from "../../common/auth/same-origin.guard.js";
import { SessionRosterController } from "./session-roster.controller.js";
import { SessionRosterService } from "./session-roster.service.js";
import { SessionStatisticsService } from "./session-statistics.service.js";
import { BookingAccessController } from "./booking-access.controller.js";
import { BookingAccessService } from "./booking-access.service.js";
import { QrTokenProtector } from "./qr-token-protector.service.js";
import { FamilyBookingLookupService } from "./family-booking-lookup.service.js";
import { BookingProofRequiredGuard } from "./booking-proof-required.guard.js";

/**
 * 가족 예약 모듈
 *
 * 공개 예약·OTP·예약 관리 링크·관리자 예약 관리·명단·통계를 제공
 * OtpProofPort는 BookingProofService를 그대로 사용
 */
@Module({
  imports: [AdminAuthModule, SmsOutboxModule, GoogleSheetsOutboxModule],
  controllers: [FamilyBookingsController, OtpController, SessionRosterController, BookingAccessController],
  providers: [
    PhoneProtector,
    BookingCryptoService,
    FamilyBookingsService,
    FamilyBookingsManagementService,
    OtpService,
    SameOriginGuard,
    BookingProofService,
    CsrfGuard,
    SessionRosterService,
    SessionStatisticsService,
    BookingAccessService,
    QrTokenProtector,
    FamilyBookingLookupService,
    BookingProofRequiredGuard,
    { provide: OtpProofPort, useExisting: BookingProofService },
  ],
  exports: [
    PhoneProtector,
    BookingCryptoService,
    BookingProofService,
    BookingAccessService,
    QrTokenProtector,
    FamilyBookingsService,
    FamilyBookingsManagementService,
  ],
})
export class FamilyBookingsModule {}
