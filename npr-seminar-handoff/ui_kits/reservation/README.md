# 입시설명회 — 예약 앱 UI Kit

데스크톱 웹(1280) 기준의 인터랙티브 클릭 스루. 별도 소스(코드베이스/Figma) 없이 본 디자인 시스템의 파운데이션과 컴포넌트만으로 구성한 오리지널 화면들.

## 화면 (플로우 순)
1. **HomeScreen** — 네이비 히어로 + 검색, 마감 임박 티커(마르퀴), 필터 태그, SessionCard 그리드(스태거 등장)
2. **DetailScreen** — 설명회 상세, 회차별 잔여석 게이지, 스티키 예약 패널
3. **BookingScreen** — Stepper 3단계: 회차 선택(라디오 카드) → 좌석 선택(좌석맵) → 정보 입력, 하단 고정 내비
4. **TicketScreen** — 예약 확정 티켓(블루 스탬프 ds-stamp), 블루 파티클 플로트
5. **MyPageScreen** — 탭(예정/지난/취소), 예약 카드, 취소 Dialog + Toast
6. **AdminScreen** — 카운트업 스탯, 회차별 예약률 바(ds-grow-x), 실시간 예약 피드

## 실행 구조
- `index.html`이 라우터/헤더 셸. 화면 전환은 key 리마운트 + `ds-fade-in`.
- 현재 라우트는 localStorage(`dsr-route`)에 저장 — 새로고침해도 유지.
- 데이터: `data.js` (`window.DSR_DATA`), 아이콘: `icons.jsx` (`window.DSRIcons`, Lucide 패스 인라인).
- 컴포넌트는 전부 `window.DesignSystem_179b2a`에서 — 킷 안에서 프리미티브 재구현 금지.
