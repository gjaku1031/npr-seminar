import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * 레이어 확장 규율 — 참고 구조(fe-architecture-v2)의
 * no-restricted-imports 방식을 승계하고, server 존 규칙(R1·R5)을 추가했다.
 *
 * 클라이언트 레이어 (참고 구조 §3·§4 그대로):
 * - 레이어 의존은 하위 방향만: app → views → widgets → features → entities → shared
 * - 슬라이스는 공개 API(barrel)로만 참조: 깊은 경로(@/entities/reservation/model/…) 금지
 * - 같은 레이어 슬라이스 간 직접 import 금지: 조합은 상위 레이어에서
 *
 * server 존 (§4.2):
 * - R1: @/server/** import는 app(RSC 페이지·레이아웃)에서만, 공개 API(@/server/services)만
 * - R5: server 존은 클라이언트 레이어를 모른다 — 도메인 모델·순수 유틸만 허용
 *
 * 2026-08 정리로 사라진 규칙: DB 상세 격리(R2)와 리포지토리 구현 직접 참조 금지(R3).
 * Drizzle/Neon 리포지토리 자체가 없어졌고(이 앱은 DB credential 을 받지 않는다),
 * Server Action 진입점(features/<slice>/api)도 함께 제거돼 R1 의 허용 대상이 app 하나로 줄었다.
 * 데이터는 브라우저가 same-origin `/api/v1` 로 Nest 에 직접 요청한다 — @/shared/api 참조.
 *
 * ⚠️ 알려진 한계(참고 구조와 동일): 문자열 패턴 매칭이라 `../../server/auth` 같은 상대경로 우회는
 * 못 잡는다. "슬라이스 내부에서만 상대경로" 관례 + server 존 전 파일의 `import "server-only"`(R4)로
 * 보완하고, 팀이 커지면 eslint-plugin-boundaries / dependency-cruiser로 승급한다.
 */

const BARREL = {
  group: ["@/entities/*/**", "@/features/*/**", "@/widgets/*/**", "@/views/*/**"],
  message: "슬라이스 공개 API(예: @/entities/reservation)만 import하세요. 내부 깊은 경로 금지. (설계 §4.1)",
};

// R1 — 기본형: server 존 전면 금지.
const SERVER_FORBIDDEN = {
  group: ["@/server/**"],
  message:
    "server 존은 app 페이지·레이아웃(RSC)에서만 import할 수 있습니다. 데이터는 same-origin `/api/v1`(@/shared/api)에서 읽으세요. (설계 §4.2 R1)",
};

// R1 — 허용형: 진입점(app)은 server 공개 API만.
const SERVER_PUBLIC_ONLY = {
  group: ["@/server/**", "!@/server/services"],
  message: "server 공개 API(@/server/services)만 import하세요. auth·config 직접 접근 금지. (설계 §4.2 R1)",
};

// R5 — server 존이 클라이언트 레이어를 참조하지 않도록. 예외: 도메인 모델(@/entities/* barrel)과
// 순수 유틸(shared/lib·config). React가 있는 shared/ui는 금지.
const CLIENT_LAYERS = {
  group: ["@/app/**", "@/views/**", "@/widgets/**", "@/features/**", "@/shared/ui/**"],
  message: "server 존은 클라이언트 레이어를 모릅니다. 도메인 모델(@/entities/*)·순수 유틸(shared/lib)만 허용. (설계 §4.2 R5)",
};

// 같은 레이어의 다른 슬라이스 참조 금지 (슬라이스 내부는 상대경로를 쓰므로 alias 매칭이 곧 위반).
const sameLayer = (layer) => ({
  group: [`@/${layer}/*`],
  message: `같은 레이어(${layer}) 슬라이스 간 직접 import 금지 — 조합은 상위 레이어에서. (설계 §4.1)`,
});

const upper = (layers) => ({
  group: layers,
  message: "상위 레이어 import 금지 — 의존은 하위 방향만. (설계 §4.1)",
});

const UPPER = {
  views: ["@/app/**"],
  widgets: ["@/app/**", "@/views/**"],
  features: ["@/app/**", "@/views/**", "@/widgets/**"],
  entities: ["@/app/**", "@/views/**", "@/widgets/**", "@/features/**"],
  shared: ["@/app/**", "@/views/**", "@/widgets/**", "@/features/**", "@/entities/**"],
};

// flat config는 동일 룰을 마지막 매칭이 덮어쓰므로, 각 파일 블록은 필요한 패턴 전체를 다시 조립한다.
const nri = (...patterns) => ["error", { patterns }];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ── 기본값 (src 전체): server 금지 ──
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": nri(BARREL, SERVER_FORBIDDEN) },
  },

  // ── 클라이언트 레이어: 기본값 + 단방향·동레이어 규칙 ──
  {
    files: ["src/views/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.views), sameLayer("views"), SERVER_FORBIDDEN),
    },
  },
  {
    files: ["src/widgets/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.widgets), sameLayer("widgets"), SERVER_FORBIDDEN),
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.features), sameLayer("features"), SERVER_FORBIDDEN),
    },
  },
  {
    files: ["src/entities/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.entities), sameLayer("entities"), SERVER_FORBIDDEN),
    },
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.shared), SERVER_FORBIDDEN),
    },
  },

  // ── server 존 진입점 (R1 허용형): app 페이지·레이아웃은 공개 API만 ──
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": nri(BARREL, SERVER_PUBLIC_ONLY) },
  },

  // ── server 존 내부: 클라이언트 레이어 금지(R5) ──
  {
    files: ["src/server/**/*.ts"],
    rules: { "no-restricted-imports": nri(BARREL, CLIENT_LAYERS) },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
