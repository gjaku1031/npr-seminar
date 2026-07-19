# entities — 도메인 엔티티 레이어

도메인의 **명사**. 여러 화면이 공유하는 모델·표시를 담는다. 근거: `npr-seminar-feature-spec.md` §2 + `npr-seminar-flows.json`.

## 슬라이스 (10) — 명세 12개 모델 대응

| 슬라이스 | 모델 | 비고 |
|---|---|---|
| `session` | Session, Reminder | 설명회. 명세 §7 · 12.5(리마인드) · 12.11(배너·안내문) |
| `reservation` | Reservation, History, Audit | **중심 애그리거트** — 모바일·전화·수동·현장 4경로가 수렴. 명세 §1.2 · 12.2 · 12.12 · 12.13 |
| `student` | Student, ConvertedFrom | 재원생. 명세 §4 · 12.4(노쇼) · 12.14(전환) |
| `class` | Class | 반(초/중/고) |
| `teacher` | Teacher | 강사 — User.teacherId가 참조 |
| `user` | User, UserRole, ModuleKey | 역할·권한. **진실원 = flows.json** (아래 참조) |
| `sms` | SmsTemplate, SmsLog | 명세 §6 |
| `survey` | SurveyResponse | 명세 12.7 |
| `counsel` | CounselSlot, CounselBooking | 명세 12.10 |
| `device` | Device | QR 스캐너 기기. 명세 §8.1 |

## 규칙

- 슬라이스 구조: `entities/<domain>/{ index.ts, model/, ui/ }`
  - `model/` = **도메인 모델(순수 TS)** — 서버(리포지토리 계약·서비스)와 클라이언트가 같은 타입을 공유한다.
    React·DB import 금지 (설계 §4.3). server 존이 참조할 수 있는 유일한 클라이언트 레이어(R5 예외)이므로 순수성이 깨지면 안 된다.
  - `api/` 세그먼트는 지금 만들지 않는다 — TanStack Query 도입 시점의 예약 자리 (설계 §8).
- **공개 API:** 밖에서는 `@/entities/<domain>`(= `index.ts`)만 import. 깊은 경로 금지(ESLint 강제).
- 의존: `shared`만. **다른 entity 직접 참조 금지** — 조합은 상위 레이어에서.
  (예: Reservation은 `sessionId`·`studentId`를 **id 참조**로만 들고, Session/Student 타입을 import하지 않는다.)

## 역할·권한 — 문서 충돌과 결정 (2026-07-16)

`feature-spec.md` §12.1과 `flows.json`이 충돌한다. **flows.json 채택** (설계 §0 결정 S8):

| | feature-spec.md | flows.json ✅ |
|---|---|---|
| 역할 | `owner \| desk \| teacher` | `owner \| siljang \| gangsa` |
| 2번째 | desk = 통계 제외 | 실장 = 원장과 100% 동일 |
| 3번째 | teacher = 재원생(담당반)·상담·통계 | 강사 = 재원생·통계 **차단**, 나머지 운영 허용 |

근거: flows.json이 더 최신(7/16 00:13)이고 `_meta`가 스스로 "진실원(single source of truth)"이라 명시. 판정 로직은 `entities/user/model/user.ts`의 `ROLE_MODULES` · `canAccessModule()` 한 곳에 있다.
