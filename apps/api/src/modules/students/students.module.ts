import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { StudentsController } from "./students.controller.js";
import { StudentsService } from "./students.service.js";
import { FamilyBookingsModule } from "../family-bookings/family-bookings.module.js";

@Module({ imports: [AdminAuthModule, FamilyBookingsModule], controllers: [StudentsController], providers: [StudentsService] })
export class StudentsModule {}
