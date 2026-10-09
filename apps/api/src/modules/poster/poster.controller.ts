import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createReadStream } from "node:fs";
import type { Response } from "express";
import { Roles } from "../../common/auth/roles.decorator.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { SessionGuard } from "../../common/auth/session.guard.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { SensitiveResponse } from "../../common/http/sensitive-response.decorator.js";
import { PosterMultipartCsrfGuard } from "./poster-multipart-csrf.guard.js";
import { POSTER_MAX_BYTES, type PosterUploadFile, PosterService } from "./poster.service.js";

/**
 * 설명회 포스터 공개 조회·관리자 교체 API
 */
@Controller("api/v1")
export class PosterController {
  /**
   * 포스터 서비스 주입
   */
  public constructor(private readonly service: PosterService) {}

  /**
   * 현재 포스터 정보 조회. 교체 즉시 반영되도록 캐시 금지
   */
  @Get("public/poster")
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  public current() {
    return this.service.current();
  }

  /**
   * 버전별 포스터 이미지 전송
   *
   * 버전이 내용 해시라 1년 immutable 캐시. ETag·Last-Modified 조건부 요청이면 304
   */
  @Get("public/poster/image/:version")
  public async asset(
    @Param("version") version: string,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Headers("if-modified-since") ifModifiedSince: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile | void> {
    const asset = await this.service.asset(version);
    response.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: asset.etag,
      "Last-Modified": asset.lastModified.toUTCString(),
      "Content-Type": asset.mediaType,
      "Content-Length": asset.sizeBytes.toString(),
    });
    if (this.service.isNotModified(ifNoneMatch, ifModifiedSince, asset)) {
      response.removeHeader("Content-Length");
      response.status(304).end();
      return;
    }
    return new StreamableFile(createReadStream(asset.path));
  }

  /**
   * 관리자 포스터 교체
   *
   * 파일 하나(필드명 poster)만 허용, 일반 필드 금지. Idempotency-Key 필수
   */
  @Put("admin/poster")
  @UseGuards(SessionGuard, RolesGuard, PosterMultipartCsrfGuard)
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor("poster", {
    limits: {
      fileSize: POSTER_MAX_BYTES,
      files: 1,
      fields: 0,
      // Busboy는 허용 파트 수가 설정값에 도달하면 partsLimit을 발생시킴
      // 파일 하나를 받도록 여유 한 칸을 두고, 정확한 파일 1개·필드 0개 계약은 files·fields로 강제
      parts: 2,
      headerPairs: 32,
    },
    preservePath: false,
  }))
  @SensitiveResponse()
  public upload(
    @UploadedFile() file: PosterUploadFile | undefined,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.upload(file, this.key(idempotencyKey));
  }

  /**
   * Idempotency-Key 헤더 확인(8~200자)
   *
   * @throws {DomainError} 400 IDEMPOTENCY_KEY_REQUIRED
   */
  private key(value: string | undefined): string {
    if (value === undefined || value.length < 8 || value.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
    return value;
  }
}
