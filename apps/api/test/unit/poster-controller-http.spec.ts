import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RolesGuard } from "../../src/common/auth/roles.guard.js";
import { SessionGuard } from "../../src/common/auth/session.guard.js";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import { ProblemDetailsFilter } from "../../src/common/errors/problem-details.filter.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { PosterController } from "../../src/modules/poster/poster.controller.js";
import { PosterMultipartCsrfGuard } from "../../src/modules/poster/poster-multipart-csrf.guard.js";
import { PosterService } from "../../src/modules/poster/poster.service.js";

/**
 * 테스트 공개 기준 출처
 */
const publicOrigin = "https://seminar.example.test";

/**
 * 세션 CSRF 토큰
 */
const csrfToken = "poster-controller-http-csrf-token";

/**
 * 인증 가드를 대신하는 항상 통과 가드
 */
class AllowGuard implements CanActivate {
  /**
   * 항상 허용
   */
  public canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

/**
 * 서명이 맞는 최소 PNG
 */
function png(): Buffer {
  const value = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(value);
  value.write("IHDR", 12, "ascii");
  return value;
}

// 실제 HTTP multipart 경계
describe("PosterController multipart HTTP boundary", () => {
  // 테스트 Nest 애플리케이션
  let app: INestApplication | undefined;

  // 테스트 서버 주소
  let baseUrl = "";

  // 임시 포스터 저장 디렉터리
  let storageDirectory = "";

  // 임시 저장소와 테스트 서버 기동
  beforeEach(async () => {
    storageDirectory = await mkdtemp(join(tmpdir(), "npr-poster-http-"));
    const environment = {
      posterStorageDir: storageDirectory,
      publicBaseUrl: publicOrigin,
      trustProxy: 1,
    } as AppEnvironment;
    const moduleReference = await Test.createTestingModule({
      controllers: [PosterController],
      providers: [
        PosterService,
        PosterMultipartCsrfGuard,
        { provide: SessionGuard, useClass: AllowGuard },
        { provide: RolesGuard, useClass: AllowGuard },
        { provide: PrismaService, useValue: {} },
        { provide: "APP_ENVIRONMENT", useValue: environment },
      ],
    })
      .overrideGuard(SessionGuard)
      .useClass(AllowGuard)
      .overrideGuard(RolesGuard)
      .useClass(AllowGuard)
      .compile();
    app = moduleReference.createNestApplication();
    app.use((request: Request, _response: Response, next: NextFunction) => {
      request.session = { csrfToken } as Request["session"];
      next();
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  // 서버 종료와 저장소 삭제
  afterEach(async () => {
    await app?.close();
    await rm(storageDirectory, { recursive: true, force: true });
  });

  // poster 필드의 유효한 PNG 하나는 저장 성공
  it("accepts one valid PNG in the documented poster field", async () => {
    const body = new FormData();
    body.append("poster", new Blob([png()], { type: "image/png" }), "poster.png");

    const response = await fetch(`${baseUrl}/api/v1/admin/poster`, {
      method: "PUT",
      headers: {
        Origin: publicOrigin,
        "X-Forwarded-Host": "seminar.example.test",
        "X-Forwarded-Proto": "https",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": "poster-controller-http-key",
      },
      body,
    });
    const payload = await response.json() as { code?: string; poster?: { mediaType?: string; sizeBytes?: number } };

    expect({ status: response.status, payload }).toEqual({
      status: 200,
      payload: { poster: expect.objectContaining({ mediaType: "image/png", sizeBytes: 24 }) },
    });
  });

  // 파일 하나 계약 밖의 multipart 텍스트 필드는 거부
  it("still rejects multipart text fields outside the one-file contract", async () => {
    const body = new FormData();
    body.append("poster", new Blob([png()], { type: "image/png" }), "poster.png");
    body.append("caption", "unexpected");

    const response = await fetch(`${baseUrl}/api/v1/admin/poster`, {
      method: "PUT",
      headers: {
        Origin: publicOrigin,
        "X-Forwarded-Host": "seminar.example.test",
        "X-Forwarded-Proto": "https",
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": "poster-controller-extra-field-key",
      },
      body,
    });
    const payload = await response.json() as { code?: string; detail?: string };

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({ code: "HTTP_REQUEST_REJECTED", detail: "Too many fields" });
  });
});
