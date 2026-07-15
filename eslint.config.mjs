import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * 레이어 확장 규율 (docs/architecture.md §4) — 참고 구조(fe-architecture-v2)의
 * no-restricted-imports 방식을 승계하고, 풀스택 server 존 규칙(R1~R3)을 추가했다.
 *
 * 클라이언트 레이어 (참고 구조 §3·§4 그대로):
 * - 레이어 의존은 하위 방향만: app → views → widgets → features → entities → shared
 * - 슬라이스는 공개 API(barrel)로만 참조: 깊은 경로(@/entities/seminar/model/…) 금지
 * - 같은 레이어 슬라이스 간 직접 import 금지: 조합은 상위 레이어에서
 *
 * server 존 (신규, §4.2):
 * - R1: @/server/** import는 app(RSC page)·features/<slice>/api(Server Action)에서만, 공개 API(@/server/services)만
 * - R2: drizzle-orm·@neondatabase import는 server/db·server/repositories/drizzle에서만 → DB 교체 격리
 * - R3: 리포지토리 구현(@/server/repositories/<impl>/**) 직접 import 금지 — 조립은 repositories/index.ts 전담
 *   (index.ts는 구현을 상대경로로 import하므로 alias 패턴에 걸리지 않는다 — 의도된 통로)
 *
 * ⚠️ 알려진 한계(참고 구조와 동일): 문자열 패턴 매칭이라 `../../server/db` 같은 상대경로 우회는
 * 못 잡는다. "슬라이스 내부에서만 상대경로" 관례 + server 존 전 파일의 `import "server-only"`(R4)로
 * 보완하고, 팀이 커지면 eslint-plugin-boundaries / dependency-cruiser로 승급한다.
 */

const BARREL = {
  group: ["@/entities/*/**", "@/features/*/**", "@/widgets/*/**", "@/views/*/**"],
  message: "슬라이스 공개 API(예: @/entities/seminar)만 import하세요. 내부 깊은 경로 금지. (설계 §4.1)",
};

// R1 — 기본형: server 존 전면 금지.
const SERVER_FORBIDDEN = {
  group: ["@/server/**"],
  message:
    "server 존은 app 페이지(RSC)와 features/*/api(Server Action)에서만 import할 수 있습니다. 데이터는 props로 받으세요. (설계 §4.2 R1)",
};

// R1 — 허용형: 진입점(app·features/*/api)은 server 공개 API만.
const SERVER_PUBLIC_ONLY = {
  group: ["@/server/**", "!@/server/services"],
  message: "server 공개 API(@/server/services)만 import하세요. db·repositories 직접 접근 금지. (설계 §4.2 R1)",
};

// R2 — DB 상세 격리. 이 패턴이 걸리면 리포지토리 계약(port)을 쓰라는 신호다.
const DB_INTERNALS = {
  group: ["drizzle-orm", "drizzle-orm/**", "@neondatabase/**"],
  message:
    "DB 상세(drizzle/neon)는 server/db·server/repositories/drizzle 내부에만 둡니다. 리포지토리 계약(port)을 경유하세요. (설계 §4.2 R2 — DB 교체 격리)",
};

// R3 — 구현 직접 참조 금지.
const REPO_IMPL = {
  group: ["@/server/repositories/*/**"],
  message: "리포지토리 구현을 직접 import하지 마세요 — 조립(repositories/index.ts)이 선택합니다. (설계 §4.2 R3)",
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

  // ── 기본값 (src 전체): server 금지 + DB 상세 금지 ──
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": nri(BARREL, SERVER_FORBIDDEN, DB_INTERNALS, REPO_IMPL) },
  },

  // ── 클라이언트 레이어: 기본값 + 단방향·동레이어 규칙 ──
  {
    files: ["src/views/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.views), sameLayer("views"), SERVER_FORBIDDEN, DB_INTERNALS, REPO_IMPL),
    },
  },
  {
    files: ["src/widgets/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.widgets), sameLayer("widgets"), SERVER_FORBIDDEN, DB_INTERNALS, REPO_IMPL),
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.features), sameLayer("features"), SERVER_FORBIDDEN, DB_INTERNALS, REPO_IMPL),
    },
  },
  {
    files: ["src/entities/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.entities), sameLayer("entities"), SERVER_FORBIDDEN, DB_INTERNALS, REPO_IMPL),
    },
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.shared), SERVER_FORBIDDEN, DB_INTERNALS, REPO_IMPL),
    },
  },

  // ── server 존 진입점 (R1 허용형): app 페이지·Server Action은 공개 API만 ──
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": nri(BARREL, SERVER_PUBLIC_ONLY, DB_INTERNALS, REPO_IMPL) },
  },
  {
    files: ["src/features/*/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": nri(BARREL, upper(UPPER.features), sameLayer("features"), SERVER_PUBLIC_ONLY, DB_INTERNALS, REPO_IMPL),
    },
  },

  // ── server 존 내부: 클라이언트 레이어 금지(R5). DB 상세는 기본 금지(R2) ──
  {
    files: ["src/server/**/*.ts"],
    rules: { "no-restricted-imports": nri(BARREL, CLIENT_LAYERS, DB_INTERNALS, REPO_IMPL) },
  },

  // ── DB 상세 구역 (R2 예외): 여기서만 drizzle/neon import 허용 ──
  {
    files: ["src/server/db/**/*.ts", "src/server/repositories/drizzle/**/*.ts"],
    rules: { "no-restricted-imports": nri(BARREL, CLIENT_LAYERS, REPO_IMPL) },
  },

  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**"]),
]);

export default eslintConfig;
