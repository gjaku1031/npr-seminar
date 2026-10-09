import { Global, Module } from "@nestjs/common";
import { environmentProvider } from "./environment.js";

/**
 * 실행 환경 설정 전역 모듈
 *
 * APP_ENVIRONMENT 토큰을 모든 모듈에 제공
 */
@Global()
@Module({
  providers: [environmentProvider],
  exports: [environmentProvider],
})
export class EnvironmentModule {}
