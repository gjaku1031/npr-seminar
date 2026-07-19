# 디자인 핸드오프 — 모바일 예약 첫 화면 「예약 유형 선택」

> Claude Code `/design` + `--model fable` 산출물. 화면 디자인만 정의하며 `apps/web` 제품 코드는 수정하지 않는다.
> 다음 단계: Product Design `ideate`가 이 핸드오프로 정확히 3개 시각안을 생성 → 사용자 선택 → Opus 구현.

## 1. 컨텍스트

공개 루트(`/`)의 학부모 예약 플로우는 현재 캠퍼스 선택(`ReserveFlow.tsx`의 `step === "campus"`)에서 시작한다. 이번 릴리스에서 그 앞에 **예약 유형 선택** 화면이 새 첫 화면으로 들어간다. 재원생 예약만 열리고 비재원생 예약은 7/23부터 열린다. 화면의 유일한 목적은 이 두 갈래 중 하나를 고르게 하는 것이다.

- **대상 사용자**: NPR 입시설명회를 예약하려는 학부모(모바일 360–480px)
- **화면의 단일 목적**: ① 재원생 예약(활성 → 캠퍼스 선택) ② 비재원생 예약(비활성, `7/23일부터 예약 가능`)

## 2. 계승하는 기존 패턴

| 요소 | 출처 | 그대로 쓰는 값 |
| --- | --- | --- |
| 헤더 | `MobileChrome.tsx` `FlowHeader` | 티켓 마크 26px, `npr 입시설명회`, sticky, blur veil, 첫 화면이라 back 없음 |
| 페이지 배경·폭 | `ReserveView`, `MobileChrome.tsx` | `--surface-page`, 앱 폭 `min(100%, 480px)` 중앙 정렬 |
| 인트로 | 기존 캠퍼스 화면 | 컨테이너 `10px 18px 30px`, 아이브로 11px, h2 24px/800/1.3, 보조문 12.5px |
| 선택 카드 | 기존 캠퍼스 카드 | flex row, gap 14, padding `18px 20px`, `--radius-lg`, 흰 카드, hairline, card shadow, 44px 아이콘 타일, 16.5px 제목, 12.5px 설명, 16px ArrowRight |
| 비활성 카드 | 설명회 목록의 마감 카드 | `disabled`, `opacity: 0.6`, `cursor: not-allowed`, ArrowRight 제거 |
| 예정 배지 | `shared/ui/Badge` | pill, `size="sm"`, accent 톤 |
| 진입 모션 | 기존 캠퍼스 카드 | `ds-fade-up var(--dur-slow) var(--ease-out)` + 80ms 스태거 |
| 예약 조회 링크 | 기존 캠퍼스·목록 화면 | 기존 문구·색·underline·중앙 정렬 유지 |
| 폰트 | `globals.css` | NanumSquareRound / Pretendard, `word-break: keep-all` |

유일한 새 패턴은 **예정 안내 배지가 붙은 비활성 선택 카드**다. 카드 본문은 마감 카드처럼 낮추되 날짜 배지는 흐리지 않아 “사용 불가”가 아니라 “곧 열림”으로 읽히게 한다.

## 3. 정보 위계와 확정 카피

1. `FlowHeader`: `npr 입시설명회`
2. 아이브로: `STEP 1 · TYPE`
3. h2: `예약 유형을` / `선택해 주세요`
4. 보조문: `재원 여부에 따라 예약 절차가 달라요.`
5. 활성 카드
   - 제목: `재원생 예약`
   - 설명: `자녀가 NPR에 다니고 있어요`
6. 비활성 카드
   - 제목: `비재원생 예약`
   - 설명: `자녀가 아직 NPR에 다니지 않아요`
   - 배지(변경 금지): `7/23일부터 예약 가능`
7. 하단 링크: `이미 예약했나요? 예약 조회 · 변경 · 취소`

하단 고정 바는 사용하지 않는다. 카드 자체가 주 행동이다. 화면 레이블은 `data-screen-label="모바일 — 예약 유형 선택"`으로 한다.

## 4. 치수 — 360 / 390 / 480px

좌우 padding은 18px로 고정하고 카드는 fluid 100%로 둔다.

| 항목 | 값 | 360px | 390px | 480px |
| --- | --- | --- | --- | --- |
| 카드 폭 | 콘텐츠 100% | 324px | 354px | 444px |
| 카드 padding | `18px 20px`, 높이 약 80px | 공통 | 공통 | 공통 |
| 아이콘 타일 | 44×44px, `--radius-sm` | 공통 | 공통 | 공통 |
| 카드 간격 | 12px | 공통 | 공통 | 공통 |
| h2 | 24px / 800 / 1.3 | 2줄 | 2줄 | 2줄 |
| 카드 제목 | 16.5px / 800 / `--font-display` | 공통 | 공통 | 공통 |
| 카드 설명 | 12.5px / `--text-muted` | 공통 | 공통 | 공통 |
| 배지 | Badge sm, 높이 20px, 11px | 넘치면 제목 아래 4px 간격 | 인라인 | 인라인 |

480px를 넘으면 앱 전체를 `APP_MAX_WIDTH` 480 안에 중앙 고정한다. 360px에서 제목과 배지가 한 줄에 들어가지 않으면 배지를 제목 아래로 내리는 폴백을 모든 시각안에 포함한다.

## 5. 상태

이 화면은 데이터 의존이 없으므로 로딩·오류·빈 상태가 없다.

### 재원생 카드

- 기본: `--surface-card` + `--border-hairline` + `--shadow-card`
- 아이콘 타일: `--violet-50` / `--violet-800`
- 우측 ArrowRight 표시
- press: `scale(0.98)`, `--dur-fast`, `--ease-out`
- focus-visible: `2px solid var(--violet-600)`, offset 2px, `var(--focus-ring)`
- 선택 시 기존 캠퍼스 화면으로 이동

### 비재원생 카드

- `<button disabled aria-disabled="true">`, ArrowRight 없음
- 아이콘 타일: `--surface-sunken` / `--text-faint`
- 제목·설명만 opacity 0.6
- `7/23일부터 예약 가능` 배지는 opacity를 낮추지 않고 `Badge tone="accent" size="sm"` 유지
- disabled이므로 탭 반응이나 토스트 없음

인트로 → 카드1 → 카드2 → 링크 순으로 80ms 스태거를 둔다. `prefers-reduced-motion`에서는 전역 규칙을 따른다.

## 6. 접근성

- 카드: `<button type="button">`, 제목: 실제 `<h2>`
- Tab 순서: 재원생 카드 → 예약 조회 링크. 비활성 카드는 탭 순서에서 제외
- Enter/Space로 활성 카드 실행
- 비활성 카드 DOM에서 배지를 제목 바로 다음에 배치해 “비재원생 예약, 7/23일부터 예약 가능” 순으로 낭독
- 모든 아이콘은 `aria-hidden="true"`
- 기존 토큰 조합으로 AA 대비 유지

## 7. 토큰·컴포넌트 매핑

| 대상 | 매핑 |
| --- | --- |
| 배경/카드/보더/그림자 | `--surface-page` / `--surface-card` / `--border-hairline` / `--shadow-card` |
| 브랜드 블루 | `--violet-800`, `--violet-50`, `--violet-900` |
| 스카이 포인트 | `--mint-100` / `--mint-700`, `--text-accent` |
| 라운드 | 카드 `--radius-lg`, 타일 `--radius-sm`, 배지 `--radius-pill` |
| 컴포넌트 | `FlowHeader`, `Badge`, 기존 캠퍼스 카드 구조 |
| 아이콘 | lucide `GraduationCap` 20, `UserPlus` 20, `ArrowRight` 16 |

신규 공용 컴포넌트는 만들지 않는다.

## 8. Product Design ideate용 3안 아트 디렉션

모든 안은 확정 카피, 치수, 토큰, 헤더, 예약 조회 링크, 스태거, 480px 폭, 카드 2장 세로 스택, 비재원생 비활성 상태를 동일하게 유지한다.

- **A안 — 대등한 두 갈래**: 두 카드 모두 캠퍼스 카드와 같은 문법. 아이콘 타일 색만 활성/비활성으로 구분하는 가장 보수적인 기준안.
- **B안 — 주인공 강조**: 재원생 카드에 `--surface-brand-soft` 또는 1.5px 브랜드 보더와 기존 accent glow를 적용. 비재원생 카드는 padding `15px 16px`로 한 단계 낮은 밀도.
- **C안 — 티켓 모티프**: `guidelines/brand-ticket-motif.html`의 우측 반원 노치 또는 절취선 힌트를 카드에 이식. 완료 티켓과 수미상응하되 색·폰트·카드 스택은 그대로 유지.

## 9. ideate에 첨부할 참조

- 실제 현재 첫 화면: `apps/web/src/widgets/reserve-flow/ui/ReserveFlow.tsx` 220–285행
- 모바일 헤더·앱 폭: `apps/web/src/widgets/reserve-flow/ui/MobileChrome.tsx`
- 전역 토큰: `apps/web/src/app/globals.css`
- 원형 POC: `docs/design/npr-seminar-handoff/ui_kits/npr-admin/MobileFlow.jsx` 96–167행
- 티켓 모티프(C안만): `docs/design/npr-seminar-handoff/guidelines/brand-ticket-motif.html`
- 원형 모바일 프리뷰: `docs/design/npr-seminar-handoff/ui_kits/npr-admin/mobile.html`
- 프로덕션 루트 참조 URL: `https://npr-survey.example.ts.net/`

URL을 참조로 쓸 때는 Product Design 지침에 따라 현재 첫 화면을 390×844 및 480×900으로 먼저 캡처해 이미지로 첨부한다. 같은 상태·뷰포트로 세 안을 비교한다.

## 10. 구현 단계에서 확인할 통합 사항

- 새 화면을 `Step` 유니언 앞단에 넣고 기존 캠퍼스 화면에는 예약 유형 선택으로 돌아가는 back을 추가한다.
- 기존 캠퍼스·설명회 화면의 `STEP` 번호를 한 단계씩 올릴지 결정한다.
- 재원생 선택 화면의 `비재원생 예약하기` 폴백과 OTP 비재원 폴백에도 7/23 게이트가 필요한지 결정한다.

## 구현 후 검증

1. 360/390/480px에서 치수와 배지 줄바꿈 폴백 확인
2. 키보드로 재원생 카드 진입, 비활성 카드 탭 제외 확인
3. 스크린리더로 비활성 카드와 날짜 안내 순서 확인
4. reduced-motion 상태 확인
5. 선택된 시각안과 같은 뷰포트·상태에서 Product Design `design-qa` 수행
