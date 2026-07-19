import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CsrfGuard } from "../../src/common/auth/csrf.guard.js";
import { RolesGuard } from "../../src/common/auth/roles.guard.js";
import { SessionGuard } from "../../src/common/auth/session.guard.js";
import { OfflineSnapshotService } from "../../src/modules/student-sync/offline-snapshot.service.js";
import { StudentSyncAdminService } from "../../src/modules/student-sync/student-sync-admin.service.js";
import { StudentSyncController } from "../../src/modules/student-sync/student-sync.controller.js";

describe("student sync status response headers", () => {
  let app: INestApplication | undefined;
  let baseUrl: string;
  const status = vi.fn(() => ({ liveSourceReady: true, circuit: { status: "CLOSED" } }));

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

  afterAll(async () => {
    await app?.close();
  });

  it("marks the status representation private and non-cacheable", async () => {
    const response = await fetch(`${baseUrl}/api/v1/admin/student-sync/status`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(status).toHaveBeenCalledOnce();
  });
});
