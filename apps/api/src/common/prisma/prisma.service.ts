import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { type AppEnvironment } from "../config/environment.js";

/**
 * 연결 풀 상한을 **명시한다.**
 *
 * 왜 중요한가: `npr_worker` 역할에는 서버 쪽 연결 한도가 걸려 있다(배포 스크립트가
 * 관리한다). pg.Pool 의 기본 상한은 10 인데 역할 한도가 그보다 낮으면, 부하가 올라간
 * 순간 풀이 한도를 넘겨 붙으려 하고 PostgreSQL 이 53300 으로 끊는다. 그 오류가 워커
 * 부팅을 죽여 재시작 루프가 된다.
 *
 * **상한이 있는 풀은 기다리고, 없는 풀은 터진다.** 그래서 값을 코드에 적어 두고 역할
 * 한도를 그보다 넉넉히 잡는다. 두 수는 함께 움직여야 하므로 서로를 가리켜 둔다:
 * ops/pve-release/deploy-nest-release.sh 의 `CONNECTION LIMIT`.
 *
 * 실제로 겪은 일: 문자 325건을 한 번에 넣자 워커가 10개를 동시에 처리하려 했고,
 * 역할 한도 8을 넘겨 33회 재시작하며 77건이 발송 여부 불명으로 남았다.
 */
const POOL_MAX_CONNECTIONS = 16;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  public readonly configured: boolean;

  public constructor(@Inject("APP_ENVIRONMENT") environment: AppEnvironment) {
    const configuredUrl = environment.processRole === "worker"
      ? environment.workerDatabaseUrl
      : environment.databaseUrl;
    const connectionString = configuredUrl
      ?? "postgresql://unconfigured:unconfigured@127.0.0.1:9/unconfigured";
    super({ adapter: new PrismaPg({ connectionString, max: POOL_MAX_CONNECTIONS }) });
    this.configured = configuredUrl !== undefined;
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
