# @npr-seminar/web

npr 입시설명회 **Next.js 클라이언트 UI**. 화면·라우팅·접근성만 담당한다.

업무 API·데이터·OTP·SMS·QR·체크인의 **소유자는 `apps/api`(NestJS)** 다. 이 앱은 서버가 아니다.

> 계약(단일 진실): [`packages/contracts/openapi.yaml`](../../packages/contracts/openapi.yaml)
> 작업 경계: [`AGENTS.md`](../../AGENTS.md) · 설계: [`docs/architecture.md`](../../docs/architecture.md)

## 아키텍처 경계

- 브라우저는 **same-origin `/api/v1`** 으로만 Nest 를 호출한다. 계약이 Origin·same-origin 검사를 요구하고, HttpOnly 세션 쿠키가 origin 에 묶이기 때문이다.
- 로컬·프리뷰는 origin 이 다르므로 `next.config.ts` 가 `NEST_API_ORIGIN` 이 있을 때만 `/api/v1/*` 를 그 origin 으로 프록시한다. 운영에서 앞단 프록시가 이미 `/api/v1` 을 Nest 로 보낸다면 값을 비워 둔다.
- **`apps/api` 내부 구현을 import 하지 않는다.** 타입은 계약을 보고 `src/shared/api/contract.ts` 에서 다시 선언한다.
- 브라우저 어댑터는 `src/shared/api/` 하나뿐이다: same-origin credentials, CSRF 부트스트랩, durable 변경의 Idempotency-Key, RFC 9457 problem 정규화.

## 라우트 맵

| 경로 | 공개 여부 | 설명 |
| --- | --- | --- |
| `/` | 공개 | 학부모 모바일 예약 앱 (캠퍼스 → 회차 → 본인 확인 → 예약) |
| `/reserve` | 공개 | `/` 로 **308 영구 이동** (기존 배포 링크 호환) |
| `/booking/{familyBookingId}` | 공개 | 문자로 보내는 안전한 예약 링크 |
| `/admin` | 보호 | 관리자 콘솔 허브 |
| `/scanner` | 보호 | 관리자용 스캐너 기기 모니터·페어링 |
| `/scanner/connect` | 공개 | iPad 페어링·스캔 UI |

가드는 `src/proxy.ts` 매처가 담당한다. `/`·`/reserve`·`/booking/*`·`/scanner/connect` 는 매처 밖(공개), `/admin` 과 각 관리자 모듈은 매처 안(보호)이다.

## 제품 표시 불변식

- 회차 장소는 모든 공개·관리자·문자·QR 화면에서
  `서울시 교통회관 (올림픽로 319)`로 표시한다.
- 좌석 한도와 좌석 기반 비율은 제품 범위가 아니며 화면에서 계산하거나
  표시하지 않는다.
- 예약 명단과 통계의 모니터링은 `해당 학생`(필터 학생 행),
  `형제원생 제외`(중복 없는 활성 가족 예약), `참가자수`(실제 참석 학부모)의
  세 절대 건수를 구분한다. 모/부는 2명이고 형제 학생 행 때문에 참가자수가
  중복 증가하면 안 된다.

### 권한이 URL 에 있지 않다

- **`/booking/{familyBookingId}`**: 경로의 ID 는 **조회 키일 뿐 권한이 아니다**. 인증 전에는 예약 정보를 **아무것도 렌더하지 않고 상세 요청도 보내지 않는다**. `BOOKING_MANAGE` SMS OTP 로 본인 확인을 마친 뒤에야 그 ID **하나만** 범위 조회한다(소유 예약 전체 조회를 타지 않는다). 최종 판정은 proof digest 와 예약 소유자를 대조하는 서버가 한다.
- **`/scanner/connect`**: 화면이 공개일 뿐 권한은 **페어링 코드로 발급된 SCANNER 세션**(HttpOnly 쿠키)이 정한다. 이 화면에는 관리자 기능이 없다. 관리자용 `/scanner` 는 계속 보호된다.

## 시크릿 취급

- **X-Booking-Proof** 는 **메모리 전용**이다 — 화면에 표시하지도, 내보내지도 않는다.
- **원문 QR credential** 은 앱이 **자동으로 남기지 않는다**: URL·localStorage/sessionStorage·쿠키·서버 상태·로그·파일명·클립보드 어디에도 쓰지 않는다. 신규 발급·복구 조회 때 **QR 이미지로만** 그리고, 사용자가 **직접 다운로드를 누른 경우에만** 식별자 없는 고정 파일명의 PNG 로 내보낸다.
- 원문 QR 은 **신규 발급 응답과 복구 조회(GET) 응답에서만** 내려오고, 그때만 **QR 이미지 안에 직접 인코딩**된다. URL(`/q/{token}`)로 감싸지 않는다 — 계약상 원문 QR 은 `X-QR-Token` 헤더로만 오가고 path·query 에 놓이지 않는다. 서버는 원문을 보관하지 않지만 **현재 활성 QR** 은 복구 조회로 다시 복원한다 — **공개 재발급·회전 API 는 없다**(개인 링크는 기존 QR 을 그대로 보여줄 뿐이다).
- **문자에는 안전한 `/booking/{id}` 링크만** 담긴다. 원문 QR 을 문자로 보내지 않는다.
- 리플레이 응답에는 시크릿이 없다. 없는 값을 지어내지 않고 사실대로 안내한다(재인증·복구 조회).

## 개발

```bash
pnpm install

# Nest 를 로컬(기본 PORT=4000)에서 띄운 뒤, 같은 origin 으로 프록시해 실행한다
NEST_API_ORIGIN=http://127.0.0.1:4000 pnpm dev
```

`NEST_API_ORIGIN` 없이 `pnpm dev` 를 하면 `/api/v1` 프록시가 없어 모든 계약 호출이 실패한다.

품질 게이트:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

> 요구: Node >= 22, pnpm

## ⚠️ 마이그레이션 중 — 남아 있는 레거시

단계적 이관 중이라 아래가 저장소에 **아직 남아 있지만 프로덕션 백엔드가 아니다**. 새 코드에서 쓰지 않는다.

- `src/server/**` (Drizzle 스키마·리포지토리·서비스·SOLAPI 게이트웨이)와 이를 쓰는 레거시 `features/*/api/actions.ts` Server Action.
- `package.json` 의 DB 관련 의존성·스크립트(`db:migrate`·`db:seed`·`db:studio`·`vercel-build` 등)와 `drizzle/`.

이 코드는 **아직 이관되지 않은 관리자 화면**(`/admin`·`/students`·`/sms`·`/sessions`·`/stats`)만 지탱한다. 공개 학부모 앱(`/`·`/booking/*`)과 스캐너(`/scanner`·`/scanner/connect`)는 이미 계약 API 로만 동작하며 `@/server` 를 import 하지 않는다.

**실제 관리자 인증과 나머지 관리자 화면의 Nest 이관은 화면 승인 대기로 의도적으로 보류 중이다.** 위 레거시를 백엔드 사실로 취급하거나 문서화하지 않는다.
