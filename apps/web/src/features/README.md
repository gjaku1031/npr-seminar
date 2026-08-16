# features — 사용자 행위 레이어

**동사** 단위 유스케이스. 슬라이스 구조: `features/<행위>/{ index.ts, model/, ui/, lib/ }`

## 변경은 계약 API 로 나간다 (Server Action 없음)

조회도 변경도 브라우저가 same-origin `/api/v1` 로 Nest 에 직접 요청한다. 어댑터는
`@/shared/api` 하나뿐이고, 그 안에서 CSRF 부트스트랩·Idempotency-Key·RFC 9457 problem
정규화를 처리한다. 이 레이어의 `model/` 훅이 그 어댑터를 호출하고 화면 상태를 소유한다.

```
ui (useState·useActionState)
  → model/use*.ts (요청·재시도·낙관적 상태)
    → @/shared/api (same-origin /api/v1)
```

- `api/actions.ts` (`"use server"`)와 `app/api/**` Route Handler 는 두지 않는다.
  2026-08 정리로 남아 있던 Server Action 경로를 제거했다 — 업무 규칙의 소유자는 `apps/api` 다.
- `@/server` 는 이 레이어에서 import 하지 않는다 (ESLint R1). 서버 존에 남은 것은 인증 판정뿐이고,
  그 진입점은 `app/**` 페이지·레이아웃이다.
- 의존: `entities`·`shared` 만. 같은 레이어 슬라이스 간 직접 import 금지 — 조합은 상위 레이어에서.

## 슬라이스

| 슬라이스 | 조작 |
|---|---|
| `auth` | 관리자 로그인·로그아웃, 아바타 메뉴 |
| `public-booking` | 학부모 예약 플로우 — 회차 조회, 연락처·OTP, 예약 증빙 |
| `manage-family-booking` | 관리자 예약 명단 — 조회·변경·취소·이벤트 이력·XLSX 내보내기 |
| `admin-overview` | 회차 목록·요약, 회차 운영, 통계, 설문 |
| `send-sms` | 문자 템플릿·발송·로그·게이트웨이 준비 상태 |
| `student-sync` | 재원생 동기화 상태, 검토 대상, 관리자 학생 조회 |
| `scanner-pairing` | (관리자) 스캐너 기기 모니터·페어링 코드 발급·해제 |
| `scanner-session` | (iPad) SCANNER 세션 — QR 체크인, 하트비트, 배터리, 결과 표시 |
| `check-in` | iPad 카메라 스캐너 UI 와 기기 판별 유틸 |
| `admin-poster` · `public-poster` | 안내 포스터 업로드와 공개 노출 |
