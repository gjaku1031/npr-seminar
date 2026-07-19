# npr-seminar

NPR 입시설명회 운영 시스템 모노레포다. 브라우저 UI는 Next.js, 업무 API와
worker는 NestJS, 원장은 PostgreSQL, 세션·OTP·rate limit은 Redis가 담당한다.

## 저장소 구조

```text
apps/
├── web/          # Next.js 16 UI와 same-origin API client
└── api/          # NestJS 11 API, worker, Prisma schema/migrations
packages/
└── contracts/    # OpenAPI 계약과 계약 검증기
ops/
└── pve-release/  # PostgreSQL/Redis와 원자 배포 운영 자산
docs/
├── architecture.md   # 이전 Next 풀스택 구조의 기록
├── monorepo.md       # 현재 경계와 실행 구조
├── specs/
└── design/
```

브라우저는 동일 origin의 `/api/v1/*`만 호출한다. `apps/web`은 DB에 직접
접속하지 않으며, `apps/api`와 내부 타입을 공유하지 않는다. 양쪽의 계약은
[`packages/contracts/openapi.yaml`](packages/contracts/openapi.yaml)이다.

## 개발

Node.js 22와 저장소에 고정된 pnpm 11.10.0을 사용한다.

```bash
pnpm install --frozen-lockfile
pnpm dev          # web
pnpm dev:all      # web + api
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

호스트 Corepack이 오래된 경우에는 시스템 Corepack을 교체하지 말고 다음처럼
고정 버전을 실행한다.

```bash
npm exec --yes pnpm@11.10.0 -- install --frozen-lockfile
```

백엔드 명령과 운영 설정은 [`apps/api/README.md`](apps/api/README.md), 배포는
[`ops/pve-release/README.md`](ops/pve-release/README.md)를 따른다. 실제 비밀번호,
통통통 세션, 학생 원본, Google service-account JSON은 저장소에 넣지 않는다.

## 작업 경계

- 오케스트레이터: 앱 간 계약, 통합, 배포와 최종 품질 게이트
- 프론트엔드: `apps/web`, `docs/design`
- 백엔드: `apps/api`
- 공동 계약: `packages/contracts`

세부 위임·모델 라우팅 규칙은 [`AGENTS.md`](AGENTS.md)에 있다.
