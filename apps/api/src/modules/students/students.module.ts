import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { StudentsController } from "./students.controller.js";
import { StudentsService } from "./students.service.js";
import { FamilyBookingsModule } from "../family-bookings/family-bookings.module.js";

/**
 * 학생 조회 모듈. 공개 검색의 예약 증명 확인에 예약 모듈 사용
 */
@Module({ imports: [AdminAuthModule, FamilyBookingsModule], controllers: [StudentsController], providers: [StudentsService] })
export class StudentsModule {}
