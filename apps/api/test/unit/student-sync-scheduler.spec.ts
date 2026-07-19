import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import type { StudentSyncOrchestratorService } from "../../src/modules/student-sync/student-sync-orchestrator.service.js";
import { StudentSyncScheduler } from "../../src/modules/student-sync/student-sync.scheduler.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;

function environment(tongSyncEnabled: boolean, processRole: "api" | "worker" = "api"): AppEnvironment {
  return { tongSyncEnabled, processRole } as AppEnvironment;
}

function orchestrator(runScheduled: ReturnType<typeof vi.fn>): StudentSyncOrchestratorService {
  return { runScheduled } as unknown as StudentSyncOrchestratorService;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("StudentSyncScheduler", () => {
  it("does not arm a timer unless the API process is explicitly enabled", () => {
    vi.useFakeTimers();
    const runScheduled = vi.fn();

    const disabled = new StudentSyncScheduler(environment(false), orchestrator(runScheduled));
    disabled.onApplicationBootstrap();
    const worker = new StudentSyncScheduler(environment(true, "worker"), orchestrator(runScheduled));
    worker.onApplicationBootstrap();

    expect(vi.getTimerCount()).toBe(0);
    expect(runScheduled).not.toHaveBeenCalled();
  });

  it("runs at the next six-hour Asia/Seoul boundary and every six hours thereafter", async () => {
    vi.useFakeTimers();
    // 2026-07-18 00:30 KST; the next boundary is 06:00 KST (20:59:59.999Z + 1ms).
    vi.setSystemTime(new Date("2026-07-17T15:30:00.000Z"));
    const runScheduled = vi.fn().mockResolvedValue("run-id");
    const scheduler = new StudentSyncScheduler(environment(true), orchestrator(runScheduled));

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync((5.5 * 60 * 60 * 1_000) - 1);
    expect(runScheduled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runScheduled).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SIX_HOURS_MS);
    expect(runScheduled).toHaveBeenCalledTimes(2);

    scheduler.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("swallows a failed scheduled run without an automatic retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T20:59:59.000Z")); // 05:59:59 KST
    const runScheduled = vi.fn().mockRejectedValue(new Error("fail closed"));
    const scheduler = new StudentSyncScheduler(environment(true), orchestrator(runScheduled));

    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runScheduled).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
    expect(runScheduled).toHaveBeenCalledTimes(1);

    scheduler.onModuleDestroy();
  });
});
