import { defineConfig } from 'vitest/config';

/**
 * 통합 테스트 설정
 *
 * 컨테이너 기동 시간을 고려해 제한 시간 120초, 컨테이너 충돌을 피하려고 파일을 순차 실행
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
    fileParallelism: false,
    passWithNoTests: false,
  },
});
