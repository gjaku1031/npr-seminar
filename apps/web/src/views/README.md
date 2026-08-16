# views — 화면 레이어

라우트 1:1 화면 조합. `app/*/page.tsx`(RSC)는 **가드와 메타데이터만** 맡고 화면을 그대로 렌더한다 —
데이터는 브라우저가 same-origin `/api/v1` 로 Nest 에서 직접 읽는다 (features 의 `model/` 훅 → `@/shared/api`).
그래서 views 는 서버를 모른다 (`@/server` import 금지, R1).

- 화면 전용 파생 모델·레이아웃 계산이 필요하면 `views/<화면>/{model,lib}/` 에 둔다
  (예: `views/students/lib/roster-filter-layout.ts`).
- URL 이 상태를 소유하는 화면은 `useSearchParams` 때문에 페이지에서 Suspense 경계를 준다
  (예: `app/(main)/students/page.tsx`).

## 슬라이스

| 슬라이스 | 라우트 | 공개 여부 |
|---|---|---|
| `poster` | `/` | 공개 — 안내 포스터 진입면 |
| `reserve` | `/reserve` | 공개 — 학부모 예약·조회 플로우 |
| `booking-access` · `booking-detail` | `/booking/access` · `/booking/{id}` | 공개 — 문자 링크 진입 |
| `scanner-connect` | `/scanner/connect` | 공개 화면 · SCANNER 세션이 권한 |
| `sessions` | `/sessions` | 보호 — 콘솔 홈(로고 복귀 지점), 포스터 관리 패널 포함 |
| `students` | `/students` | 보호 — 예약 명단 |
| `student-status` · `sms` · `stats` · `counsel` | 각 동명 라우트 | 보호 |
| `scanner` | `/scanner` | 보호 — 기기 모니터·페어링 |

> 2026-08: 카드 런처 허브(`views/hub`)를 제거했다. 콘솔 이동은 TopNav 탭바가 전담하고
> `/admin` 은 `/sessions` 로 가는 리다이렉트만 남았다.
