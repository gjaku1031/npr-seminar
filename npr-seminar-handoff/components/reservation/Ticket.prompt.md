예약 완료 티켓 — 이 시스템의 시그니처. 딥 잉크 헤더, 절취선 + 펀치홀, 바이올렛 스탬프가 도장 찍히듯 등장(ds-stamp).

```jsx
const { Ticket } = window.DesignSystem_179b2a;
<Ticket university="한국대학교" title="2027학년도 수시 입학설명회" round="2회차"
  date="7월 24일 (금)" time="14:00" place="대강당" name="김수민" code="KU-20260724-0138" />
```

- `punchColor`는 티켓이 놓인 배경색과 맞추기 (기본 var(--surface-page)).
- QR은 코드 시드 기반 플레이스홀더 — 실 서비스에서 실제 QR로 교체.
