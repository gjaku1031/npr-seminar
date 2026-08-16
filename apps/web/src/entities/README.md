# entities — 도메인 엔티티 레이어

도메인의 **명사**. 여러 화면이 공유하는 모델·표시를 담는다.

## 형태의 진실원은 계약이다

API 로 오가는 값의 형태(예약, 회차, 학생, 기기, 설문)는 `packages/contracts/openapi.yaml` 이
정하고, 그 타입 선언은 `@/shared/api/contract.ts` 에 있다. 이 레이어에 같은 모델을 다시 만들지 않는다.

여기 남는 것은 **계약이 말하지 않는 것**뿐이다 — 화면이 공유하는 표시 규칙, 클라이언트 전용
계산, 계약 값에 얹히는 UI 컴포넌트.

> 2026-08 정리: Drizzle 리포지토리와 짝이던 도메인 모델 슬라이스(`session`·`student`·`class`·
> `teacher`·`survey`·`device`)와 `reservation/model/reservation.ts` 를 제거했다. 서버·클라이언트가
> 타입을 공유하던 풀스택 구조의 잔재였고, 계약 API 로 옮긴 뒤로는 어떤 화면도 참조하지 않았다.

## 슬라이스

| 슬라이스 | 내용 |
|---|---|
| `reservation` | QR 티켓 표시(`ReservationQr`), 예약 관리 링크, `/booking/access` fragment 파싱 |
| `sms` | 문자 바이트·LMS 판정, 용도별 변수·라벨 (백엔드 `PURPOSE_VARIABLES` 미러) |
| `user` | 역할·모듈 권한 — `ROLE_MODULES` · `canAccessModule()` |

## 규칙

- 슬라이스 구조: `entities/<domain>/{ index.ts, model/, lib/, ui/ }`
  - `model/`·`lib/` = **순수 TS**. DB import 금지 (설계 §4.3). server 존이 참조할 수 있는 유일한
    클라이언트 레이어(R5 예외)이므로 순수성이 깨지면 안 된다 — React 가 필요한 것은 `ui/` 에 둔다.
- **공개 API:** 밖에서는 `@/entities/<domain>`(= `index.ts`)만 import. 깊은 경로 금지(ESLint 강제).
- 의존: `shared`만. **다른 entity 직접 참조 금지** — 조합은 상위 레이어에서.

## 역할·권한 — 문서 충돌과 결정 (2026-07-16)

`feature-spec.md` §12.1과 `flows.json`이 충돌한다. **flows.json 채택** (설계 §0 결정 S8):

| | feature-spec.md | flows.json ✅ |
|---|---|---|
| 역할 | `owner \| desk \| teacher` | `owner \| siljang \| gangsa` |
| 2번째 | desk = 통계 제외 | 실장 = 원장과 100% 동일 |
| 3번째 | teacher = 재원생(담당반)·상담·통계 | 강사 = 재원생·통계 **차단**, 나머지 운영 허용 |

근거: flows.json이 더 최신(7/16 00:13)이고 `_meta`가 스스로 "진실원(single source of truth)"이라 명시. 판정 로직은 `entities/user/model/user.ts`의 `ROLE_MODULES` · `canAccessModule()` 한 곳에 있다.
