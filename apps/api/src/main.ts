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

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const environment = app.get<AppEnvironment>("APP_ENVIRONMENT");
  const redis = app.get(RedisService);
  app.use(helmet());
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
