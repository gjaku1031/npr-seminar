# entities — 도메인 엔티티 레이어

도메인의 **명사**(seminar, attendee …). 여러 화면이 공유하는 모델·표시를 담는다.

- 슬라이스 구조: `entities/<domain>/{ index.ts, model/, ui/ }`
  - `model/` = **도메인 모델(순수 TS)** — 서버(리포지토리 계약·서비스)와 클라이언트가 같은 타입을 공유한다.
    React·DB import 금지 (설계 §4.3). server 존이 참조할 수 있는 유일한 클라이언트 레이어(R5 예외)이므로 순수성이 깨지면 안 된다.
  - `api/` 세그먼트는 지금 만들지 않는다 — TanStack Query(query 훅) 도입 시점의 예약 자리 (설계 §8).
- **공개 API:** 밖에서는 `@/entities/<domain>`(= `index.ts`)만 import. 깊은 경로 금지(ESLint 강제).
- 의존: `shared`만. **다른 entity 직접 참조 금지** — 조합은 상위 레이어에서.

예: `entities/seminar` (표준 슬라이스 — 참고 구조 `entities/user`에 대응).
