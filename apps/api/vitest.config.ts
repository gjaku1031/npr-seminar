import { defineConfig } from 'vitest/config';

/**
 * 단위 테스트 설정. test/unit만 실행하고 테스트마다 모의 함수 초기화
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.spec.ts'],
    passWithNoTests: false,
    restoreMocks: true,
    clearMocks: true,
    // 커버리지 측정. 생성 코드와 진입점 제외
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/cli/**'],
    },
  },
});
