# 입시설명회 디자인 시스템

**입시설명회 예약 시스템** — 입시설명회를 탐색하고, 회차·좌석을 골라 예약하고, 티켓을 받는 서비스의 디자인 시스템.

- **사용자**: 초·중·고 학생과 학부모(예약자) + 학원 강사·운영진(관리자). 학원 브랜드: **npr**
- **플랫폼**: 데스크톱 웹 우선, 모바일 웹 병행 (본 킷은 1280 기준)
- **방향**: 쿨 & 프로페셔널(화이트/쿨그레이 표면 + 네이비 잉크 + 프로 블루), 라운드 산세리프, 풍부하지만 절제된 화면 애니메이션 (요청 강도 7/10)

## 소스
제공된 코드베이스·Figma·로고 없음 — 사용자 브리프(2026-07)만으로 제작한 **from-scratch** 시스템.
- 폰트: [orioncactus/pretendard](https://github.com/orioncactus/pretendard) (OFL), [innks/NanumSquareRound](https://github.com/innks/NanumSquareRound) (네이버 나눔, OFL) 에서 복사.
- **로고 없음**: 전용 마크를 새로 그리지 않았다. 마크 자리에는 항상 워드마크(플레인 타입)를 쓴다 → `guidelines/brand-wordmark.html`.

---

## CONTENT FUNDAMENTALS (카피 원칙)

- **말투**: 해요체. 정중하되 가볍다. "예약이 확정되었어요", "놓치지 않게 알려드릴게요". 관리자 화면도 동일 톤 유지하되 데이터 라벨은 명사형("누적 예약", "참석률").
- **호칭**: 사용자는 "님" ("김수민 님의 예약"). 시스템은 1인칭 없이 행위 중심.
- **문장**: 짧게, 마침표까지. 두 문장을 넘기지 않는다. 불안을 줄이는 안내 한 줄을 곁들인다("시작 24시간 전까지 취소할 수 있어요").
- **CTA**: 동사+하기 — "예약하기", "티켓 저장", "명단 내보내기". 부정 액션은 명확히 — "예약 취소".
- **상태 어휘 고정**: 예약 확정 / 마감 임박 / 마감 / 대기 n번 / 취소됨 / 참석 완료.
- **숫자**: 잔여석·예약번호는 tabular nums(`font-feature-settings:'tnum'`). "38/300석" 형식.
- **영문 오버라인**: 섹션 라벨로만 소량 사용 (UPCOMING, MY PAGE, ADMISSION TICKET) — letter-spacing 0.14em, 블루.
- **이모지**: 사용하지 않음.
- **한자·과잉 존칭 금지**: "귀하", "문의 바랍니다" 같은 관공서체 금지.

## VISUAL FOUNDATIONS

- **콘셉트**: "차가운 티켓" — 쿨 그레이 표면(`--gray-*`) 위에 네이비 잉크(`--surface-brand #101828`)와 프로 블루(`--violet-800 #1D4ED8`)로 인쇄하고, 확정의 순간에만 스카이(`--mint-500 #0EA5E9`) 도장을 찍는다.
- **컬러**: 페이지 `--gray-1 #F7F8FA`, 카드 `--gray-0 #FFFFFF`. 버튼·인터랙티브 = `--interactive-primary #1D4ED8`, 사이드바·히어로·티켓 헤더 = `--surface-brand #101828`(네이비 잉크), 채움 요소(체크박스·칩·모노그램) = `--violet-900 #1B3FA8`. 스카이(`--mint-*`)는 강조/확정/오버라인에만 소량. 상태색 4종(success/warning/danger/info)은 모두 soft 짝이 있다. 모든 뉴트럴은 슬레이트(쿨 블루 회색) 틴트.
- **타입**: 디스플레이/헤드라인 = NanumSquareRound(700/800), 본문/UI = Pretendard Variable. 스케일 60/44/32/24/19/17/15/13/11.5. 한글 자간은 음수(-0.02em 디스플레이).
- **배경**: 단색 표면. 이미지·패턴·그라디언트 배경 없음. 히어로/티켓 헤더의 네이비 면에만 큰 반투명 원(스카이 10~14%)을 오프셋 장식으로 허용. 유일한 선형 그라디언트는 잔여석 게이지(blue-700→500).
- **애니메이션**: 많되 규칙적. 등장은 `ds-fade-up`+스태거(70ms), 강조는 `ds-pop`/`ds-stamp`(스프링 `--ease-spring` cubic-bezier(.34,1.45,.5,1)), 레이아웃·게이지는 `--ease-smooth`. 지속시간 160/280/480/800ms. 화면 전환은 key 리마운트 + fade. 무한 루프는 티커(마르퀴)와 블루 파티클 float만. `prefers-reduced-motion` 전역 대응 내장.
- **hover**: 카드 -4px 리프트 + `--shadow-raised`; 버튼은 색 심화 + 리프트. **press**: scale 0.92~0.97 축소. **focus/선택**: 블루 링(`--focus-ring`, 3px 45%).
- **보더**: 헤어라인 `rgba(15,23,42,0.10)` 기본, 입력은 1px→포커스 시 1.5px 네이비.
- **그림자**: 딥 블랙 + 글로우 섀도 3단(card/raised/float) + `--shadow-accent-glow`(선택 상태). 인셋은 헤어라인 용도만.
- **모서리**: 넉넉한 곡률 — 8/12/16/22/30/pill. 카드 22, 입력 16, 모달 30, 칩·배지 pill.
- **투명·블러**: 스티키 헤더/하단바만 `rgba(gray,0.82~0.92)+blur(14px)` 베일. 모달 스크림은 슬레이트 46% + blur 4px.
- **시그니처 모티프**: 절취선(2px dashed)+펀치홀(배경색 원), 블루 스탬프(-8° 회전, ds-stamp 등장), 좌석맵(등받이 라운드 사각), 대학 모노그램(네이비 사각 + 블루 2글자).
- **레이아웃**: 컨테이너 1200, 카드 패딩 24, 섹션 간격 96. 예약 플로우는 하단 고정 내비(블러 베일).
- **이미지**: 현재 이미지 자산 없음 — 사진이 필요하면 쿨톤·자연광으로 통일할 것(추후 제공 시).
- **토큰 리네임 이력**: v1(그린/골드/아이보리) → v2(블루/스카이/쿨그레이). `--green-*`→`--violet-*`, `--gold-*`→`--mint-*`, `--paper-*`→`--gray-*`, `--text-on-green`→`--text-on-brand`, `--*-gold-*`→`--*-accent-*`. 컴포넌트 variant/tone 값 `gold`도 `accent`로 변경.

## ICONOGRAPHY

- **아이콘 세트**: [Lucide](https://lucide.dev) 스타일 — 24px viewBox, stroke 2, round cap/join. 채움(fill) 아이콘 금지.
- **사용 방식**: CDN 폰트가 아니라 **인라인 SVG React 컴포넌트** — `ui_kits/reservation/icons.jsx`의 `window.DSRIcons` (search, calendar, mapPin, clock, arrowRight/Left, check, users, ticket, bell, share, download, chartBar, trendUp, user, x, sparkle, armchair, graduationCap). 컴포넌트 내부(체크·화살표·닫기)도 동일 스타일 인라인.
- **크기**: 텍스트 옆 13~17px, 단독 버튼 16~19px. 색은 `currentColor`.
- **이모지·유니코드 글리프**: 아이콘 대용으로 사용하지 않음.
- ⚠️ 전용 아이콘 폰트/스프라이트 자산은 없음(소스 부재). 실서비스 전환 시 lucide 패키지 사용 권장.

---

## 파일 인덱스

- `styles.css` — 전역 진입점 (@import만)
- `tokens/` — fonts(@font-face) · colors · typography · spacing · effects(radius/shadow) · motion(이징·키프레임) · base(리셋)
- `assets/fonts/` — PretendardVariable, NanumSquareRound L/R/B/EB (woff2)
- `guidelines/` — 파운데이션 스펙 카드 13종 (Colors 4 · Type 3 · Spacing 1 · Surface 3 · Motion 2 · Brand 2)
- `components/` — 리액트 프리미티브 (아래)
- `ui_kits/reservation/` — 예약 앱 클릭 스루 6화면 (`README.md` 참조)
- `ui_kits/npr-admin/` — **npr 운영 콘솔**: 재원생 관리 · 전화예약 · 문자 발송 · 설명회 운영(QR) · 태블릿 스캐너 · 모바일 프리뷰 + 학부모 모바일 예약(`mobile.html`)
- `SKILL.md` — 에이전트용 스킬 매니페스트

## Components

네임스페이스: `window.DesignSystem_179b2a`

- **core/** — `Button`, `IconButton`, `Badge`, `Tag`, `Card`
- **forms/** — `Input`, `Select`, `Checkbox`, `Radio`, `Switch`
- **navigation/** — `Tabs`, `Stepper`, `TopNav`, `LauncherCard`
- **feedback/** — `Dialog`, `Toast`, `Tooltip`
- **reservation/** — `SessionCard`, `Ticket`

각 컴포넌트는 `<Name>.jsx` + `<Name>.d.ts`(props 계약) + `<Name>.prompt.md`(사용법) 3종 세트. 모션 내장(스프링 press, 인디케이터 슬라이드, 스탬프 등).

### Intentional additions (소스 없는 from-scratch 세트 외 도메인 추가)
- `SessionCard` — 설명회 목록의 기본 단위 (잔여석 게이지 포함)
- `Ticket` — 예약 확정 티켓, 브랜드 시그니처 모티프
- `Stepper` — 3단계 예약 플로우 진행 표시
- `TopNav` — 상단 헤더 탭바(활성 필 스프링 슬라이드) — 허브↔모듈 네비 패턴의 모듈 쪽
- `LauncherCard` — 카드 런처 허브의 모듈 진입 카드(라이브 현황 한 줄)

## 캐비앳
- 로고·사진·일러스트 자산 없음(소스 미제공). 워드마크 = 플레인 타입.
- NanumSquareRound는 "라운드 산세리프(친근)" 선택에 대한 대응 — 대체 후보: 카페24 써라운드, 원스토어 모바일고딕. 교체 원하면 폰트 파일 제공 요청.
- 샘플 데이터의 대학명(한국대·미림대 등)은 전부 가상.
