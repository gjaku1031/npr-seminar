import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import session, { type SessionOptions } from "express-session";
import { RedisStore } from "connect-redis";
import { randomBytes } from "node:crypto";
import { AppModule } from "./app.module.js";
import { ProblemDetailsFilter } from "./common/errors/problem-details.filter.js";
import { type AppEnvironment } from "./common/config/environment.js";
import { RedisService } from "./common/redis/redis.service.js";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "./common/auth/session-cookie.js";

/**
 * HTTP API 프로세스 기동
 *
 * 1. helmet 보안 헤더
 * 2. 세션: Redis 저장소, 요청마다 유휴 만료 연장(rolling), 초기화 전 세션은 저장 안 함
 * 3. 신뢰 프록시 단계 설정
 * 4. DTO 화이트리스트 검증·변환 파이프, problem+json 오류 필터
 * 5. 루프백(127.0.0.1)에서만 수신. 외부 노출은 앞단 프록시가 담당
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const environment = app.get<AppEnvironment>("APP_ENVIRONMENT");
  const redis = app.get(RedisService);
  app.use(helmet());
  // 세션 비밀이 없는 비운영 환경은 프로세스마다 임의 키 사용. 재기동 시 세션 무효화됨
  const sessionOptions: SessionOptions = {
    name: SESSION_COOKIE_NAME,
    secret: environment.sessionSecret ?? randomBytes(32).toString("base64url"),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      ...sessionCookieOptions(environment),
      maxAge: environment.sessionIdleTtlSeconds * 1_000,
    },
  };
  // Redis 미설정 시 메모리 저장소 사용
  if (redis.configured) {
    sessionOptions.store = new RedisStore({
      client: redis.client,
      prefix: `${redis.prefix}session:`,
      ttl: environment.sessionIdleTtlSeconds,
    });
  }
  app.use(session(sessionOptions));
  if (environment.trustProxy > 0) {
    app.getHttpAdapter().getInstance().set("trust proxy", environment.trustProxy);
  }
  // 선언되지 않은 필드가 있으면 400으로 거부
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  await app.listen(environment.port, "127.0.0.1");
}

void bootstrap();
