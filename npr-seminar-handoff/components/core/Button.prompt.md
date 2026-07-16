CTA·액션용 기본 버튼. 예약하기(primary), 강조 포인트(accent), 보조 액션(secondary/ghost), 취소(danger).

```jsx
const { Button } = window.DesignSystem_179b2a;
<Button variant="primary" size="lg" fullWidth>예약하기</Button>
<Button variant="secondary" size="md">자세히 보기</Button>
```

- hover 시 자연스러운 색 전이 + 살짝 뜨는 그림자, press 시 scale(0.965) — 모션 내장.
- `icon`/`iconRight`에 16px 아이콘 노드를 넣으면 gap 자동 정렬.
