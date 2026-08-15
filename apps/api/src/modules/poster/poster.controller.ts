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

@Controller("api/v1")
export class PosterController {
  public constructor(private readonly service: PosterService) {}

  @Get("public/poster")
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  public current() {
    return this.service.current();
  }

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

  @Put("admin/poster")
  @UseGuards(SessionGuard, RolesGuard, PosterMultipartCsrfGuard)
  @Roles("ADMIN")
  @UseInterceptors(FileInterceptor("poster", {
    limits: {
      fileSize: POSTER_MAX_BYTES,
      files: 1,
      fields: 0,
      // Busboy emits partsLimit when the accepted part count reaches the
      // configured value. Leave one sentinel slot so one file is accepted;
      // files/fields still enforce the exact one-file, zero-field contract.
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

  private key(value: string | undefined): string {
    if (value === undefined || value.length < 8 || value.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
    return value;
  }
}
