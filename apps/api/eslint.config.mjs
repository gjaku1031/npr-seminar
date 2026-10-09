import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * API ESLint 설정
 *
 * 생성 코드·빌드 결과 제외, 타입 정보 기반 권장 규칙과 타입 import·Promise 처리·any 금지 규칙 적용
 */
export default tseslint.config(
  // 검사 제외 경로
  { ignores: ['dist/**', 'node_modules/**', 'src/generated/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  // Node.js 전역과 TypeScript 프로젝트 서비스 기반 타입 정보
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // 프로젝트 추가 규칙
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
