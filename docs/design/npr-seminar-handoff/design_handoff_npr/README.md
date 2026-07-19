# Handoff: npr 입시설명회 운영 시스템

## Overview
학원 **입시설명회 예약 · 현장 운영 통합 시스템**. 두 개의 표면으로 구성됩니다.
- **운영 콘솔** (데스크톱 1366, `ui_kits/npr-admin/index.html`): 로그인 → 카드 런처 허브 → 8개 모듈.
- **학부모 모바일 예약** (390, `ui_kits/npr-admin/mobile.html`): 로그인 없이 설명회 선택 → 예약 → QR 발급.

역할 3종(**원장 / 실장 / 강사**)으로 권한이 게이팅됩니다. 학부모/학생은 로그인 없이 모바일만 이용.

## About the Design Files
이 번들의 파일은 **HTML로 만든 디자인 레퍼런스**입니다 — 의도한 룩앤필과 동작을 보여주는 프로토타입이며, 그대로 복사해 배포할 프로덕션 코드가 아닙니다. 작업 목표는 **이 HTML 디자인을 대상 코드베이스의 기존 환경(React/Vue/Next 등)과 패턴·라이브러리로 재구현**하는 것입니다. 환경이 아직 없다면 프로젝트에 가장 적합한 프레임워크를 골라 구현하세요.

> 실행 방식(참고): 빌드 단계 없이 **React 18 UMD + Babel standalone**를 브라우저에서 직접 트랜스파일합니다. 각 화면은 `window.<Screen>` 전역 컴포넌트(JSX 파일)로 정의되고, 공용 `store` 객체를 prop으로 받습니다. 프로덕션에서는 이 구조를 그대로 옮기지 말고 번들러/상태관리로 재구성하세요.

## Fidelity
**High-fidelity.** 디자인 시스템(토큰 + 컴포넌트) 위에 만들어졌습니다. 색·타이포·간격·모션이 확정값이므로, 대상 코드베이스의 디자인 시스템에 **토큰 매핑**해 픽셀 정확도로 재현하세요.

## Architecture
- **엔트리**: `npr-admin/index.html` = App 셸(로그인/역할, 라우팅, 인메모리 store), `npr-admin/mobile.html` = 학부모 MobileApp(모바일 store 서브셋).
- **라우팅**: 콘솔은 `localStorage['npr-route']`로 현재 모듈 저장. 허브 ↔ 8개 모듈. 로그인 상태는 `localStorage['npr-user']`.
- **권한(ROLE_INFO, index.html 내)**:
  - `owner`(원장) · `siljang`(실장): 전체 8모듈 동일.
  - `gangsa`(강사=직원): **재원생 관리·통계 제외** 전부(전화예약·문자·설명회 운영·상담·QR 스캐너·프리뷰). 잠긴 모듈은 허브에서 자물쇠 표시 + 라우트 진입 시 허브 리다이렉트.
- **디자인 시스템**: `design-system/_ds_bundle.js`가 `window.DesignSystem_179b2a` 네임스페이스로 컴포넌트 노출. 토큰은 `design-system/styles.css` + `design-system/tokens/*.css`.

## Screens / Views (8 모듈 + 모바일)
> 각 화면의 정확한 레이아웃·컴포넌트·상태·카피는 해당 `.jsx` 소스와 `기능명세서.md`에 상세.

- **허브 (`HubScreen.jsx`)**: 8개 `LauncherCard`(3열 그리드) + 다가오는 설명회 칩 + 모바일 예약 링크. 권한 없는 카드는 `locked`(자물쇠·dim).
- **재원생 관리 (`StudentsScreen.jsx`)** — *원장·실장 전용*: 명단 테이블(이름/학교/학년/반/연락처/예약/입장/노쇼 회수), 검색·부문·예약상태·설명회 기준 필터, 학생 추가 모달, 엑셀 업/다운(매핑 미리보기).
- **전화예약 (`PhoneScreen.jsx`)**: 스탯 4카드(필터 겸용), 예약 목록, 상세 슬라이드 패널(QR·문자 재발송·QR 재발급·예약 변경·취소), 수동예약 등록(`ManualReserve.jsx`, 재원/비재원 탭).
- **문자 발송 (`SmsScreen.jsx`)**: 템플릿 목록/편집, 변수 칩, 바이트 카운터(LMS), 대상 그룹, 실기기 프리뷰, 발송 로그(자동 배지).
- **설명회 운영 = QR 현황 대시보드 (`SessionsScreen.jsx`)** — *핵심*: 설명회 목록, 생성 모달(페이지 꾸미기: 배너·안내문), 현황 스탯 5카드, 리마인드 스케줄(토글·즉시 발송), 만족도 요약, **설명회 명단(재원생 전체 + 비재원생 로스터)** — 강사·반 필터 + 상태 필터(전체/입장/미입장/미예약/노쇼/비재원생/취소) + 강사 모니터링 카드, 행 액션(즉석 예약/수동 체크인/입장 취소/전환), 명단 인쇄(A4), 설명회 종료(→노쇼)·삭제.
- **상담 예약 (`CounselScreen.jsx`)**: 슬롯 그리드(강사×일시) + 신청 목록.
- **통계 (`StatsScreen.jsx`)** — *원장·실장 전용*: 지표 카드(누적 예약·참석률·노쇼율·전환율), 회차별 바, 채널 도넛, 시간대 라인(SVG), 평균 만족도.
- **QR 스캐너 (`ScannerScreen.jsx`)**: 기기 모니터링, 카메라 권한 목업, 스캔 화면, 현장 입장(연락처 4자리).
- **모바일 프리뷰 (`PreviewScreen.jsx`)**: 폰 프레임 안 `MobileFlow` 구동.
- **모바일 예약 (`MobileFlow.jsx`)**: 설명회 선택 → 재원생 조회(가족 다중선택) / 비재원생 → 예약·티켓, 예약 조회·변경·취소, 상담 신청, 만족도 설문.

## Interactions & Behavior
- 화면 전환: `key` 리마운트 + `ds-fade-in`. 등장: `ds-fade-up` 70ms 스태거. 강조: `ds-pop`/스프링. 바텀시트: `ds-sheet-up`. `prefers-reduced-motion` 대응.
- 모달/다이얼로그(`Dialog`), 토스트(`Toast`), 슬라이드 패널, 드롭다운(아바타·엑셀).
- 모든 상태 변화는 성공 토스트 + (목업) 문자 발송 문구 동반.

## State Management (공용 store)
인메모리 객체. 대상 코드베이스에서는 상태관리(Context/Zustand/Redux 등)로 이관.
- **데이터**: `students, sessions, reservations, smsTemplates, smsLogs, counselSlots, counselBookings, surveyResponses, teachers, classes, devices, user`.
- **액션**: `addStudent · addReservation · addReservationGroup(가족) · cancelReservation(id, by) · checkIn · moveReservation(회차 이동) · reissueCode(QR 재발급) · rollbackEntry(입장 취소) · endSession(종료·노쇼 태깅) · toggleReminder · convertGuest(전환) · addSession · deleteSession · saveTemplate · addTemplate · addSmsLog · addCounselBooking`.
- **예약 status**: `reserved`(미체크) → `entered`(입장) / `no_show`(노쇼) / `cancelled`(취소, `cancelledBy: staff|parent`).
- **Reservation 필드**: `id, code, sessionId, studentId|null, name, school, grade, phone, channel(mobile|phone|manual), status, attendCount, member, history[], codeHistory[], audit[], groupId, time`.

## Design Tokens
전체 값은 `design-system/tokens/colors.css · effects.css · motion.css` + `design-system/styles.css` 참조. 주요값:
- **Primary(violet/blue)**: `--violet-950 #0F1B33`, `--violet-900 #1B3FA8`, `--violet-800 #1D4ED8`(브랜드), + violet-600/300/100/50.
- **Gray(surfaces)**: `#FFFFFF / #F7F8FA / #EFF1F5 / #E2E6EC`. **Accent(mint/sky)**: mint 스케일(colors.css 참조).
- **Semantic**: success `#0E9F6E` · warning `#D97706` · danger `#DC2626` · info `#0284C7` (+ *-soft).
- **Radius**: sm 12 · md 16 · lg 22 · xl 30 · pill 999.
- **Shadow**: `--shadow-card / --shadow-raised / --shadow-float` (+ accent-glow).
- **Motion**: dur fast160 · base280 · slow480 · hero800 / ease out·spring·smooth·in-out.
- **Font**: display `Pretendard Variable`, body `Pretendard Variable`, `NanumSquareRound`.

## Behavior Spec & Flows (구현 근거)
- **`npr-admin/기능명세서.md`** — 전 기능 명세(모듈별 상세 + 추가 기능 14종).
- **`npr-admin/flows.json`** — 권한별 유저플로우 진실원(노드 id·상태 변화·문자 트리거·분기·권한 잠금).
- **`npr-admin/features/npr-*.feature`** — 페르소나별 Gherkin(원장·실장·강사·학부모), 각 스텝에 노드 ID `[OWNER-F5-10]` 형식으로 flows.json·HTML 문서와 상호 추적. E2E(Playwright/Cypress)로 바로 활용 가능.
- **`npr-admin/유저플로우.html`** — 위 플로우의 시각 리뷰 문서.

## Componentization Guidance
1. **DS 프리미티브**를 대상 라이브러리에 매핑: `Button, Card, Badge, Tag, Input, Select, Switch, Checkbox, Radio, Dialog, Toast, Tooltip, Tabs, TopNav, LauncherCard, Stepper`.
2. **컴포지트/공용**: `StatCard, ResStatusBadge(status→배지), QrBox(플레이스홀더 QR=code 시드), KV, EmptyState`(`shared.jsx`), `SessionCard, Ticket`(DS reservation).
3. **화면**을 라우트/페이지 컴포넌트로: 위 8모듈 + MobileFlow. 공용 `store`를 상태관리로.
4. **목업 → 실서비스**: 실제 QR 인식·문자 게이트웨이·서버 영속화·중복예약 검증은 미연동(현재 in-memory + 플레이스홀더). 대상 백엔드에 연결.
5. **권한**은 ROLE_INFO의 모듈 화이트리스트를 그대로 규칙으로 사용.

## Files (프로젝트 소스 위치)
이 폴더엔 본 README만 들어 있으며, **전체 소스는 프로젝트 전체(zip/GitHub)로 전달**됩니다. 경로 기준:
- `ui_kits/npr-admin/` — 앱 소스 전체(엔트리 `index.html`·`mobile.html`, 화면 `*.jsx`, `shared.jsx`·`icons.jsx`·`data.js`, `기능명세서.md`, `flows.json`, `features/`, `유저플로우.html` + `flow-*.js(x)`).
- `components/` · `tokens/` · `styles.css` — 디자인 시스템(컴포넌트·토큰). `_ds_bundle.js`는 이들의 컴파일 결과.

*참고: 이 핸드오프 폴더는 디자인 시스템 프로젝트 안에 두면 컴파일러가 중복 소스로 인식하므로, 소스 복사본은 넣지 않았습니다. 스크린샷은 기본 미포함.*
