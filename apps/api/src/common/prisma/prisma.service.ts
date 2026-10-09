import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { type AppEnvironment } from "../config/environment.js";

/**
 * 연결 풀 상한
 *
 * npr_worker 역할에는 서버 쪽 연결 한도(ops/pve-release/deploy-nest-release.sh의 CONNECTION LIMIT)가 있음
 * pg.Pool 기본 상한(10)이 역할 한도보다 높으면 부하 시 PostgreSQL이 53300으로 연결을 끊고 워커가 재시작 루프에 빠짐
 * 상한이 있는 풀은 대기하고 없는 풀은 실패하므로 값을 코드에 고정하고, 역할 한도는 이보다 넉넉히 잡음. 두 값은 함께 조정
 * 사례: 문자 325건 일괄 등록 시 역할 한도 8 초과로 워커 33회 재시작, 77건 발송 여부 불명
 */
const POOL_MAX_CONNECTIONS = 16;

/**
 * 프로세스 역할별 DB 연결을 쓰는 Prisma 클라이언트
 *
 * API는 DATABASE_URL, 워커는 WORKER_DATABASE_URL 사용
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  /**
   * 연결 URL 설정 여부. false면 접속 불가 주소로 생성되어 쿼리가 실패함
   */
  public readonly configured: boolean;

  /**
   * 역할에 맞는 연결 URL과 풀 상한으로 클라이언트 생성
   *
   * URL이 없으면 기동은 허용하고 접속 불가 주소 사용. 헬스 체크가 configured로 미설정 상태를 보고함
   */
  public constructor(@Inject("APP_ENVIRONMENT") environment: AppEnvironment) {
    const configuredUrl = environment.processRole === "worker"
      ? environment.workerDatabaseUrl
      : environment.databaseUrl;
    const connectionString = configuredUrl
      ?? "postgresql://unconfigured:unconfigured@127.0.0.1:9/unconfigured";
    super({ adapter: new PrismaPg({ connectionString, max: POOL_MAX_CONNECTIONS }) });
    this.configured = configuredUrl !== undefined;
  }

  /**
   * 모듈 종료 시 연결 해제
   */
  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
