카드 런처 허브의 모듈 진입 카드 — hover 리프트 + 블루 글로우 + 아이콘 틸트 + 화살표 슬라이드.

```jsx
const { LauncherCard } = window.DesignSystem_179b2a;
<LauncherCard icon={<UsersIcon />} title="재원생 관리" stat="40명 · 미예약 9" onClick={...} delay={0} />
<LauncherCard tone="brand" title="설명회 운영" stat="진행 중 1" onClick={...} delay={70} />
```

- `stat`에 라이브 현황 한 줄. `delay`로 스태거 등장. `tone="brand"`는 네이비 강조 카드.
