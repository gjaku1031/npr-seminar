# server — 서버 전용 존

풀스택 신규 레이어. 참고 구조(fe-architecture-v2)에서 "별도 NestJS + `@npr/api-client`"가 하던 역할이 이 폴더로 들어왔다 (설계 §1 대응표).

```
server/
├── config/env.ts     # 서버 env 검증(zod). 클라이언트 env는 shared/config
├── db/               # [DB 상세 ①] Drizzle 스키마 + Neon 드라이버 — DB를 아는 곳
├── repositories/     # ★ DB 교체 격리지점 (설계 §6) ★
│   ├── *.port.ts     #   계약 — 도메인 모델(@/entities/*) 타입으로 정의
│   ├── drizzle/      #   [DB 상세 ②] 구현: 쿼리 + Row→도메인 매핑
│   ├── memory/       #   인메모리 구현 — DB 없는 구동 + 교체 가능성의 상시 증명
│   └── index.ts      #   조립(스위치) — DB 교체 시 여기만 바뀐다
└── services/         # 유스케이스 — 리포지토리 "계약"만 안다
```

## 규칙 (ESLint 강제, 설계 §4.2)

- **진입점 두 곳뿐:** `app/**`(RSC 조회)·`features/*/api/**`(Server Action). 그마저 공개 API `@/server/services`만. (R1)
- **drizzle/neon import는 `db/`·`repositories/drizzle/`에서만.** services에 DB 상세가 등장하면 lint 에러. (R2)
- **구현 직접 import 금지** — 선택은 `repositories/index.ts` 전담. (R3)
- **전 파일 `import "server-only"`** — 클라이언트 번들 유입 차단. 새 파일에도 반드시. (R4)
- 클라이언트 레이어 참조 금지. 예외: 도메인 모델(`@/entities/*` barrel)·순수 유틸(`shared/lib`). (R5)

## 새 도메인 추가 (설계 §10)

schema → port → drizzle 구현 + **memory 구현(필수)** → index.ts 조립 → service. memory 구현이 빠지면 격리가 깨진 것이다 (§6.3).
