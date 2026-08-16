# server — 서버 전용 존

이 앱의 서버 존이 하는 일은 **인증 판정 하나**다.

```
server/
├── config/env.ts       # 서버 env 격리지점(zod). 지금은 NEST_API_ORIGIN 하나
├── auth/session.ts     # 계약 GET /api/v1/auth/me 왕복 — 판정의 유일한 권위 지점
└── services/           # 공개 API(barrel) — currentUser · requireModuleAccess
```

## 왜 이것만 남았나

업무 데이터의 소유자는 `apps/api`(NestJS)다. 조회도 변경도 브라우저가 same-origin `/api/v1`
계약 API 로 직접 한다 (`@/shared/api`). 그래서 이 앱에는 DB 도, 리포지토리도, Server Action 도 없다.

인증만 서버에 남은 이유는 판정 시점 때문이다. 세션은 Redis 가 소유하는 불투명한 ID라 이 앱은
값을 해석할 수 없고, 보호 화면은 **렌더 전에** 통과 여부가 정해져야 한다. 그래서 `(main)`
레이아웃이 매 요청 Nest 에 되물어 ADMIN 세션만 통과시킨다. 자세한 근거는 `auth/session.ts` 주석에 있다.

> 2026-08 정리: Drizzle 스키마·리포지토리·도메인 서비스·SOLAPI 게이트웨이와 이를 쓰던
> `features/*/api/actions.ts` Server Action 을 제거했다. 전환 기간 동안만 남아 있던 병렬
> 백엔드였고 어떤 화면도 참조하지 않았다. 이전 구조의 기록은 `docs/architecture.md` 에 있다.

## 규칙 (ESLint 강제, 설계 §4.2)

- **진입점은 `app/**`(RSC 페이지·레이아웃) 하나뿐**이고, 공개 API `@/server/services` 만 import 한다. (R1)
- **전 파일 `import "server-only"`** — 클라이언트 번들 유입 차단. 새 파일에도 반드시. (R4)
- 클라이언트 레이어 참조 금지. 예외: 도메인 모델(`@/entities/*` barrel)·순수 유틸(`shared/lib`). (R5)

## 새 기능을 여기에 두기 전에

거의 모든 경우 답은 "여기가 아니다". 업무 규칙은 `apps/api`, 화면 상태는 features/widgets 다.
이 존은 계약(`packages/contracts/openapi.yaml`)을 대신하지 않는다.
