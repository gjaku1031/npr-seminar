import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { PosterController } from "./poster.controller.js";
import { PosterMultipartCsrfGuard } from "./poster-multipart-csrf.guard.js";
import { PosterService } from "./poster.service.js";

/**
 * 포스터 모듈
 */
@Module({
  imports: [AdminAuthModule],
  controllers: [PosterController],
  providers: [PosterService, PosterMultipartCsrfGuard],
})
export class PosterModule {}
