import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import type { StudentSyncOrchestratorService } from "../../src/modules/student-sync/student-sync-orchestrator.service.js";
import { StudentSyncScheduler } from "../../src/modules/student-sync/student-sync.scheduler.js";

/**
 * 정기 실행 간격(밀리초)
 */
const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;

/**
 * 스케줄러 판단에 필요한 실행 환경
 *
 * @param processRole 기본 api
 */
function environment(tongSyncEnabled: boolean, processRole: "api" | "worker" = "api"): AppEnvironment {
  return { tongSyncEnabled, processRole } as AppEnvironment;
}

/**
 * 예약 실행만 가진 동기화 실행기 대역
 */
function orchestrator(runScheduled: ReturnType<typeof vi.fn>): StudentSyncOrchestratorService {
  return { runScheduled } as unknown as StudentSyncOrchestratorService;
}

// 가짜 타이머와 모의 함수 복원
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// 학생 동기화 스케줄러
describe("StudentSyncScheduler", () => {
  // 연동이 켜진 API 프로세스가 아니면 타이머를 등록하지 않음
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

  // 다음 서울 6시간 경계에 실행하고 이후 6시간마다 실행
  it("runs at the next six-hour Asia/Seoul boundary and every six hours thereafter", async () => {
    vi.useFakeTimers();
    // 2026-07-18 00:30 KST. 다음 실행 경계는 06:00 KST (20:59:59.999Z + 1ms)
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

  // 예약 실행 실패는 삼키고 자동 재시도하지 않음
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
