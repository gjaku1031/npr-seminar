import { Module } from "@nestjs/common";
import { SameOriginGuard } from "../../common/auth/same-origin.guard.js";
import { IdempotencyModule } from "../../common/idempotency/idempotency.module.js";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { FamilyBookingsModule } from "../family-bookings/family-bookings.module.js";
import { PublicSurveysController } from "./surveys.controller.js";
import { AdminSurveysController } from "./admin-surveys.controller.js";
import { SurveysService } from "./surveys.service.js";

@Module({
  imports: [AdminAuthModule, FamilyBookingsModule, IdempotencyModule],
  controllers: [PublicSurveysController, AdminSurveysController],
  providers: [SurveysService, SameOriginGuard],
})
export class SurveysModule {}
