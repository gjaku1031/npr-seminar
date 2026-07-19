# 모노레포 운영 구조

## 경계

| 경로 | 소유 | 역할 |
| --- | --- | --- |
| `apps/web` | 프론트엔드 | Next.js UI, 브라우저 상태, same-origin API client |
| `apps/api` | 백엔드 | NestJS API/worker, 인증, Prisma/PostgreSQL, 외부 연동 |
| `packages/contracts` | 공동 | OpenAPI와 계약/컨트롤러 일치 검증 |
| `docs/specs` | 공동 | 제품·API·운영 결정 기록 |
| `docs/design` | 프론트엔드 | 디자인 시스템, 사용자 흐름, 핸드오프 |
| `ops/pve-release` | 운영 | datastore, systemd, Tailscale Serve, 원자 배포 |

`apps/web`과 `apps/api`는 서로의 내부 코드를 import하지 않는다. 웹은 DB
credential을 받지 않고 `/api/v1`만 호출한다. API 응답/요청의 유일한 공동
경계는 `packages/contracts/openapi.yaml`이다.

## 런타임

```text
Mac/iPad browser
  -> Tailscale Serve HTTPS
  -> Next.js 127.0.0.1:3000
      -> /api/v1/* external rewrite
      -> NestJS 127.0.0.1:4000
          -> PostgreSQL 127.0.0.1:5432
          -> Redis 127.0.0.1:6379

Nest worker
  -> SMS/Sheets outbox
  -> 최소 권한 PostgreSQL role
```

PostgreSQL은 학생, 예약, QR 상태, 입장, 감사 로그의 원장이다. Redis 유실로
관리자 재로그인이나 진행 중 OTP 무효화는 허용되지만, 원장 데이터가 손상되면
안 된다. SMS와 Google Sheets는 DB transaction에 기록된 outbox를 별도 worker가
처리한다.

## 라우팅

- `/`: 실제 학부모 모바일 예약/조회 UI
- `/booking/{familyBookingId}`: SMS OTP 이후에만 조회하는 안전한 예약 진입점
- `/admin`: 운영 콘솔
- `/scanner/connect`: iPad 스캐너 페어링
- `/api/v1/*`: NestJS API

가족 QR 원문은 URL, DB, 로그, 스토리지에 넣지 않는다. `/reserve`는 `/`로만
영구 이동하며 이전 `/preview`와 `/q/{token}` 공개 라우트는 사용하지 않는다.

## 개발과 품질 게이트

pnpm workspace와 Turborepo가 두 앱과 계약 패키지를 관리한다.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
python3 packages/contracts/scripts/validate_openapi.py packages/contracts/openapi.yaml
python3 packages/contracts/scripts/audit_controller_routes.py
```

Prisma migration은 `MIGRATION_DATABASE_URL`의 전용 역할로만 적용한다. API는
`DATABASE_URL`, delivery worker는 `WORKER_DATABASE_URL`을 사용한다. 웹 서비스에
어떤 DB URL도 주입하지 않는다.

## 전환 기록

2026-07-17에 루트 단일 Next.js 풀스택 구조를 `apps/web` + `apps/api`로
분리했고, 백엔드 결정은 Spring Boot에서 NestJS로 변경됐다. 이전 Drizzle/RSC
서버 계층은 기능 전환 동안만 참고 자료이며 최종 런타임 경계가 아니다.
이전 구조의 상세 기록은 [`architecture.md`](architecture.md)에 보존한다.
