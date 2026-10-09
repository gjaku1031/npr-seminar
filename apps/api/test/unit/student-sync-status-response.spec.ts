import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CsrfGuard } from "../../src/common/auth/csrf.guard.js";
import { RolesGuard } from "../../src/common/auth/roles.guard.js";
import { SessionGuard } from "../../src/common/auth/session.guard.js";
import { OfflineSnapshotService } from "../../src/modules/student-sync/offline-snapshot.service.js";
import { StudentSyncAdminService } from "../../src/modules/student-sync/student-sync-admin.service.js";
import { StudentSyncController } from "../../src/modules/student-sync/student-sync.controller.js";

// 학생 동기화 상태 응답 헤더
describe("student sync status response headers", () => {
  // 테스트 Nest 애플리케이션
  let app: INestApplication | undefined;

  // 테스트 서버 주소
  let baseUrl: string;

  // 상태 조회 대역
  const status = vi.fn(() => ({ liveSourceReady: true, circuit: { status: "CLOSED" } }));

  // 관리자 가드를 우회한 테스트 서버 기동
  beforeAll(async () => {
    const moduleReference = await Test.createTestingModule({
      controllers: [StudentSyncController],
      providers: [
        { provide: StudentSyncAdminService, useValue: { status } },
        { provide: OfflineSnapshotService, useValue: {} },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleReference.createNestApplication();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  // 테스트 서버 종료
  afterAll(async () => {
    await app?.close();
  });

  // 상태 응답은 private, no-store로 캐시 금지
  it("marks the status representation private and non-cacheable", async () => {
    const response = await fetch(`${baseUrl}/api/v1/admin/student-sync/status`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(status).toHaveBeenCalledOnce();
  });
});
