import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SeminarsController } from "./seminars.controller.js";
import { SeminarsService } from "./seminars.service.js";

/**
 * 설명회·회차 관리 모듈
 */
@Module({ imports: [AdminAuthModule], controllers: [SeminarsController], providers: [SeminarsService] })
export class SeminarsModule {}
