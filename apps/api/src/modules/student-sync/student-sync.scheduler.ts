import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import type { AppEnvironment } from "../../common/config/environment.js";
import { StudentSyncOrchestratorService } from "./student-sync-orchestrator.service.js";

/**
 * 정기 동기화 간격(밀리초)
 */
const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;

/**
 * 통통통 정기 동기화 스케줄러
 *
 * 연동이 켜진 API 프로세스에서만 서울 시간 0·6·12·18시 정각에 실행
 */
@Injectable()
export class StudentSyncScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  /**
   * 첫 정각까지 기다리는 타이머
   */
  private initialTimer: NodeJS.Timeout | undefined;

  /**
   * 6시간 반복 타이머
   */
  private intervalTimer: NodeJS.Timeout | undefined;

  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * 실행 환경. 연동 사용 여부·프로세스 역할
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,

    /**
     * 동기화 실행기
     */
    private readonly orchestrator: StudentSyncOrchestratorService,
  ) {}

  /**
   * 기동 시 첫 정각 타이머 등록
   *
   * 타이머는 unref로 프로세스 종료를 막지 않음
   */
  public onApplicationBootstrap(): void {
    if (!this.environment.tongSyncEnabled || this.environment.processRole !== "api") return;
    this.initialTimer = setTimeout(() => {
      void this.runSafely();
      this.intervalTimer = setInterval(() => { void this.runSafely(); }, SIX_HOURS_MS);
      this.intervalTimer.unref();
    }, this.nextSeoulBoundaryDelay());
    this.initialTimer.unref();
  }

  /**
   * 모듈 종료 시 타이머 해제
   */
  public onModuleDestroy(): void {
    if (this.initialTimer !== undefined) clearTimeout(this.initialTimer);
    if (this.intervalTimer !== undefined) clearInterval(this.intervalTimer);
  }

  /**
   * 예약 실행. 실패는 무시
   *
   * 실행·회로 상태가 DB에 남으므로 스케줄러는 재시도하지 않음
   */
  private async runSafely(): Promise<void> {
    try { await this.orchestrator.runScheduled(); } catch { /* 실행·회로 상태가 DB에 남으므로 재시도하지 않음 */ }
  }

  /**
   * 다음 서울 6시간 경계까지 대기 시간(밀리초). 최소 1초
   */
  private nextSeoulBoundaryDelay(now = new Date()): number {
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    while ((next.getUTCHours() + 9) % 6 !== 0) next.setUTCHours(next.getUTCHours() + 1);
    return Math.max(next.getTime() - now.getTime(), 1_000);
  }
}
