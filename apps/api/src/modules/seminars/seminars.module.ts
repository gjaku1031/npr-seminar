import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SeminarsController } from "./seminars.controller.js";
import { SeminarsService } from "./seminars.service.js";

@Module({ imports: [AdminAuthModule], controllers: [SeminarsController], providers: [SeminarsService] })
export class SeminarsModule {}
