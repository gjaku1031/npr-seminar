# npr-seminar

Next.js **풀스택** 세미나 앱. `fe-architecture-v2`(NPR ERP FE)의 FSD 레이어 규율을 승계하고, 풀스택 서버 계층(`src/server`)과 **DB 교체 격리 설계**를 추가했다.

> 설계서: [docs/architecture.md](docs/architecture.md) — 레이어 규율 · DB 교체 시나리오 · 결정 기록

## 구조 요약

```
src/
├── app/        # 라우팅. 페이지 = 데이터 로더(RSC) + views 위임
├── views/      # 화면 조합 — 데이터는 props로 받는다 (서버를 모름)
├── widgets/    # 다도메인 조합 블록 (지연 생성)
├── features/   # 사용자 행위. api/actions.ts = Server Action (유일한 변경 진입점)
├── entities/   # 도메인 명사. model/ = 도메인 모델(서버·클라 공용 순수 TS)
├── shared/     # 공용. ui/ = 새 디자인 시스템이 들어올 자리
└── server/     # ★ 서버 전용 존 (server-only)
    ├── db/            # Drizzle 스키마 + Neon 클라이언트  [DB 상세 ①]
    ├── repositories/  # ★ DB 교체 격리지점: port(계약) / drizzle·memory(구현) / index(조립)
    └── services/      # 유스케이스 — 계약만 안다
```

- 조회: `page.tsx(RSC) → services → repositories(계약) → drizzle | memory`
- 변경: `form → Server Action → services → repositories(계약)` + `revalidatePath`
- **DB 교체 시**: 새 리포지토리 구현 추가 → `repositories/index.ts` 스위치만 변경. 상위 전 레이어 불변.

## 개발

```bash
pnpm install
pnpm dev          # DB 없이 바로 구동 (인메모리 리포지토리)
```

Neon(Postgres) 연결:

```bash
cp .env.example .env.local   # DATABASE_URL 채우기 (Vercel Neon 플러그인이면 자동 주입)
pnpm db:generate             # 스키마 → 마이그레이션 SQL
pnpm db:migrate              # 적용
pnpm dev                     # DATABASE_URL 감지 → drizzle 구현으로 전환
```

품질 게이트: `pnpm typecheck && pnpm lint && pnpm build`

> 요구: Node >= 20, pnpm
