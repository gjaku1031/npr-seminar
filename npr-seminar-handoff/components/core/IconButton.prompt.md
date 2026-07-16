아이콘 전용 정사각 버튼 — 닫기, 공유, 북마크, 뒤로가기 등.

```jsx
const { IconButton } = window.DesignSystem_179b2a;
<IconButton variant="outline" label="공유"><i data-lucide="share-2" style={{width:18}}></i></IconButton>
```

- press 시 scale(0.92) 스프링 축소.
- `label`은 aria-label로 전달 — 항상 지정.
