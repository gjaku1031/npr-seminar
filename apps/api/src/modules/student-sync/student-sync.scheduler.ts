import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import type { AppEnvironment } from "../../common/config/environment.js";
import { StudentSyncOrchestratorService } from "./student-sync-orchestrator.service.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;

@Injectable()
export class StudentSyncScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private initialTimer: NodeJS.Timeout | undefined;
  private intervalTimer: NodeJS.Timeout | undefined;

  public constructor(
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
    private readonly orchestrator: StudentSyncOrchestratorService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!this.environment.tongSyncEnabled || this.environment.processRole !== "api") return;
    this.initialTimer = setTimeout(() => {
      void this.runSafely();
      this.intervalTimer = setInterval(() => { void this.runSafely(); }, SIX_HOURS_MS);
      this.intervalTimer.unref();
    }, this.nextSeoulBoundaryDelay());
    this.initialTimer.unref();
  }

  public onModuleDestroy(): void {
    if (this.initialTimer !== undefined) clearTimeout(this.initialTimer);
    if (this.intervalTimer !== undefined) clearInterval(this.intervalTimer);
  }

  private async runSafely(): Promise<void> {
    try { await this.orchestrator.runScheduled(); } catch { /* Run/circuit state is durable; scheduler never retries. */ }
  }

  private nextSeoulBoundaryDelay(now = new Date()): number {
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    while ((next.getUTCHours() + 9) % 6 !== 0) next.setUTCHours(next.getUTCHours() + 1);
    return Math.max(next.getTime() - now.getTime(), 1_000);
  }
}
