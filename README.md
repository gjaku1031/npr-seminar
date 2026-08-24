# npr-seminar

NPR 입시설명회 운영 시스템 모노레포다. 브라우저 UI는 Next.js 정적 export,
업무 API와 worker는 NestJS, 원장은 PostgreSQL, 세션·OTP·rate limit은 Redis가 담당한다.

## 저장소 구조

```text
apps/
├── web/          # Next.js 16 정적 UI와 same-origin API client
└── api/          # NestJS 11 API, worker, Prisma schema/migrations
packages/
└── contracts/    # OpenAPI 계약과 계약 검증기
ops/
├── pve-release/  # PostgreSQL/Redis와 기존 Next 배포 운영 자산
└── static-web/   # 정적 미리보기와 CloudFront 경로 처리
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
pnpm dev          # web UI 개발 서버
pnpm dev:all      # web 개발 서버 + api 프로세스
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Next 개발 서버에는 `/api/v1` 프록시가 없으므로 `pnpm dev:all`만으로 같은 출처 API
흐름이 완성되지는 않는다. 정적 빌드 후 아래 preview를 사용한다.

웹 정적 빌드 결과는 `apps/web/out`에 생긴다. Nest API를 별도로 실행한 뒤 같은
출처의 정적 미리보기에서 확인할 수 있다.

```bash
PORT=3410 NEST_API_ORIGIN=http://127.0.0.1:4400 node ops/static-web/serve.mjs
```

정적 호스팅 구성은 [`ops/static-web/README.md`](ops/static-web/README.md)를 따른다.
현재 [`ops/pve-release/README.md`](ops/pve-release/README.md)의 기존 배포 절차는
Next 서버를 실행하는 별도 운영 경로이며, 정적 산출물을 S3에 자동 배포하지 않는다.

호스트 Corepack이 오래된 경우에는 시스템 Corepack을 교체하지 말고 다음처럼
고정 버전을 실행한다.

```bash
npm exec --yes pnpm@11.10.0 -- install --frozen-lockfile
```

백엔드 명령과 운영 설정은 [`apps/api/README.md`](apps/api/README.md)를 따른다. 실제 비밀번호,
통통통 세션, 학생 원본, Google service-account JSON은 저장소에 넣지 않는다.
