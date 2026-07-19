# views — 화면 레이어

라우트 1:1 화면 조합. `app/*/page.tsx`(RSC)가 서버에서 데이터를 조회해 **props(도메인 모델)로 내려준다** — views는 서버를 모른다(`@/server` import 금지, R1).

- 덕분에 화면은 서버/클라이언트 어느 쪽으로도 조합 가능하고, 데이터 없이 렌더 테스트가 쉽다.
- 화면 전용 파생 모델이 필요해지면 `views/<화면>/model/`에 (참고 구조 `views/*/model` 관례).
- 페이지가 커져 Suspense 경계별 페칭(views 내부 RSC 페칭)이 필요해지면 R1 허용 목록 확장을 검토 (설계 §8).

예: `views/seminars`.
