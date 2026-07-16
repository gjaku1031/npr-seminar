상단 헤더 탭바 — 카드 런처 허브와 짝을 이루는 모듈 내비. 활성 필이 스프링으로 슬라이드.

```jsx
const { TopNav } = window.DesignSystem_179b2a;
<TopNav
  items={[{ label: '재원생 관리', value: 'students' }, { label: '전화예약', value: 'phone' }]}
  value={route} onChange={go}
  onBrandClick={() => go('hub')}
  right={<Avatar />}
/>
```

- `onBrandClick` = 로고 클릭 시 허브 복귀. 스티키 + 블러 베일 기본.
