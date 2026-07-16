# npr-seminar 풀스택 아키텍처 설계서

> **대상:** `npr-seminar` — Next.js **풀스택** 앱 (FE + 서버 계층 + DB를 한 repo에서)
> **참고 구조:** `fe-architecture-v2` (NPR ERP FE 모노레포) — **설계 뼈대(레이어·규율)만 승계, 디자인 시스템 제외**
> **핵심 제약:** DB는 초기 Vercel 플러그인(Neon)으로 시작하되 **이후 1회 변경될 수 있음.** 변경 후에도 구현된 기능이 그대로 동작해야 함 → §6 격리 설계가 이 문서의 중심.
> **기능 근거:** `npr-seminar-feature-spec.md`(기능 명세 v2.0) · `npr-seminar-flows.json`(페르소나·플로우) — 본문의 "명세 §x"는 전자를, "flows XXX-Fn"은 후자를 가리킨다.
> **작성일:** 2026-07-16 · rev.2

---

## 0. 결정 기록 (2026-07-16 확정)

| # | 항목 | 결정 | 비고 |
|---|---|---|---|
| S1 | 진행 방식 | 참고 구조 FSD 뼈대 승계 + 서버 계층 추가 | **디자인 시스템(NP Edu)은 승계하지 않음** — 별도 디자인 시스템 도입 예정, `shared/ui`는 자리만 예약 |
| S2 | 초기 DB | **Neon (Postgres)** — Vercel 마켓플레이스 연동 | `DATABASE_URL` 자동 주입 |
| S3 | 데이터 접근 | **Drizzle ORM** | 서버리스 친화·경량, Postgres/MySQL/SQLite 지원 → 교체 부담 낮음 |
| S4 | 서버 API 스타일 | **RSC + Server Actions 혼합** | 조회 = RSC(page)에서 서비스 호출, 변경 = Server Actions |
| S5 | repo 형태 | **단일 Next 앱** (모노레포 아님) | 참고 구조 D1의 B안. 근거: 참고 구조가 워크스페이스를 쓴 이유는 `@npr/api-client` 패키지 경계였는데, 풀스택에선 그 경계가 `src/server` 존(ESLint + `server-only`)으로 대체됨. 앱이 하나뿐인데 워크스페이스는 오버스펙(참고 §0.4 원칙) |
| S6 | 입력 검증 | **zod** (Server Action 입력) | Server Action은 사실상 공개 HTTP 엔드포인트 — 입력 검증은 "나중"이 아니라 필수 |
| S7 | TanStack Query | **초기 미도입** | S4 결정의 귀결. 필요 시점의 삽입 자리는 §8 이음새로 예약 |

### 기능 명세 반영 (2026-07-16 추가 확정)

근거: `npr-seminar-feature-spec.md`(§ 표기는 이 문서를 가리킴) · `npr-seminar-flows.json`

| # | 항목 | 결정 | 비고 |
|---|---|---|---|
| S8 | **역할·권한 진실원** | **flows.json 채택** — `owner \| siljang \| gangsa` | 두 문서가 **정면 충돌**. §6.5 참조 |
| S9 | **서버 불변식** | 중복예약·정원초과를 **모든 예약 경로**에서 서버가 차단 | 명세 §11이 "정책 공백(확정 필요)"으로 남긴 항목. §6.4 참조 |
| S10 | 이번 범위 | 전체 도메인 모델 12종 + 핵심 조작(설명회·예약·재원생) | 부가 모듈은 라우트·권한·조회 경로까지 |
| S11 | 설명회 도메인명 | 예시 슬라이스 `Seminar` → **`Session`으로 대체** | 명세 어휘(§2)에 정렬. 골격용 예시였으므로 폐기 |

---

## 1. 참고 구조와의 관계 — 무엇을 승계하고 무엇을 새로 만드나

참고 구조(`fe-architecture-v2`)는 **별도 NestJS 백엔드를 OpenAPI로 소비하는 FE 전용** 설계다(그 문서 §0.1). npr-seminar는 백엔드가 Next.js 안에 있으므로 데이터 계층을 새로 설계하되, 참고 구조가 확립한 규율은 그대로 가져온다.

**승계 (그대로):**
- FSD 변형 레이어와 단방향 의존: `app → views → widgets → features → entities → shared` (참고 §3)
- 확장 규율 3종: 공개 API barrel · 단방향 레이어 의존 · ESLint 강제 (참고 §4)
- 슬라이스 내부 세그먼트 구조(`index.ts / model / api / ui`)와 "슬라이스 내부는 상대경로" 관례
- 오버스펙 금지 원칙: 경계·규칙·이름은 지금 확정, 구현은 필요할 때 (참고 §0.4)
- 이음새 예약 방식: 폴더 위치만 잡고 README로 표시 (참고 §12)
- 얇은 page 관례: `app/*/page.tsx`는 views에 위임
- 지연 생성: `widgets/`는 규칙만 잡고 폴더는 첫 필요 시 생성 (참고 §3.2)

**제외:**
- NP Edu 디자인 시스템(토큰·npds.css·컴포넌트 27종·Pretendard) — 새 디자인 시스템이 `shared/ui` + `app/globals.css` 자리에 들어올 예정
- `packages/api-client`(OpenAPI 생성물)와 `shared/lib/http.ts` 어댑터 — 외부 BE가 없으므로 대상 자체가 없음. 단 **그 역할은 §6의 리포지토리 계약이 정확히 이어받는다**
- TanStack Query 훅 레이어 (S7)

**신규 (풀스택 확장):**
- `src/server/` — 서버 전용 존: `db / repositories / services / config`
- DB 교체 격리 설계 (§6)
- Server Actions 규약 (§5)

### 참고 구조 → npr-seminar 역할 대응표

| 참고 구조 (FE 전용) | npr-seminar (풀스택) | 공통 역할 |
|---|---|---|
| `@npr/api-client` (OpenAPI 생성물) | `server/db` + `server/repositories/drizzle` | 데이터 소스 상세 — 상위가 모르는 영역 |
| `shared/lib/http.ts` (어댑터) ★ | `server/repositories/*.port.ts` (계약) ★ | **유일 격리지점** — 교체 시 이 경계 위는 불변 |
| query 훅 (`entities/*/api`) | RSC 조회(page) + Server Actions (`features/*/api`) | 데이터 진입점 |
| DTO→VM (`entities/*/model/*.vm.ts`) | Row→도메인 모델 (리포지토리 구현 내부) | 스키마 변경 충격 흡수 + 조기 컴파일 에러 |
| "생성물 직접 import 금지" (ESLint) | "drizzle/neon 직접 import 금지" (ESLint) | 격리의 기계적 강제 |

---

## 2. 기술 스택

| 구분 | 패키지 | 비고 |
|---|---|---|
| 코어 | `next@16.2.x`, `react@19.2.x` | 참고 구조와 정렬 |
| 언어 | `typescript@^5` strict, `@/*` → `./src/*` | 〃 |
| DB | Neon Postgres (Vercel 플러그인) | `@neondatabase/serverless` HTTP 드라이버 |
| ORM | `drizzle-orm` + `drizzle-kit`(마이그레이션) | `server/db`·`repositories/drizzle`에만 존재 |
| 검증 | `zod` | Server Action 입력 검증 |
| 서버 경계 | `server-only` | server 존이 클라이언트 번들에 새는 것을 빌드 타임 차단 |
| 스타일 | `tailwindcss@^4` | 베이스만. 토큰/컴포넌트는 새 디자인 시스템 대기 |
| 린트 | `eslint@^9` + `eslint-config-next` + 경계 규칙 | 참고 구조 방식 확장 (§4) |

---

## 3. 폴더 구조

```
npr-seminar/
├── docs/architecture.md        # 이 문서
├── drizzle/                    # drizzle-kit 생성 마이그레이션 SQL (버전관리 대상)
├── drizzle.config.ts
├── src/
│   ├── app/                    # Next 라우팅. 페이지 = 데이터 로더 + views 위임 (얇게)
│   │   ├── (main)/             #   콘솔 — proxy 가드 + 역할 게이팅 (§6.5)
│   │   │   ├── layout.tsx      #     셸: 역할별 허용 탭바 (추후 widgets/app-shell로 승격)
│   │   │   ├── page.tsx        #     허브 = 카드 런처 (명세 §3)
│   │   │   ├── sessions/       #     설명회 운영 (명세 §7) ★ 핵심
│   │   │   ├── students/ phone/ sms/ counsel/ stats/ scanner/ preview/
│   │   ├── login/page.tsx      #   역할 선택 로그인 (명세 12.1)
│   │   ├── reserve/page.tsx    #   학부모 모바일 예약 — **공개**(로그인 없음, 명세 §10)
│   │   ├── globals.css         #   디자인 토큰 (색·radius·shadow·motion)
│   │   └── layout.tsx
│   ├── proxy.ts                # 쿠키 유무 1차 가드 → /login (§6.5)
│   │
│   ├── views/                  # 화면 조합 (라우트 1:1). 데이터는 props로 받는다
│   │   └── hub/ sessions/ reserve/
│   ├── widgets/                # 다도메인 조합 블록 — ※ 지연 생성 (규칙만, 참고 §3.2)
│   ├── features/               # 사용자 행위 (동사). api/actions.ts = Server Action
│   │   ├── auth/               #   로그인·로그아웃
│   │   ├── create-session/ close-session/
│   │   ├── create-reservation/ manage-reservation/ check-in/
│   │   └── manage-student/
│   ├── entities/               # 도메인 명사 (10슬라이스·12모델). model/ = 순수 TS, 서버·클라 공용
│   │   ├── session/ reservation/ student/ class/ teacher/ user/
│   │   └── sms/ survey/ counsel/ device/
│   ├── shared/                 # 공용 (업무로직 없음)
│   │   ├── config/env.ts       #   클라이언트 노출 env (NEXT_PUBLIC_*)
│   │   ├── lib/action.ts       #   ActionState — 액션·폼이 공유하는 타입
│   │   └── ui/                 #   ★ 새 디자인 시스템이 들어올 자리 (지금은 ModuleScaffold만)
│   │
│   └── server/                 # ★ 서버 전용 존 — 전 파일 `import "server-only"` ★
│       ├── config/env.ts       # 서버 env 검증(zod): DATABASE_URL, REPO_IMPL
│       ├── db/                 # [DB 상세 구역 ①] Neon·Drizzle을 아는 곳
│       │   ├── client.ts       #   드라이버 연결 (지연 초기화) ← 교체 시나리오 ①의 유일 변경점
│       │   └── schema/         #   Drizzle 스키마 12테이블: people·sessions·reservations·ops
│       ├── repositories/       # ★ DB 교체 격리지점 ★
│       │   ├── *.port.ts       #   계약 — 도메인 모델 타입으로만 정의 (session·reservation·student·support)
│       │   ├── drizzle/        #   [DB 상세 구역 ②] 구현 — 쿼리 + Row→도메인 매핑
│       │   ├── memory/         #   인메모리 구현 + 시드 — 교체 가능성의 상시 증명 (§6.3)
│       │   └── index.ts        #   조립(스위치) — DB 교체 시 여기 한 곳만 바뀐다
│       └── services/           # 유스케이스 — 리포지토리 "계약"만 안다 (drizzle 금지, R2)
│           ├── reservation.service.ts   # ★ 서버 불변식 적용 지점 (§6.4)
│           ├── session.service.ts · student.service.ts · stats.service.ts
│           ├── auth.service.ts          # 인증·권한 이음새 (§6.5 · §8)
│           ├── support.service.ts · errors.ts
│           └── index.ts        #   server 존 공개 API — 진입점은 여기만 본다 (R1)
├── next.config.ts · tsconfig.json · eslint.config.mjs · postcss.config.mjs
└── package.json                # pnpm
```

### 도메인 모델 (명세 §2 — 12모델 / 10슬라이스)

| 슬라이스 | 모델 | 핵심 |
|---|---|---|
| `session` | Session, Reminder | 설명회. date+time+round 분리 보관(명세 원본 구조) |
| `reservation` | Reservation, History, Audit | **중심 애그리거트** — 모바일·전화·수동·현장 4경로가 수렴 |
| `student` | Student, ConvertedFrom | 노쇼 회수·비재원 전환 이력 |
| `class` · `teacher` | Class, Teacher | 반(초/중/고)·강사 |
| `user` | User, UserRole, ModuleKey | 역할·권한 판정의 단일 출처 (§6.5) |
| `sms` · `survey` · `counsel` · `device` | SmsTemplate, SmsLog, SurveyResponse, CounselSlot, CounselBooking, Device | 부가 도메인 |

중첩 구조(reminders·history·codeHistory·audit·convertedFrom)는 `jsonb`로 두고 `$type<>`으로 도메인 타입을 고정한다 — 모델이 바뀌면 스키마에서 컴파일 에러가 난다.

---

## 4. 레이어 규율

### 4.1 클라이언트 레이어 — 참고 구조 §3·§4 그대로

1. **단방향 의존:** `app → views → widgets → features → entities → shared`. 하위만 import. 같은 레이어 슬라이스 간 직접 import 금지(조합은 상위에서).
2. **공개 API barrel:** 슬라이스 밖에서는 `@/entities/seminar`(= `index.ts`)만. 깊은 경로 금지.
3. **슬라이스 내부는 상대경로** — alias 매칭이 곧 규칙 위반이 되도록.

### 4.2 server 존 — 신규 규칙 (ESLint 강제)

| # | 규칙 | 이유 |
|---|---|---|
| R1 | `@/server/**` import는 **`app/**`(RSC page)와 `features/*/api/**`(Server Action)에서만**, 그것도 공개 API `@/server/services`만 | 서버 코드 진입점을 두 곳으로 고정. views/widgets/entities/shared는 서버를 모른다 → 데이터는 항상 props(도메인 모델)로 흐름 |
| R2 | `drizzle-orm`·`@neondatabase/*` import는 **`server/db/**` + `server/repositories/drizzle/**`에서만** | DB 상세를 두 구역에 가둔다. services에 drizzle이 등장하면 lint 에러 = **교체 격리의 기계적 강제** |
| R3 | 리포지토리 구현(`@/server/repositories/drizzle/**` 등) 직접 import 금지 — 조립은 `repositories/index.ts`가 전담 | 교체 지점을 한 파일로 고정 |
| R4 | server 존 전 파일 `import "server-only"` | 클라이언트 번들 유입을 빌드 타임에 차단 (ESLint가 못 잡는 상대경로 우회까지 방어) |
| R5 | `server/**` → 클라이언트 레이어 import 금지. **예외: `@/entities/*` barrel의 도메인 모델(타입·순수 함수)** | 참고 구조의 "생성물 DTO **타입만** import 허용"과 대칭인 유일 예외. entities/model은 React 없는 순수 TS로 유지해야 성립 |

> ESLint `no-restricted-imports` 패턴 방식과 그 한계(상대경로 우회는 못 잡음)는 참고 구조와 동일. 한계는 R4(`server-only`)와 "슬라이스 내부만 상대경로" 관례로 보완하고, 팀이 커지면 `eslint-plugin-boundaries`로 승급.

### 4.3 도메인 모델의 위치 (R5의 근거)

도메인 모델(예: `Session`·`Reservation`)은 `entities/<domain>/model/`에 **순수 TS**로 정의한다. 서버(리포지토리 계약·서비스)와 클라이언트(views·ui)가 같은 타입을 공유하며, DB Row 타입은 server 존 밖으로 절대 나오지 않는다. 참고 구조에서 "컴포넌트는 VM만 알고 DTO를 모른다"였던 규율이, 여기서는 "컴포넌트·서비스는 도메인 모델만 알고 Row를 모른다"가 된다.

---

## 5. 데이터 흐름

**조회 (RSC):**
```
app/(main)/sessions/page.tsx        ← RSC. requireModuleAccess → 서비스 호출 → views 위임
  ↓ props: Session[] · SessionStats · Reservation[] (도메인 모델)
views/sessions → entities/*/ui       ← 서버를 모름. props만 렌더
```

**변경 (Server Action):**
```
features/create-reservation/ui (client) ← useActionState(action)
  ↓ FormData
features/create-reservation/api/actions.ts ("use server")
  ↓                                   ← zod 검증 → 서비스 → revalidatePath → ActionState
server/services/reservation.service.ts ← 유스케이스 + ★ 서버 불변식(중복·정원, §6.4) ★
  ↓
server/repositories (port ← index.ts 조립 ← drizzle | memory 구현)   ★ 격리 경계 ★
  ↓
server/db (Neon + Drizzle)          ← DB 상세는 이 아래에만 존재
```

규약:
- **page = 데이터 로더**: 조회는 page(RSC)에서 하고 views에 props로 내린다. views가 자체 페칭하지 않으므로 서버/클라이언트 어느 쪽으로도 조합 가능하고 테스트가 쉽다. (views 내부 RSC 페칭이 필요해지는 시점의 확장은 §8)
- **변경 후 갱신**: action이 `revalidatePath()` 호출 → RSC 조회가 다시 흐른다. 캐시 무효화 개념이 참고 구조의 query key invalidation에 대응.
- DB를 읽는 페이지는 `export const dynamic = "force-dynamic"` — 빌드 타임 프리렌더가 DB를 치지 않게.

---

## 6. ★ DB 교체 격리 설계 (핵심 제약 대응)

### 6.1 세 가지 장치

1. **계약(port):** `repositories/*.port.ts`가 도메인 모델 타입으로 인터페이스를 정의. 서비스 이상 전 레이어는 이 계약만 안다.
2. **구현 격리:** DB 상세(드라이버·ORM·Row·SQL)는 `server/db/**` + `server/repositories/<impl>/**` 두 구역에만 존재 (ESLint R2 강제). Row→도메인 매핑도 구현 내부 — 스키마가 바뀌면 **구현 파일에서** 컴파일 에러가 난다(조기 감지, 참고 구조 DTO→VM 규율의 승계).
3. **단일 조립 지점:** `repositories/index.ts`가 env(`REPO_IMPL`)로 구현을 선택. 이 스위치가 곧 교체 지점.

### 6.2 교체 시나리오별 변경 범위

| 시나리오 | 바뀌는 곳 | 안 바뀌는 곳 |
|---|---|---|
| ① Neon → 다른 Postgres 호스트 (RDS, self-host …) | `DATABASE_URL` + `server/db/client.ts`의 드라이버 (neon-http → node-postgres) | 그 외 전부 (스키마·리포지토리 구현 포함) |
| ② Postgres → 다른 SQL (MySQL/SQLite/Turso …) | `server/db/**` (dialect·스키마 재작성) + `repositories/drizzle/**` (쿼리 손질) | **port·services·features·entities·views·app 전부** |
| ③ SQL → 전혀 다른 저장소 (Supabase SDK, Mongo, 외부 API …) | `repositories/<신규구현>/**` 새로 작성 + `index.ts` 스위치 한 줄 | 〃 (기존 drizzle 구현은 삭제만) |

### 6.3 상시 증명: memory 구현

`repositories/memory/`는 데모용 편의가 아니라 **설계 검증 장치**다: 계약만으로 전 기능이 동작함을 상시 증명하며(= 시나리오 ③의 리허설), DB 없이 `pnpm dev` 구동을 가능하게 한다. **새 도메인을 추가할 때 memory 구현을 같이 추가하는 것이 규칙** — 이것이 깨지면 격리도 깨진 것이다. 현재 10개 슬라이스 전부 drizzle·memory 두 구현을 갖는다.

### 6.4 ★ 서버 불변식 — 중복예약·정원초과 (결정 S9)

명세 §11이 **"정책 공백(명세 확정 필요)"** 으로 남긴 두 항목이다. 와이어프레임은 in-memory store라 **경로마다 제각각** 막았다:

| 정책 | 와이어프레임 현실 | npr-seminar 서버 |
|---|---|---|
| 중복예약 방지 | 수동예약(재원생 '이미 예약됨')**에만** 존재. 모바일 경로엔 없음 | **모든 경로 차단** |
| 정원 초과 차단 | 모바일(마감 표시)**에만** 존재. 수동·전화엔 검증 없음 | **모든 경로 차단** |

서버가 단일 진실이 되는 순간 이건 화면 정책이 아니라 **불변식**이다. 그래서 검사를 화면이 아니라 `reservation.service.ts`의 `assertCanReserve()` **한 곳**에 두고, 예약을 만드는 네 경로(모바일·전화·수동·현장 즉석)가 전부 이 함수를 통과하게 했다. 경로가 늘어도 정책은 자동으로 지켜진다.

- 중복 판정: 재원생은 `studentId`, 비재원생은 `phone` 기준. **유효 예약(reserved·entered)만** — 취소·노쇼는 좌석을 비운다.
- 정원 판정: `reserved + entered >= capacity`. 가족(형제) 예약은 인원 합계로 검사한다.
- 회차 이동(12.2)도 **대상 회차의** 불변식을 다시 통과해야 한다 — 이동으로 정원을 넘길 수 없다.
- 위반은 `DuplicateReservationError` · `CapacityExceededError`(도메인 에러) → Server Action이 폼 상태로 변환 (§7).

> ⚠️ 동시성: 서비스의 검사와 삽입 사이에는 경합 구간이 있다. 최종 방어는 DB 제약(`reservations.code` unique)과
> 리포지토리 구현의 몫이다. 정원 경합까지 엄밀히 막으려면 조건부 UPDATE 또는 트랜잭션이 필요하다 — §6.6 참조.

### 6.5 역할·권한 — 문서 충돌과 채택 (결정 S8)

`feature-spec.md` §12.1과 `flows.json`이 충돌한다. **flows.json 채택**:

| | feature-spec.md (7/15 22:05) | flows.json (7/16 00:13) ✅ |
|---|---|---|
| 역할 코드 | `owner \| desk \| teacher` | `owner \| siljang \| gangsa` |
| 2번째 역할 | desk = 통계 **제외** 전체 | 실장 = 원장과 **100% 동일** |
| 3번째 역할 | teacher = 재원생(담당반)·상담·**통계** | 강사 = 재원생·통계 **차단**, 나머지 운영 허용 |

강사 권한이 **거의 정반대**다. 채택 근거: flows.json이 더 최신이고 `_meta`가 스스로 *"진실원(single source of truth)"* 이라 명시하며, 페르소나 시나리오(강사 = 현장 운영 지원)와도 일관된다.

판정은 `entities/user`의 `ROLE_MODULES` · `canAccessModule()` **한 곳**에만 있고, 두 겹으로 강제한다:
- `proxy.ts` — 쿠키 유무만 보는 값싼 1차 방어(로그인 화면으로)
- 각 페이지의 `requireModuleAccess()` — 모듈별 판정. 차단 시 **허브로 리다이렉트**(flows GANGSA-G1 그대로. 에러가 아니다)
- Server Action은 `assertModuleAccess()` — 리다이렉트 대신 도메인 에러(폼 상태로 반환해야 하므로)

### 6.6 알려진 제약 — neon-http에는 대화형 트랜잭션이 없다

현재 드라이버(`drizzle-orm/neon-http`)는 `db.transaction()`을 지원하지 않는다. 다중 테이블 원자 조작은 이렇게 처리했다:

| 조작 | 처리 |
|---|---|
| 설명회 종료 (12.4) | `db.batch()` — 학생 노쇼 카운트 → 예약 노쇼 태깅 → 세션 ended 순서로 원자 실행 |
| 설명회 삭제 (§7.7) | 스키마의 `onDelete: cascade` — 단일 statement라 원자적 |
| 상담 슬롯 예약 (12.10) | `booked=false` 조건부 UPDATE — 경합에서 한 명만 성공 |
| 가족 예약 (12.13) | 단일 multi-row insert |

진짜 트랜잭션이 필요해지면 **`db/client.ts`만** neon-serverless(WebSocket)로 교체하면 된다 — §6.2 **시나리오 ①** 그대로이고, 리포지토리 계약 위로는 영향이 없다. 격리 설계가 실제로 값을 하는 지점.

---

## 7. Server Actions 규약

- 위치: `features/<slice>/api/actions.ts` (참고 구조의 api 세그먼트 승계 — query 훅 자리에 action이 들어온 것)
- 형태: `useActionState` 호환 시그니처 `(prevState, formData) => Promise<State>`
- 필수 순서: **zod 파싱 → 서비스 호출 → revalidatePath → 상태 반환**. 실패는 throw가 아니라 상태(`{ status: "error", message }`)로 반환 (폼 UX)
- action은 얇게: 도메인 규칙은 서비스에, action은 HTTP 경계 어댑터(검증·캐시 무효화)만

## 8. 이음새 예약 — 위치만, 구현 보류 (참고 §12 방식)

| 관심사 | 예약 위치 | 들어오는 시점·방법 |
|---|---|---|
| 디자인 시스템 | `shared/ui/` + `app/globals.css` 토큰 블록 | 새 디자인 시스템 확정 시. 컴포넌트는 `shared/ui`에, 토큰은 globals.css `@theme`에 |
| 인증 | `src/proxy.ts`(지금 통과형) + `shared/lib/auth/` | 풀스택이므로 참고 구조와 달리 **httpOnly 쿠키 + proxy 검사**가 처음부터 자연스러움. 세션 조회는 `server/services/auth` |
| TanStack Query | `entities/<domain>/api/` (자리 유지) + `app/api/`(Route Handler) | 클라이언트 측 폴링·무한스크롤·낙관적 UI가 필요해질 때 해당 도메인만 국소 도입 |
| views 내 RSC 페칭 | ESLint R1의 허용 목록 확장 | 페이지가 커져 스트리밍 분할(Suspense 경계별 페칭)이 필요할 때 |
| widgets 레이어 | 폴더 자체 지연 생성 | 첫 다도메인 조합 블록이 나올 때 (참고 §3.2) |
| 트랜잭션 | `port`에 유스케이스 단위 메서드 추가 | 다중 테이블 원자 변경 등장 시. **계약을 저수준 CRUD가 아닌 유스케이스 언어로 유지**하면 DB별 트랜잭션 차이가 구현 내부에 숨는다 |

## 9. 개발 흐름

```bash
pnpm dev                  # DB 없이 즉시 구동 (REPO_IMPL 미설정 + DATABASE_URL 없음 → memory)
# Neon 연결 시:
#   .env.local에 DATABASE_URL 설정 (Vercel 플러그인 연동 시 자동 주입)
pnpm db:generate          # 스키마 → 마이그레이션 SQL 생성 (drizzle/)
pnpm db:migrate           # 마이그레이션 적용
pnpm dev                  # DATABASE_URL 있으면 자동으로 drizzle 구현 선택
pnpm typecheck && pnpm lint && pnpm build
```

`REPO_IMPL=memory|drizzle`로 강제 지정 가능. 기본값: `DATABASE_URL` 있으면 `drizzle`, 없으면 `memory`.

## 10. 새 도메인 추가 절차 (참고 §4.3 승계 + 서버 확장)

1. `entities/<domain>/model/` — 도메인 모델(순수 TS) + barrel
2. `server/db/schema/<domain>.ts` — 테이블 정의 → `pnpm db:generate`
3. `server/repositories/<domain>.port.ts` — 계약 (도메인 모델 타입으로)
4. `server/repositories/drizzle/` + **`memory/`** 구현 (§6.3 — memory는 선택이 아니라 규칙)
5. `server/repositories/index.ts` 조립에 추가
6. `server/services/<domain>.service.ts` — 유스케이스
7. `features/<행위>/api/actions.ts` (변경) · `app/**/page.tsx` (조회) · `views/<화면>` (조합)

각 단계는 아래 단계만 알므로, 어느 단계에서 멈춰도 컴파일이 깨지지 않는다.

---

## 11. 현재 상태 · 남은 일 (2026-07-16 기준)

**구현됨** — 도메인 모델 12종 / DB 스키마 12테이블 + 마이그레이션 / 리포지토리 계약 + drizzle·memory 두 구현 / 서비스(설명회·예약·재원생·통계·인증) / 서버 불변식 §6.4 / Server Action 뼈대 / 라우트 11개 + 역할 게이팅.

**검증됨** — typecheck·lint·build 통과. 런타임: 역할 게이팅(강사의 재원생·통계 → 허브 리다이렉트, flows GANGSA-G1과 일치), 서버 불변식(중복 → `DUPLICATE_RESERVATION`, 정원·가족 초과 → `CAPACITY_EXCEEDED`), 공개 예약 화면 렌더.

**남은 일**

| 항목 | 비고 |
|---|---|
| 화면 구현 | 설명회 운영의 행 액션 배선(체크인·롤백·전환), 재원생·전화·문자·상담·통계·스캐너·프리뷰 화면. 액션·조회 경로는 준비됨 |
| 모바일 플로우 P2~P6 | 재원생 조회·가족 선택·비재원 폼·완료 티켓·예약 조회/변경/취소·상담·설문 |
| 실제 인증 | 현재는 쿠키에 역할만 담는 최소 구현 — **쿠키 위조로 역할 변경 가능**. §8 이음새 |
| 시작 시각 입력 | 명세 §7.2가 지적한 공백 — 와이어프레임에 필드 없음(10:00 고정). 서버·폼은 값을 받게 해둠 |
| 미연동 (명세 §11) | 실제 카메라·QR 인식, 문자 게이트웨이, 엑셀 실파일 파싱, 배너 실이미지 |
| 예약번호 채번 | drizzle 구현이 count 기반 — 동시성에서 unique 제약이 최종 방어. 시퀀스 테이블로 승격 검토 |

---

*— rev.2 (2026-07-16). 기능 명세(`npr-seminar-feature-spec.md`)·플로우(`npr-seminar-flows.json`) 반영. 결정 S8~S11 추가.*
