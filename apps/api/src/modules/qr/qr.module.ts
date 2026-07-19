import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { FamilyBookingsModule } from "../family-bookings/family-bookings.module.js";
import { QrController } from "./qr.controller.js";
import { QrService } from "./qr.service.js";
import { SameOriginGuard } from "../../common/auth/same-origin.guard.js";

@Module({ imports: [AdminAuthModule, FamilyBookingsModule], controllers: [QrController], providers: [QrService, SameOriginGuard], exports: [QrService] })
export class QrModule {}
