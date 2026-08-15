import { Module } from "@nestjs/common";
import { CsrfGuard } from "../../common/auth/csrf.guard.js";
import { IdempotencyModule } from "../../common/idempotency/idempotency.module.js";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { BookingProofRequiredGuard } from "../family-bookings/booking-proof-required.guard.js";
import { FamilyBookingsModule } from "../family-bookings/family-bookings.module.js";
import { PublicSurveysController } from "./surveys.controller.js";
import { AdminSurveysController } from "./admin-surveys.controller.js";
import { SurveysService } from "./surveys.service.js";

@Module({
  imports: [AdminAuthModule, FamilyBookingsModule, IdempotencyModule],
  controllers: [PublicSurveysController, AdminSurveysController],
  // 공개 설문 제출은 durable BOOKING_MANAGE 변경이다 — 공개 예약 수정/취소와 동일하게
  // BookingProofRequiredGuard→CsrfGuard(동일 출처 포함) 순으로 서비스 이전에 검증한다.
  // 두 가드는 무상태이므로 FamilyBookingsModule export 를 넓히지 않고 여기서 직접 provide 한다.
  providers: [SurveysService, BookingProofRequiredGuard, CsrfGuard],
})
export class SurveysModule {}
