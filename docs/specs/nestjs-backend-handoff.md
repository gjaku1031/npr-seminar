# NestJS 백엔드 전환 설계 및 메인 에이전트 인수인계서 (역사 문서)

> 상태: **2026-07-17 구현 전 설계 기록 — 현재 제품 명세로 사용 금지**
> 작성일: 2026-07-17  
> 대상 저장소: npr-seminar  
> 대상 경로: apps/api, packages/contracts, 관련 운영 문서  
> 최종 목표: Next.js 프론트엔드 + NestJS 단일 백엔드 + PostgreSQL + Redis  
> 중요: 이 문서는 기존 Spring 코드를 기계적으로 TypeScript로 번역하라는 지시가 아니다. 확인된 제품 규칙을 기준으로 DB와 API를 바로잡아 NestJS 모듈러 모놀리스로 구현하라는 인수인계서다.

> **현행 기준(2026-07-24)**: 최종 계약은 `packages/contracts/openapi.yaml`, 제품 설명은
> `docs/specs/npr-seminar-feature-spec.md`를 따른다. 이 문서 아래의 좌석 한도·좌석 원장·
> 비율 계산 설계는 모두 폐기되었으며 구현 판단 근거가 아니다. 회차 장소는
> `서울시 교통회관 (올림픽로 319)`로 통일한다. 모니터링은 필터 학생 행 수,
> 중복 없는 활성 가족 예약 수, 실제 참석 학부모 수의 세 절대 건수로만 계산한다.

---

## 0. 메인 에이전트가 가장 먼저 읽을 내용

### 0.1 최종 기술 결정

이번 프로젝트의 백엔드는 다음과 같이 단일화한다.

| 영역 | 채택 |
| --- | --- |
| 프론트엔드 | apps/web의 Next.js |
| 백엔드 | apps/api의 NestJS 단일 애플리케이션 |
| 데이터베이스 | PostgreSQL |
| 단기 상태 | Redis |
| DB 접근 | Prisma를 기본으로 하고 잠금·대량 UPSERT·복잡 조회는 명시적 PostgreSQL SQL 사용 |
| API 계약 | packages/contracts/openapi.yaml |
| 관리자 인증 | Spring Security가 아니라 NestJS 세션 인증 + Redis Session |
| QR 스캐너 | qr-poc의 검증된 브라우저 컴포넌트를 apps/web으로 이식 |
| QR·예약·입장 원장 | NestJS와 PostgreSQL |
| 통통통 학생 원장 | 6시간/수동 동기화된 PostgreSQL |

두 번째 Node 백엔드나 qr-poc 백엔드를 따로 운영하지 않는다. qr-poc는 동작 기준과 프론트 이식 원본으로만 사용한다.

### 0.2 작업 시작 전 STOP-THE-LINE 점검

기존 Spring 초안에는 확정 요구사항과 충돌하는 부분이 있다. 아래를 수정하지 않고 NestJS로 포팅하면 안 된다.

1. 현재 QR credential이 자녀 booking을 참조한다.
   - 확정 요구사항은 가족당 QR 하나다.
   - QR credential은 family_booking을 참조해야 한다.

2. 현재 자녀 booking마다 seat_count가 있다.
   - 학생은 설명회에 참석하지 않는다.
   - 참석자는 MOTHER, FATHER, BOTH 중 하나다.
   - 가족 좌석은 각각 1, 1, 2석이다.
   - 자녀가 여러 명이어도 좌석 수가 증가하면 안 된다.

3. 현재 OpenAPI는 자녀마다 qrToken을 반환한다.
   - 가족 예약 응답 최상위에 QR 하나만 있어야 한다.

4. 현재 OpenAPI 인증은 bearer JWT다.
   - 이번 결정은 관리자 Redis Session 쿠키 인증이다.
   - 쿠키 인증과 CSRF 헤더 계약으로 변경해야 한다.

5. 일부 Spring 문서의 통통통 필드 매핑이 잘못되어 있다.
   - 아래 3.2의 확정 매핑만 사용한다.
   - 추정한 날짜 필드나 등록일 필드를 추가하지 않는다.

6. 현재 OpenAPI YAML에 중복 키가 존재한다.
   - 동일 description 중복과 동일 items.$ref 중복을 제거한다.
   - 구현 전에 OpenAPI validation을 통과시킨다.

7. Spring SQL이나 Java 코드를 폐기하기 전에 실제 DB 적용 여부를 확인한다.
   - PostgreSQL에 Flyway V1이 적용됐는지 먼저 조회한다.
   - 학생 초기 데이터가 존재하는지 확인한다.
   - 데이터가 있다면 reset, drop, truncate, 재생성을 금지한다.
   - 필요한 변경은 forward migration으로만 수행한다.

### 0.3 통통통 계정 보호 최우선 규칙

다음 규칙은 모든 일정, 편의성, 자동복구보다 우선한다.

> 통통통 로그인 또는 인증 요청이 단 한 번이라도 실패하거나 성공 여부가 불명확하면 즉시 전체 동기화를 중단한다. 자동 재시도는 0회다. 사용자가 통통통에 직접 정상 로그인하여 오류 카운트를 초기화했다고 명시적으로 확인하기 전에는 수동·스케줄 동기화를 모두 재개할 수 없다.

실패로 처리할 항목:

- 아이디 또는 비밀번호 거절
- 예상하지 못한 로그인 페이지 재노출
- timeout
- DNS, TLS, connection reset 등 네트워크 오류
- 4xx 또는 5xx
- 예상하지 못한 redirect
- 로그인 성공 판별 요소 누락
- 세션 쿠키 또는 CSRF 상태 판별 불가
- 응답 인코딩 또는 파싱 실패로 성공 여부를 확정할 수 없음
- 분원 전환 또는 학생 목록 요청에서 세션 만료 징후 발견

실패 이후 금지:

- 같은 자격증명 재시도
- 다른 분원으로 전환
- 학생 API 후속 호출
- 다른 HTTP 클라이언트로 fallback
- 스케줄러의 다음 주기 자동 재개
- circuit 자동 TTL 해제

---

## 1. 범위와 비범위

### 1.1 이번 백엔드가 책임지는 것

- 관리자 로그인, 로그아웃, 현재 사용자 조회
- 관리자 및 스캐너 권한
- 설명회와 회차
- 정원과 예약 가능 상태
- 통통통 학생 동기화
- 학생 현황 조회
- SMS OTP
- 가족 예약
- 예약 조회, 변경, 취소
- 가족 QR 발급, 폐기, 재발급
- QR 및 전화번호 뒷자리 입장
- append-only 입장 로그와 예약 이벤트
- SMS 발송 outbox
- OpenAPI와 프론트 생성 클라이언트
- 운영 health, metrics, 감사 로그

### 1.2 이번 백엔드가 책임지지 않는 것

- 브라우저 카메라 제어
- QR 카메라 초점, 줌, 조명
- QR Canvas 렌더링과 PNG 다운로드
- 화면 디자인
- 통통통 화면 자체의 변경
- Google Sheet 연동
- 별도 QR 마이크로서비스
- Redis를 예약 또는 학생 원장으로 사용하는 것

### 1.3 마이크로서비스 금지

초기 운영은 NestJS 모듈러 모놀리스 하나로 한다.

- 예약과 입장을 별도 서비스로 쪼개지 않는다.
- QR 서비스에 별도 DB를 두지 않는다.
- Next.js Server Action이 DB를 직접 수정하지 않는다.
- apps/web과 apps/api가 같은 테이블을 각각 다른 ORM으로 수정하지 않는다.
- 외부 연동은 adapter 모듈로 격리하되 프로세스는 하나로 유지한다.

---

## 2. 아키텍처

### 2.1 런타임 구조

~~~mermaid
flowchart LR
    Browser["Next.js browser UI"] --> Proxy["Same-origin reverse proxy"]
    Proxy --> Web["apps/web Next.js"]
    Proxy --> Api["apps/api NestJS"]
    Api --> Pg["PostgreSQL"]
    Api --> Redis["Redis"]
    Api --> Tong["통통통"]
    Api --> Sms["SMS provider"]
    Worker["NestJS worker process"] --> Pg
    Worker --> Redis
    Worker --> Tong
    Worker --> Sms
~~~

배포 원칙:

- 브라우저 기준 동일 origin을 사용한다.
- 예: / 는 Next.js, /api 는 NestJS로 reverse proxy한다.
- CORS에 의존하지 않는다.
- Redis와 PostgreSQL은 외부 인터넷에 노출하지 않는다.
- API와 worker는 같은 코드베이스를 사용하되 실행 entry point만 분리할 수 있다.

### 2.2 데이터 소유권

| 데이터 | 원장 |
| --- | --- |
| 학생 최신 명단 | PostgreSQL |
| 통통통 원본 세션 | 메모리, 실행 종료 시 폐기 |
| 예약 | PostgreSQL |
| QR 상태 | PostgreSQL |
| 입장 상태와 이력 | PostgreSQL |
| OTP verifier와 TTL | Redis |
| OTP 감사 metadata | PostgreSQL |
| 관리자 세션 | Redis |
| rate limit | Redis |
| idempotency 결과 | PostgreSQL |
| SMS 발송 outbox | PostgreSQL |

Redis가 유실되어도 다음은 손상되면 안 된다.

- 학생 데이터
- 예약
- 정원
- QR 폐기 상태
- 입장 상태
- 감사 로그

Redis 유실 시 허용되는 결과:

- 관리자가 다시 로그인
- 진행 중 OTP가 무효화
- rate limit counter 초기화

### 2.3 모듈 의존 방향

~~~mermaid
flowchart TD
    Controllers["Controllers / OpenAPI boundary"] --> Services["Application services"]
    Services --> Repositories["Repositories"]
    Services --> Ports["External ports"]
    Repositories --> PostgreSQL["Prisma and PostgreSQL SQL"]
    Ports --> Adapters["TongTongTong / SMS / Redis adapters"]
~~~

금지:

- Controller에서 Prisma 직접 호출
- Controller에서 Redis 직접 호출
- Repository에서 SMS 또는 통통통 호출
- 통통통 HTTP 요청 안에서 DB transaction 유지
- Prisma model을 API 응답 타입으로 직접 반환
- apps/web 타입을 apps/api 내부 도메인 타입으로 import

---

## 3. 확정 제품 규칙

### 3.1 분원

내부 코드:

- SONGPA
- WIRYE
- GWANGJIN

화면 라벨:

- 송파
- 위례
- 광진

학생 번호는 세 분원 전체에서 유일하다. 현재 학생 소속 분원은 변경될 수 있으므로:

- students.branch_id는 현재 소속
- 예약 자녀 연결에는 예약 당시 분원 snapshot을 보존
- 예약/입장 로그는 이후 학생 분원 이동으로 변경하지 않는다.

### 3.2 통통통 확정 필드 매핑

아래 매핑 이외의 의미를 추정하지 않는다.

| 통통통 키 | 의미 | 저장 대상 |
| --- | --- | --- |
| m1 | 학번/학생 고유번호 | source_student_no |
| m2 | 학생 이름 | name |
| m3 | 반명 | class_name |
| m5 | 어머니 연락처 | mother phone 처리 필드 |
| m6 | 학교 | school_name |
| m8 | 학년 | grade |
| m10 | 담임명 | teacher_name |
| m20 | 원천 상태/재원 상태 | source_status |

추가 규칙:

- 재원생만 가져온다.
- 학생 목록 요청 필터는 selbs_inorout=NN이다.
- seltd_schlevel을 보내지 않는다.
- 반명 m3에 [ 또는 ]가 하나라도 포함되면 제외한다.
- 아버지 연락처는 가져오거나 저장하지 않는다.
- unit은 반명에서 기존 확정 규칙으로 파생한다.
- source_student_no m1은 전 분원 전역 unique다.
- 알려지지 않은 날짜나 상태 필드를 임의 매핑하지 않는다.

### 3.3 통통통 분원 전환

- 같은 계정으로 한 번 로그인한다.
- 같은 세션에서 송파 → 위례 → 광진 순서로 전환한다.
- 분원 fetch를 병렬 실행하지 않는다.
- 각 분원 fetch 전에 현재 분원 컨텍스트를 검증한다.
- 전환 방식과 요청 필드는 실제 네트워크 확인 전까지 추정 구현하지 않는다.

### 3.4 가족 예약과 참석 인원

학생은 참석하지 않는다.

| attendance_party | 참석자 | 좌석 |
| --- | --- | --- |
| MOTHER | 어머니 | 1 |
| FATHER | 아버지 | 1 |
| BOTH | 부모 모두 | 2 |

규칙:

- 클라이언트가 seatCount를 임의 제출하지 않는다.
- 서버가 attendance_party로 seat_count를 계산한다.
- 자녀가 여러 명이어도 가족 좌석은 1 또는 2다.
- 가족 예약은 한 회차에 자녀 한 명 이상을 연결한다.
- 같은 회차에서 같은 어머니 연락처의 활성 가족 예약은 하나다.
- 같은 회차에서 같은 학생의 활성 연결은 하나다.
- 취소가 아닌 모든 정원 변경은 capacity row lock 아래에서 처리한다.

### 3.5 가족 QR

- 가족 예약 하나당 활성 QR 하나
- QR 한 번 스캔으로 그 가족의 선택 부모 전체가 입장
- BOTH이면 한 번의 입장으로 2석이 입장 처리
- 연결된 모든 자녀는 같은 가족 입장 결과를 화면에서 공유
- QR 원문은 DB, 로그, tracing, analytics에 저장하지 않는다.
- DB에는 token digest만 저장
- 재발급 시 기존 credential을 revoke하고 version을 증가
- 이전 QR은 즉시 무효

### 3.6 공개 예약 인증

- 공개 예약 조회, 변경, 취소는 SMS OTP 인증
- 이름 + 전화번호만으로 예약을 노출하지 않는다.
- OTP 성공 후 목적과 연락처에 제한된 짧은 proof를 발급한다.
- proof는 한 번 사용하거나 짧은 TTL을 가진다.
- OTP와 관리자 로그인은 별도 인증 흐름이다.

### 3.7 로그 보존

- hard delete 금지
- 예약 생성, 변경, 취소, QR 재발급, QR 폐기, 입장 시도를 append-only로 기록
- 목록에는 최신 로그를 보여줄 수 있음
- 클릭 시 전체 로그 목록을 시간순 모달로 조회
- 성공, 중복, 실패를 모두 기록
- 로그에서 QR 원문, OTP, 쿠키, 비밀번호, 통통통 응답 원문을 제외

---

## 4. 목표 모노레포 구조

NestJS 전환 후 pnpm workspace에 apps/api를 포함한다.

~~~text
npr-seminar
├── apps
│   ├── web
│   └── api
│       ├── package.json
│       ├── nest-cli.json
│       ├── tsconfig.json
│       ├── tsconfig.build.json
│       ├── prisma
│       │   ├── schema.prisma
│       │   └── migrations
│       ├── src
│       │   ├── main.ts
│       │   ├── worker.ts
│       │   ├── app.module.ts
│       │   ├── common
│       │   │   ├── auth
│       │   │   ├── config
│       │   │   ├── errors
│       │   │   ├── idempotency
│       │   │   ├── logging
│       │   │   ├── prisma
│       │   │   ├── redis
│       │   │   └── validation
│       │   └── modules
│       │       ├── admin-auth
│       │       ├── students
│       │       ├── student-sync
│       │       ├── seminars
│       │       ├── family-bookings
│       │       ├── otp
│       │       ├── qr
│       │       ├── check-in
│       │       ├── scanner-devices
│       │       ├── sms
│       │       └── audit
│       └── test
│           ├── integration
│           ├── concurrency
│           ├── contract
│           └── fixtures
├── packages
│   └── contracts
│       ├── openapi.yaml
│       ├── src
│       │   ├── generated
│       │   └── interfaces
│       └── package.json
└── docs
    └── specs
~~~

### 4.1 기능 모듈 내부 구조

과도한 헥사고날 구조 대신 기능별 MVC를 사용한다.

~~~text
modules/check-in
├── check-in.module.ts
├── controller
│   └── check-in.controller.ts
├── service
│   └── check-in.service.ts
├── repository
│   ├── check-in.repository.ts
│   └── check-in-query.repository.ts
├── dto
├── mapper
└── model
~~~

규칙:

- service가 transaction 경계다.
- repository는 같은 모듈 service에서만 사용한다.
- 다른 모듈은 service의 공개 메서드를 호출한다.
- circular dependency와 forwardRef 사용을 금지한다.
- 공용화는 실제 두 모듈 이상에서 안정적으로 반복될 때만 한다.

---

## 5. 패키지와 도구 선택

### 5.1 기본

- NestJS
- Nest Express adapter
- TypeScript strict mode
- Prisma Client
- PostgreSQL driver
- Redis client
- express-session
- connect-redis
- Passport local strategy
- Argon2id
- class-transformer
- class-validator
- @nestjs/swagger
- @nestjs/throttler
- 구조화 logger와 민감 필드 redaction
- Vitest 또는 Jest 중 Nest 프로젝트 하나로 통일
- Testcontainers PostgreSQL, Redis

정확한 버전은 구현 시작 시 공식 문서와 호환표를 확인하고 lockfile에 고정한다. prerelease와 floating latest를 운영에 사용하지 않는다.

### 5.2 선택하지 않는 것

- TypeORM과 Prisma 동시 사용
- Sequelize
- GraphQL
- CQRS package
- Kafka
- 별도 API gateway
- Redis ORM
- BullMQ가 필요하지 않은 단순 동기 처리까지 무조건 queue화
- DB constraint 대신 애플리케이션 선조회만 사용하는 구현

### 5.3 Prisma 사용 원칙

- 일반 CRUD는 Prisma Client
- 정원, 예약, QR, 입장 transaction은 Prisma interactive transaction
- SELECT FOR UPDATE, advisory lock, 조건부 UPDATE RETURNING은 명시적 SQL
- 대량 학생 staging/UPSERT는 batch SQL 또는 COPY
- 모든 SQL parameter binding 사용
- 문자열 연결 SQL 금지
- prisma db push를 공유/운영 DB에서 금지
- 운영은 versioned migration만 사용
- partial unique index, trigger, check constraint는 migration SQL로 명시

---

## 6. OpenAPI와 Controller 인터페이스

### 6.1 단일 계약 원본

packages/contracts/openapi.yaml을 원본으로 유지한다.

- 프론트와 백엔드는 DB model을 공유하지 않는다.
- OpenAPI에서 TypeScript operation type을 생성한다.
- 생성 파일은 packages/contracts/src/generated에 둔다.
- 생성 파일은 직접 수정하지 않는다.
- Controller는 tag별 인터페이스를 구현한다.
- DTO class는 생성 타입을 implements하고 runtime validation decorator를 가진다.

개념 예시:

~~~typescript
type CheckInOperation = Operations["checkInFamilyByQr"];

export interface CheckInApi {
  checkIn(
    body: RequestBody<CheckInOperation>,
    idempotencyKey: string,
    actor: AuthenticatedActor,
  ): Promise<ResponseBody<CheckInOperation, 200>>;
}
~~~

~~~typescript
@Controller("/api/v1/admin/check-ins")
export class CheckInController implements CheckInApi {
  constructor(private readonly checkInService: CheckInService) {}

  @Post("/qr")
  async checkIn(
    @Body() body: CheckInRequestDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<CheckInResponse> {
    return this.checkInService.checkInByQr(body, idempotencyKey, actor);
  }
}
~~~

### 6.2 계약 품질 게이트

CI에서 반드시 실행:

1. OpenAPI 3.1 syntax validation
2. operationId unique 검증
3. code generation
4. 생성 후 git diff가 없는지 확인
5. Nest e2e 응답을 OpenAPI schema로 검증
6. 이전 계약과 breaking diff 검증

금지:

- Controller 응답에 임의 필드 추가
- undocumented 200 response
- Prisma enum을 API enum으로 직접 export
- 동일 YAML key 중복
- writeOnly secret가 response에 포함

### 6.3 인증 계약 변경

기존 bearerAuth를 다음으로 변경한다.

- 관리자 session cookie
- mutating admin request의 X-CSRF-Token
- 공개 OTP/예약 endpoint는 security 없음
- 스캐너도 session 또는 제한된 scanner session 사용

OpenAPI에 Set-Cookie의 원문 예시나 실제 세션 값은 기록하지 않는다.

---

## 7. 관리자 인증과 세션

### 7.1 인증 흐름

~~~mermaid
sequenceDiagram
    participant W as Web
    participant A as Nest API
    participant P as PostgreSQL
    participant R as Redis

    W->>A: POST /auth/login + CSRF
    A->>P: 관리자 조회
    A->>A: Argon2id verify
    A->>R: 신규 session 저장
    A-->>W: HttpOnly session cookie
    W->>A: GET /auth/me
    A->>R: session 조회
    A-->>W: 최소 관리자 profile
~~~

### 7.2 세션 규칙

- 세션 cookie 이름을 기본 connect.sid 대신 프로젝트 전용으로 설정
- HttpOnly=true
- Secure=true in production
- SameSite=Lax
- Path=/
- Domain은 가능하면 설정하지 않음
- 로그인 성공 시 session ID regeneration
- 로그아웃 시 Redis session 삭제 및 cookie 만료
- idle TTL과 absolute TTL을 구분
- reverse proxy trust proxy 값을 정확히 1 hop 또는 명시된 proxy로 제한
- session secret은 최소 32바이트 랜덤
- session secret을 Git, YAML, command argument에 넣지 않음

### 7.3 관리자 계정

- 공개 회원가입 없음
- 최초 관리자는 one-time bootstrap command 또는 승인된 seed 절차
- 비밀번호 Argon2id hash
- username/email unique
- active flag
- 역할 ADMIN, SCANNER
- SCANNER는 입장과 회차 조회만 허용
- 비밀번호나 hash를 로그에 기록하지 않음

### 7.4 CSRF

cookie session을 사용하므로 state-changing request에 CSRF 보호가 필수다.

- GET /api/v1/auth/csrf에서 토큰 발급
- session 또는 검증 가능한 double-submit 방식
- POST, PUT, PATCH, DELETE는 X-CSRF-Token 필수
- Origin과 Host를 same-origin으로 검증
- JSON content type만 허용
- CSRF를 개발 편의 목적으로 전체 비활성화하지 않음

### 7.5 로그인 공격 방어

- IP + 계정 조합 rate limit
- 동일 오류 메시지로 계정 존재 여부 숨김
- 성공/실패 감사 로그
- session fixation 테스트
- 로그아웃 후 기존 cookie 재사용 실패 테스트
- Redis 재시작 후 세션 무효화 허용

---

## 8. 데이터 모델

### 8.1 공통 규칙

- 외부 ID: UUID
- 내부 join ID: bigint identity
- timestamp: timestamptz
- DB naming: snake_case
- API naming: camelCase
- 상태값: varchar + check constraint 또는 PostgreSQL enum 중 하나로 통일
- 모든 FK index 확인
- soft delete 또는 상태 전이 사용
- audit table UPDATE/DELETE trigger 차단

### 8.2 학생

students 핵심 필드:

| 필드 | 설명 |
| --- | --- |
| public_id | 외부 UUID |
| source_student_no | m1, 전 분원 unique |
| branch_id | 현재 소속 |
| name | m2 |
| class_name | m3 |
| school_name | m6 |
| grade | m8 |
| teacher_name | m10 |
| unit_name | class_name 파생 |
| mother_phone_ciphertext | m5 암호화 값 |
| mother_phone_digest | 정확 일치용 HMAC |
| mother_phone_last4 | 현장 후보 조회용 4자리 |
| source_status | m20 |
| source_active | 최신 성공 snapshot 포함 여부 |
| source_hash | 변경 감지 |
| first_seen_run_id | 최초 확인 |
| last_seen_run_id | 마지막 확인 |

전화번호:

- normalization 후 8~15 digits만 허용
- 정확 조회는 HMAC digest
- 뒷자리 조회는 last4 index
- 전체 번호가 필요한 관리자/SMS 경로에서만 decrypt
- API public response에는 전체 번호 금지
- admin response도 필요 없는 화면에서는 마스킹
- 암호화 키와 HMAC 키는 별도 secret

### 8.3 가족 예약

family_bookings:

| 필드 | 설명 |
| --- | --- |
| public_id | 외부 UUID |
| session_id | 설명회 회차 |
| mother_contact_digest | 가족 중복/OTP 연결 |
| attendance_party | MOTHER/FATHER/BOTH |
| seat_count | 서버 계산 1/1/2 |
| status | RESERVED/CHECKED_IN/CANCELLED/NO_SHOW |
| otp_challenge_id | 검증 근거 |
| checked_in_at | 최초 성공 입장 |
| created_at | 예약 시간 |
| cancelled_at | 취소 시간 |

family_booking_students:

| 필드 | 설명 |
| --- | --- |
| family_booking_id | 가족 예약 |
| student_id | 현재 학생 row |
| branch_id_at_booking | 예약 당시 분원 |
| source_student_no_snapshot | 예약 당시 학번 |
| student_name_snapshot | 예약 당시 이름 |
| class_name_snapshot | 예약 당시 반 |
| school_name_snapshot | 예약 당시 학교 |
| grade_snapshot | 예약 당시 학년 |

중요:

- family_booking_students에 seat_count를 두지 않는다.
- 자녀 link별 QR을 두지 않는다.
- 자녀 link별 checked_in 상태를 원장으로 두지 않는다.
- 한 가족 입장이 연결된 자녀 화면 상태를 결정한다.

### 8.4 정원

session_capacities:

- session_id PK
- capacity
- reserved_count
- checked_in_count 선택
- version
- check 0 <= reserved_count <= capacity

예약 transaction에서:

1. capacity row FOR UPDATE
2. family duplicate 확인
3. child duplicate 확인
4. reserved_count + seat_count <= capacity 확인
5. family booking insert
6. child link insert
7. reserved_count 증가

취소 transaction에서:

- RESERVED 상태일 때만 capacity 반환
- CHECKED_IN 취소 정책은 별도 관리자 규칙 없이는 거절
- idempotent cancellation

### 8.5 QR credential

qr_credentials:

| 필드 | 설명 |
| --- | --- |
| family_booking_id | 가족 예약 FK |
| token_digest | SHA-256 digest, unique |
| version | 가족별 증가 |
| status | ACTIVE/REVOKED/EXPIRED |
| issued_at | 발급 시간 |
| expires_at | 만료 |
| revoked_at | 폐기 |
| superseded_by_id | 재발급 연결 |

제약:

- 가족 예약당 ACTIVE credential 하나인 partial unique index
- raw token column 금지
- active인데 revoked_at이 있는 상태 금지
- token digest 정확히 32바이트

### 8.6 입장 이벤트

check_in_events는 append-only다.

필수 필드:

- event_id UUID
- family_booking_id nullable
- qr_credential_id nullable
- session_id
- source QR 또는 MANUAL
- result
- seat_count
- scanner_device_id nullable
- gate_code
- actor_subject
- idempotency_key_digest
- occurred_at
- safe metadata JSON

result:

- CHECKED_IN
- ALREADY_CHECKED_IN
- CANCELLED
- SESSION_MISMATCH
- EXPIRED_QR
- REVOKED_QR
- INVALID_QR
- RESERVATION_NOT_FOUND
- NOT_AUTHORIZED

로그에는 넣지 않는 것:

- qrToken
- phone 전체 값
- OTP
- cookie
- 비밀번호
- 통통통 credential
- 통통통 body

### 8.7 예약 이벤트와 outbox

booking_events 또는 domain_events:

- CREATED
- UPDATED
- CANCELLED
- QR_ISSUED
- QR_ROTATED
- QR_REVOKED
- CHECKED_IN

outbox_messages:

- event_id unique
- message_type
- aggregate_id
- recipient_ciphertext 또는 안전한 참조
- payload 최소화
- status PENDING/SENDING/SENT/FAILED/DEAD
- attempt_count
- next_attempt_at
- last_error_code

SMS 외부 호출을 DB transaction 안에서 실행하지 않는다.

---

## 9. 핵심 트랜잭션

### 9.1 가족 예약 생성

입력:

- sessionId
- otpProof 또는 verifiedChallengeId
- motherContact
- attendanceParty
- studentIds
- Idempotency-Key

순서:

1. 입력 정규화 및 runtime validation
2. mother contact HMAC digest 계산
3. idempotency key digest 계산
4. 짧은 DB transaction 시작
5. idempotency row 또는 advisory lock 확보
6. 동일 key replay면 request digest 비교
7. session과 capacity row FOR UPDATE
8. session OPEN 및 예약 기간 검증
9. OTP verified, 목적, contact digest, 미사용 검증
10. studentIds 정렬 후 학생 row lock
11. 모두 active인지 확인
12. 가족 중복과 자녀 중복 확인
13. attendanceParty에서 seatCount 계산
14. 정원 확인
15. family_booking insert
16. family_booking_students batch insert
17. capacity 증가
18. OTP proof consume
19. 가족 QR credential insert
20. booking event와 SMS outbox insert
21. idempotency response snapshot insert
22. commit
23. 첫 성공 응답에서만 raw QR token 반환

Replay:

- 동일 key + 동일 body: 같은 familyBookingId 반환
- raw QR token은 저장하지 않았으므로 replay 응답에서 반환하지 않음
- 동일 key + 다른 body: 409

### 9.2 QR 입장

입력:

- qrToken
- expectedSessionId
- scannerDeviceId
- gateCode
- Idempotency-Key

순서:

1. token 형식과 최대 길이를 DB 접근 전에 검증
2. SHA-256 digest 계산
3. transaction 시작
4. idempotency 확보
5. qr_credentials digest 조회 및 row lock
6. credential ACTIVE/expiry 검증
7. family_booking row lock
8. expected session 검증
9. 취소 상태 검증
10. 이미 CHECKED_IN이면 ALREADY_CHECKED_IN 이벤트 append
11. RESERVED면 조건부 UPDATE로 CHECKED_IN 전이
12. checked_in_at 기록
13. check_in_event append
14. booking event와 SMS outbox insert
15. idempotency snapshot insert
16. commit

동시성 불변식:

- 같은 QR을 여러 기기가 동시에 스캔해도 CHECKED_IN 성공은 정확히 하나
- 나머지는 ALREADY_CHECKED_IN
- 성공 SMS outbox는 하나
- 모든 시도는 별도 check_in_event

### 9.3 전화번호 뒷자리 수동 입장

후보 조회:

- 관리자 또는 SCANNER session 필수
- selected session 필수
- 정확히 숫자 4자리
- mother_phone_last4 index 사용
- 해당 session의 활성 가족 예약만 우선 조회
- 후보에는 가족 예약 ID, 마스킹 번호, 연결 자녀, 참석자 유형, 상태 표시
- 동일 4자리 후보가 여러 개면 운영자가 명시 선택

입장:

- familyBookingId를 입력
- QR과 같은 CheckInService 내부 transition 사용
- source만 MANUAL
- idempotency와 append-only 로그 동일 적용

기본 정책:

- 예약 없는 가족의 즉석 입장은 허용하지 않는다.
- 필요하면 ADMIN 전용 별도 override use case와 사유 입력을 제품 결정 후 추가한다.
- qr-poc의 미예약 학생 자동 입장을 그대로 복사하지 않는다.

### 9.4 QR 재발급

1. family booking lock
2. active credential lock
3. 기존 credential REVOKED
4. 새 random token 생성
5. 새 digest/version insert
6. predecessor link
7. append-only event
8. commit
9. raw token 한 번 반환

### 9.5 예약 취소

- OTP proof 또는 관리자 session 필요
- idempotent
- CHECKED_IN 이후 일반 사용자의 취소 금지
- RESERVED 취소 시 capacity 반환
- active QR revoke
- cancellation event와 SMS outbox
- hard delete 금지

---

## 10. QR 토큰과 URL

### 10.1 토큰

- crypto.randomBytes 기반 최소 32바이트
- base64url, padding 없음
- 예측 가능한 UUID sequence 금지
- token은 bearer credential로 취급
- digest는 SHA-256
- 필요하면 digest에 별도 pepper를 도입하되 키 rotation 계획 필수

### 10.2 URL

- DB에 전체 absolute QR URL을 저장하지 않는다.
- 안정된 프론트 경로 /q/{token} 사용
- public base origin은 배포 config
- 도메인 변경이 DB migration을 요구하지 않아야 한다.
- reverse proxy access log에서 /q token path를 redact하거나 query/path logging 정책을 조정한다.

### 10.3 공개 QR pass

공개 pass endpoint는 최소 정보만 반환:

- 설명회 이름
- 일시
- 장소
- 입장 상태
- 참석 인원
- 마스킹된 연락처

전체 전화번호, 내부 ID, token digest를 반환하지 않는다.

---

## 11. qr-poc 이식 지침

참고 저장소:

- https://github.com/hge2ne/qr-poc

구현 전에 main branch의 정확한 commit SHA를 기록한다. branch 이름만 기준으로 이식하지 않는다.

### 11.1 프론트로 이식할 것

- src/components/QRScanner.tsx
- src/components/QRCodeDisplay.tsx
- src/components/ScannerManualEntry.tsx의 UX
- scanner/ScannerClient.tsx의 결과 패널과 device 선택 UX
- 전/후면 카메라 fallback
- iPad 감지
- focus, zoom, torch
- 카메라 재요청과 cleanup
- 동일 token client-side cooldown
- 잘못된 회차, 이미 입장, 유효하지 않은 QR UI

### 11.2 서버로 포팅하되 다시 설계할 것

- verifyQRToken
- 전화번호 뒷자리 후보 조회
- 예약/입장 transaction
- QR 발급과 재발급
- SMS 호출
- 입장 로그

### 11.3 절대 복사하지 않을 것

- Base64 JSON session
- 평문 비밀번호
- raw qrToken DB column
- raw qrToken 로그
- SELECT 후 무조건 UPDATE하는 입장 처리
- 오류만 저장하는 EntryLog
- 자녀별 QR
- 미예약 학생을 자동 attendee로 만드는 로직
- Server Action에서 Prisma 직접 호출
- client localStorage gate 값을 신뢰하는 서버 로그

### 11.4 스캐너 입력 validation

현재 POC는 인식 문자열에서 token을 못 찾으면 전체 문자열을 token으로 보낼 수 있다. 새 구현:

- 허용 scheme은 https
- 운영 host allowlist
- 허용 path는 /q/{token}, /verify/{token}
- bare token 허용 여부는 production에서 false를 기본
- token 정규식과 최대 길이 검증
- 잘못된 payload를 DB token lookup 전에 거절

클라이언트 cooldown은 UX일 뿐 보안이나 멱등성 경계가 아니다. 서버 idempotency와 DB transaction이 최종 권위다.

---

## 12. 통통통 동기화

### 12.1 모듈

~~~text
modules/student-sync
├── controller
├── service
│   ├── student-sync-orchestrator.service.ts
│   ├── student-normalizer.service.ts
│   ├── student-promotion.service.ts
│   └── tong-auth-circuit.service.ts
├── repository
├── gateway
│   ├── tongtontong.gateway.ts
│   └── disabled-tongtontong.gateway.ts
├── scheduler
└── model
~~~

실제 로그인/분원 전환 wire format이 확인되기 전에는 disabled gateway가 네트워크 요청 없이 실패해야 한다.

### 12.2 인증 circuit

tong_auth_circuit singleton:

- status CLOSED/OPEN
- opened_at
- opened_reason_code
- opened_run_id
- last_reset_at
- last_reset_by
- version

tong_auth_circuit_audit append-only:

- OPENED
- RESET
- actor
- safe reason code
- occurred_at

인증 시도 전:

1. DB circuit lock
2. OPEN이면 외부 호출 없이 TONG_AUTH_CIRCUIT_OPEN
3. CLOSED면 해당 run의 loginAttempted=false 확인
4. loginAttempted=true를 durable하게 기록
5. 외부 login 한 번 실행

실패 시:

1. 별도 짧은 transaction으로 circuit OPEN
2. audit append
3. 현재 run FAILED
4. 남은 branch run 취소
5. 운영 alert

Reset endpoint:

- ADMIN only
- CSRF 필수
- 사용자가 직접 정상 로그인하여 카운트를 초기화했음을 명시적으로 확인
- confirmation boolean만으로 부족하면 확인 문구 입력
- reset reason 필수
- 외부 로그인 테스트를 수행하지 않음
- audit append
- 자동 reset 없음

### 12.3 HTTP client

- 자동 retry interceptor 금지
- redirect 자동 추종은 로그인 흐름에 맞게 제한하고 모든 redirect 검증
- connection timeout, response timeout 명시
- cookie jar는 메모리
- cookie dump 금지
- request/response body logging 금지
- OpenTelemetry span attribute에 credential, URL query, contact 금지
- 분원 fetch 병렬화 금지

### 12.4 6시간/수동 흐름

~~~mermaid
flowchart TD
    A["DB lease 획득"] --> B["auth circuit CLOSED 확인"]
    B --> C["로그인 1회"]
    C --> D["송파 전환 및 fetch"]
    D --> E["위례 전환 및 fetch"]
    E --> F["광진 전환 및 fetch"]
    F --> G["3분원 stage/validation"]
    G --> H["전역 m1 충돌 검증"]
    H --> I["짧은 promotion transaction"]
    I --> J["run 종료 및 lease 해제"]
    C -->|실패 또는 불명확| X["circuit OPEN 및 즉시 중지"]
~~~

스케줄:

- Asia/Seoul
- 6시간마다
- manual sync와 같은 orchestrator
- PostgreSQL lease로 중복 실행 차단
- 앱 인스턴스가 여러 개여도 하나만 수행

### 12.5 분원 snapshot 검증

promotion 금지:

- 빈 snapshot
- 동일 분원 m1 중복
- 분원 간 m1 중복
- 파싱 오류
- 예상 대비 급격한 row count 변화
- 인증 또는 분원 컨텍스트 불명확
- staging 미완료

failed branch는 기존 학생을 inactive로 만들지 않는다.

초기 적재:

1. 3분원 dry run
2. 건수, 제외, 충돌 보고
3. 사용자가 publish 대상 run 확인
4. 정확한 run ID를 all-or-nothing publish
5. publish 후 ANALYZE

---

## 13. 학생 현황 API

기능:

- 전체 또는 분원 필터
- 이름, 학교, 학번, 연락처 검색 정책
- 학년, 반, 담임, 단위 필터
- 페이지네이션
- 최신 동기화 시간과 상태
- 수동 동기화 버튼

분원 열:

- 전체 필터에서 학번과 학생 이름 사이에 표시
- 특정 분원 필터에서는 숨김
- 이는 프론트 규칙이지만 API는 모든 row에 branch를 반환

권장 endpoint:

- GET /api/v1/admin/students
- GET /api/v1/admin/students/{studentId}
- GET /api/v1/admin/students/{studentId}/history
- GET /api/v1/admin/student-sync/status
- POST /api/v1/admin/student-sync/runs
- POST /api/v1/admin/student-sync/circuit/reset

목록 query는 jOOQ 대신 Prisma raw SQL repository로 구현할 수 있다. 동적 정렬 field는 allowlist로 제한한다.

---

## 14. 권장 API 목록

### 14.1 Auth

- GET /api/v1/auth/csrf
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET /api/v1/auth/me

### 14.2 Public OTP

- POST /api/v1/public/otp/challenges
- POST /api/v1/public/otp/challenges/{challengeId}/verify

### 14.3 Public booking

- POST /api/v1/public/family-bookings
- POST /api/v1/public/booking-access/challenges
- GET /api/v1/public/family-bookings/{familyBookingId}
- PATCH /api/v1/public/family-bookings/{familyBookingId}
- POST /api/v1/public/family-bookings/{familyBookingId}/cancel
- GET /api/v1/public/qr-passes/{token}

### 14.4 Admin students

- GET /api/v1/admin/students
- GET /api/v1/admin/students/{studentId}
- GET /api/v1/admin/students/{studentId}/history
- GET /api/v1/admin/student-sync/status
- GET /api/v1/admin/student-sync/runs
- POST /api/v1/admin/student-sync/runs
- GET /api/v1/admin/student-sync/runs/{runId}
- POST /api/v1/admin/student-sync/initial-load/dry-runs
- POST /api/v1/admin/student-sync/initial-load/dry-runs/{runId}/publish
- POST /api/v1/admin/student-sync/circuit/reset

### 14.5 Admin booking and QR

- GET /api/v1/admin/family-bookings
- GET /api/v1/admin/family-bookings/{familyBookingId}
- GET /api/v1/admin/family-bookings/{familyBookingId}/events
- POST /api/v1/admin/family-bookings/{familyBookingId}/qr/rotation
- DELETE /api/v1/admin/family-bookings/{familyBookingId}/qr

### 14.6 Check-in

- GET /api/v1/admin/check-in/sessions
- POST /api/v1/admin/check-ins/qr
- GET /api/v1/admin/check-in/candidates
- POST /api/v1/admin/check-ins/manual
- GET /api/v1/admin/family-bookings/{familyBookingId}/check-in-events

### 14.7 Scanner device

- GET /api/v1/admin/scanner-devices
- POST /api/v1/admin/scanner-devices/{deviceId}/heartbeat

모든 durable POST/PATCH/DELETE는 Idempotency-Key 적용 범위를 검토한다.

---

## 15. Redis keyspace

key prefix에 환경과 앱 이름을 포함한다.

예시:

- npr:prod:session:{sessionId}
- npr:prod:otp:{challengeId}
- npr:prod:rate:{scope}:{digest}
- npr:prod:scanner:{deviceId}:heartbeat

금지:

- 전화번호 원문을 key에 사용
- QR token 원문을 key에 사용
- password나 OTP를 value에 평문 저장
- 예약 원장을 Redis에만 저장
- KEYS 명령 운영 사용

TTL:

- session: 정책에 맞춘 rolling TTL
- OTP: 수분 단위
- rate limit: window 단위
- heartbeat: 짧은 TTL

Redis 장애 정책:

- 관리자 API 인증 실패 closed
- OTP 발급/검증 503 fail closed
- 예약 생성에서 OTP proof 확인 불가하면 503
- 학생 동기화와 PostgreSQL 관리 조회는 Redis에 의존하지 않음

---

## 16. 오류 모델

RFC 9457 application/problem+json 형식을 유지한다.

필수:

- type
- title
- status
- detail
- instance
- code
- traceId

detail에 넣지 않는 것:

- DB SQL 원문
- stack trace
- credential
- phone 전체 값
- QR token
- OTP
- 외부 응답 body

도메인 오류 예:

- AUTH_INVALID_CREDENTIALS
- CSRF_INVALID
- SESSION_REQUIRED
- CAPACITY_EXCEEDED
- DUPLICATE_FAMILY_BOOKING
- DUPLICATE_STUDENT_BOOKING
- OTP_INVALID
- OTP_EXPIRED
- QR_INVALID
- QR_REVOKED
- QR_EXPIRED
- CHECK_IN_SESSION_MISMATCH
- TONG_AUTH_CIRCUIT_OPEN
- TONG_AUTH_FAILED_STOPPED
- SYNC_CONFLICT

scanner의 정상적인 도메인 결과는 200 + result enum으로 반환할 수 있다. 인증 실패와 malformed request는 401/403/400으로 구분한다.

---

## 17. 로깅과 개인정보

구조화 로그 필수 필드:

- timestamp
- level
- service
- environment
- traceId
- requestId
- operationId
- safe actor ID
- safe resource public ID
- error code
- duration

redact:

- authorization
- cookie
- set-cookie
- x-csrf-token
- qrToken
- oneTimeCode
- motherContact
- passwords
- 통통통 username/password
- 모든 외부 cookie
- request/response body 기본값

전화번호는 필요한 경우 마지막 2자리 이하의 마스킹만 로그에 사용한다. 가능하면 digest correlation ID를 사용한다.

reverse proxy와 APM도 같은 redaction 정책을 적용한다. 애플리케이션에서 숨겨도 proxy access log에 QR path가 남으면 보호가 깨진다.

---

## 18. 테스트 전략

### 18.1 단위 테스트

- 전화번호 normalization
- attendanceParty → seatCount
- 반명은 bracketless 또는 승인된 단일 끝 timetable suffix만 허용하고, 그 밖의 bracket/별표는 제외
- unit 파생
- QR token 형식과 digest
- source hash 안정성
- 오류 매핑
- 통통통 성공 판별
- circuit state transition

### 18.2 PostgreSQL 통합 테스트

실제 PostgreSQL Testcontainer 사용:

- 모든 migration 적용
- partial unique index
- append-only trigger
- FK와 check constraint
- 예약 생성 rollback
- 취소 capacity 반환
- QR rotation
- idempotency replay
- 같은 key 다른 body 409

SQLite 대체 테스트 금지.

### 18.3 동시성 테스트

반드시 포함:

1. 마지막 1석에 20개 동시 예약
   - 정확히 허용 가능한 수만 성공
   - reserved_count가 capacity 초과 금지

2. 같은 학생 20개 동시 예약
   - 활성 child link 하나

3. 같은 가족 QR 20개 동시 scan
   - CHECKED_IN 하나
   - ALREADY_CHECKED_IN 19개
   - 성공 outbox 하나
   - check_in_events 20개

4. 같은 idempotency key 병렬 replay
   - 하나의 resource

### 18.4 통통통 adapter 테스트

실계정 자동 테스트 금지.

fixture/fake server로:

- 로그인 성공
- 로그인 거절
- timeout
- 500
- 예상하지 못한 redirect
- 로그인 페이지 재노출
- branch switch 실패
- 잘못된 encoding
- 빈 snapshot
- 중복 m1

각 인증 실패 테스트에서 확인:

- 외부 login call 정확히 1회
- 이후 외부 call 0회
- circuit OPEN
- scheduler/manual 차단
- operator reset 전 재개 불가

### 18.5 OpenAPI contract 테스트

- 모든 operationId controller 연결
- request validation
- response schema
- problem+json
- cookie security
- CSRF
- breaking change diff

### 18.6 브라우저 E2E

- iPad Safari
- iPhone Safari
- Android Chrome
- Mac Chrome/Safari

상태:

- 카메라 허용
- 거절 후 재요청
- 후면 카메라 없음 fallback
- 초점 미지원
- torch 미지원
- 같은 QR 빠른 반복
- 네트워크 timeout 후 재시도
- 다른 설명회 QR
- 취소 QR
- 폐기된 이전 QR
- 전화번호 last4 충돌 후보

---

## 19. 배포와 운영

### 19.1 프로세스

권장:

- api process
- worker process

초기에는 동일 Nest app에서 scheduler를 실행할 수 있지만 replica 증가 전에 worker를 분리한다.

### 19.2 health

- /health/live: process loop 확인, dependency 없음
- /health/ready: PostgreSQL 필수, Redis 정책에 따라 상태 표시
- /health/detail: 관리자/Tailscale 전용

통통통 상태는 readiness를 내리지 않는다. circuit OPEN을 별도 운영 상태로 노출한다.

### 19.3 환경 변수

필수 범주:

- APP_ENV
- PORT
- DATABASE_URL
- REDIS_URL
- SESSION_SECRET
- PHONE_ENCRYPTION_KEY
- PHONE_HMAC_KEY
- OTP_PEPPER
- PUBLIC_BASE_URL
- TRUST_PROXY
- SMS credentials
- TONG credentials
- TONG_SYNC_ENABLED
- TONG_SYNC_CRON
- TONG_SYNC_ZONE

규칙:

- .env 실제 값 commit 금지
- .env.example에는 값이 아닌 설명
- secret을 shell command argument로 전달 금지
- production secret file 권한 최소화
- startup에서 필수 secret 길이와 분리 여부 검증
- 같은 키를 session, phone, OTP, idempotency에 재사용 금지

### 19.4 graceful shutdown

- SIGTERM 수신 시 신규 요청 중단
- 진행 중 HTTP request 종료 대기
- scheduler 신규 실행 중단
- 실행 중 통통통 run은 안전한 FAILED 상태로 마감
- Prisma disconnect
- Redis disconnect

### 19.5 백업

- PostgreSQL 정기 backup
- 복구 훈련
- QR raw token은 backup에도 존재하지 않아야 함
- Redis backup은 원장 복구 수단이 아님

---

## 20. Spring 초안에서 NestJS로 안전하게 전환

### 20.1 먼저 보존할 자산

- packages/contracts/openapi.yaml의 유효한 부분
- V1 SQL의 constraint, index, append-only trigger 아이디어
- sync run/branch run/circuit 상태 모델
- ERD 결정 기록
- Testcontainers 테스트 시나리오
- QR digest, idempotency, capacity locking 설계

### 20.2 포팅하지 않을 자산

- Java package 구조 자체
- Spring Security JWT 구성
- JPA/JDBC repository 구현
- 자녀별 QR schema
- 자녀별 seat count
- 잘못된 통통통 필드 매핑
- 추정 source date 필드

### 20.3 DB 적용 여부 분기

#### V1 미적용

- 잘못된 V1을 운영에 적용하지 않는다.
- Nest 기준 corrected baseline migration을 만든다.
- ephemeral PostgreSQL에 적용하고 검증한다.

#### V1 적용, 운영 데이터 없음

- Proxmox/DB snapshot 확인
- 명시적 승인 없이 drop/reset 금지
- 승인된 경우에만 disposable DB 재생성

#### V1 적용, 학생 또는 운영 데이터 있음

- 절대 reset 금지
- schema와 row count inventory
- Prisma baseline
- V2 forward migration
- 잘못된 column 의미는 실제 적재 데이터 검증 후 변환
- 가족 QR 구조는 데이터 보존 migration

### 20.4 전환 완료 전 Spring 삭제 금지

다음이 모두 성공한 뒤 Spring 파일 제거를 검토한다.

- Nest build
- migration test
- OpenAPI contract test
- student sync fake adapter test
- 예약 동시성 test
- QR 동시성 test
- dev 환경 API 연결
- main agent diff 검토

삭제는 별도 commit으로 분리한다.

---

## 21. 구현 단계

### Phase 0: 결정과 안전 확인

- 현재 DB migration 적용 여부 확인
- 데이터 row count 확인
- qr-poc commit SHA 고정
- 통통통 field mapping 재확인
- 가족 QR/부모 좌석 모델 반영
- OpenAPI validation

완료 기준:

- 본 문서와 충돌하는 계약이 목록화됨
- destructive migration 없음

### Phase 1: Nest 기반

- apps/api scaffold
- pnpm workspace 포함
- Turbo task
- config validation
- logger redaction
- Prisma/Redis
- health
- problem+json filter

완료 기준:

- lint, typecheck, test, build
- secret 없는 local boot

### Phase 2: 인증

- admin user
- Argon2
- Redis Session
- CSRF
- RBAC
- login audit

완료 기준:

- session fixation, logout, CSRF e2e

### Phase 3: schema와 migration

- corrected student mapping
- family booking/child link
- family QR
- check-in event
- circuit
- outbox
- triggers/indexes

완료 기준:

- empty PostgreSQL migration
- constraints integration test

### Phase 4: 학생 sync

- disabled adapter
- normalizer
- stage/validate/promote
- 6시간/manual
- circuit breaker
- initial dry run/publish

완료 기준:

- fixture 테스트
- 인증 실패 외부 호출 1회
- 실계정 요청은 사용자 승인 전 0회

### Phase 5: OTP와 예약

- OTP
- family booking
- capacity
- child links
- QR 발급
- cancellation
- outbox

완료 기준:

- concurrency와 idempotency

### Phase 6: QR/수동 입장

- QR check-in
- last4 candidates
- manual check-in
- history
- QR rotation/revoke

완료 기준:

- 동일 QR 20 동시 요청 불변식

### Phase 7: 프론트 연결

- OpenAPI client
- qr-poc scanner UI 이식
- session login
- 학생 현황
- 로그 모달

프론트 지침:

- 기존 화면 수정은 Claude Code Opus
- 새 학생 현황 화면은 Fable /design과 Product Design 3안 선택 후 Opus 구현
- 선택 전 새 화면 구현 금지

### Phase 8: 배포와 초기 적재

- pve-release 배포
- migration
- backup 확인
- fake adapter smoke
- 사용자 승인 후 통통통 실접속 1회
- 3분원 dry run
- 건수/제외/중복 확인
- publish
- ANALYZE
- 재시작 복구 검증

---

## 22. 품질 게이트

모든 merge 전:

- format
- lint
- typecheck
- unit test
- PostgreSQL integration test
- OpenAPI validation
- generated contract clean diff
- secret scan

예약/QR/동기화 변경:

- concurrency test
- migration test
- security regression
- append-only audit verification

배포 전:

- production build
- migration backup
- health
- Redis/PostgreSQL local bind 확인
- session cookie 확인
- CSRF 확인
- 로그 redaction 확인
- 통통통 retry 0 확인
- circuit reset 권한 확인

---

## 23. 메인 에이전트 작업 지침

### 23.1 모델 라우팅

AGENTS.md를 우선 적용한다.

- NestJS 전환, DB migration, 인증, 동시성, 통통통: gpt-5.6-sol + ultra + Fast
- 범위가 명확한 단순 파일 수정: gpt-5.6-sol + xhigh + Fast
- 기존 프론트 화면: Claude Code Opus
- 새로운 화면 디자인: Claude Code Fable /design
- 선택된 새 디자인 구현: Claude Code Opus

### 23.2 파일 소유권

- backend owner: apps/api
- frontend owner: apps/web, docs/design
- OpenAPI: packages/contracts, 양쪽 영향 검토
- 제품 명세: docs/specs

### 23.3 구현 원칙

- 기존 dirty worktree 보존
- unrelated change 수정 금지
- Spring 파일을 즉시 삭제하지 않음
- DB destructive command 금지
- migration 적용 전 대상 DB와 backup 확인
- secret 출력 금지
- 통통통 실접속 전 사용자 확인
- 로그인 실패 1회면 즉시 중단 및 사용자 알림
- 결과만 믿지 말고 diff, test, migration을 오케스트레이터가 직접 검토

### 23.4 메인 에이전트에게 전달할 실행 요청문

아래 내용을 메인 작업에 그대로 사용할 수 있다.

> docs/specs/nestjs-backend-handoff.md를 구현 기준으로 읽고, 기존 Spring 초안을 NestJS 단일 백엔드로 안전하게 전환하라. 먼저 DB/Flyway 적용 여부와 데이터 존재 여부를 읽기 전용으로 확인하고, 가족당 QR 하나·부모 참석 MOTHER/FATHER/BOTH 1/1/2석·확정 통통통 m1/m2/m3/m5/m6/m8/m10/m20 매핑으로 ERD와 OpenAPI를 바로잡아라. 통통통 로그인은 실패 또는 불명확 1회 즉시 durable circuit OPEN, 자동 재시도 0회, 사용자 수동 초기화 확인 전 재개 금지다. Spring 파일은 Nest build, migration, contract, concurrency 테스트가 통과하기 전 삭제하지 말고, 모든 DB 변경은 backup 확인 후 forward migration으로 수행하라.

---

## 24. 아직 제품 확인이 필요한 항목

아래는 구현을 막지 않는 기본값을 문서에 정했지만, 메인 에이전트가 사용자 결정으로 승격할 수 있다.

1. 미예약 가족의 현장 즉석 입장
   - 기본값: 금지
   - 필요 시 ADMIN override 별도 기능

2. QR 만료 시점
   - 기본값: 해당 회차 종료 후 설정된 grace period

3. SCANNER 전용 계정
   - 기본값: ADMIN과 분리

4. 입장 성공 SMS
   - 기본값: outbox를 통해 발송

5. 전체 전화번호 저장 방식
   - 기본값: application encryption + HMAC + last4

이 항목을 임의로 단순화할 경우 보안·운영 영향과 migration 비용을 먼저 보고한다.

---

## 25. 최종 Definition of Done

다음이 모두 참이어야 백엔드 전환 완료다.

- NestJS가 유일한 DB writer다.
- apps/web은 DB에 직접 접근하지 않는다.
- 가족 예약당 활성 QR이 하나다.
- 자녀 수와 좌석 수가 분리돼 있다.
- MOTHER/FATHER/BOTH가 1/1/2석으로 서버 계산된다.
- QR raw token이 DB와 로그에 없다.
- 같은 QR 동시 스캔에서 성공 하나만 발생한다.
- 전화번호 수동 입장이 가족 예약을 대상으로 한다.
- 입장 성공/중복/실패 로그가 append-only다.
- 관리자 인증이 Redis Session + CSRF다.
- OTP와 관리자 인증이 분리돼 있다.
- 통통통 로그인 자동 재시도가 0이다.
- 실패 또는 불명확 1회에 circuit이 OPEN된다.
- 사용자 확인 없는 circuit reset이 불가능하다.
- 3분원 sync가 순차 수행된다.
- bracketless 또는 승인된 단일 끝 timetable suffix만 적재되고, 반복 요일·0/선행 0 슬롯·미승인 영문·별표·그 밖의 bracket class는 제외된다.
- 재원생만 적재된다.
- OpenAPI validation과 contract test가 통과한다.
- PostgreSQL migration이 empty DB와 현재 DB upgrade 양쪽에서 검증된다.
- backup과 restore 절차가 문서화된다.
- pve-release 재시작 후 API, PostgreSQL, Redis가 정상 복구된다.
