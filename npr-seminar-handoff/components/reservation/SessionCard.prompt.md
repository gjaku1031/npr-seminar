설명회 목록 카드 — 대학 모노그램, 전형 태그, 일시/장소, 잔여석 게이지.

```jsx
const { SessionCard } = window.DesignSystem_179b2a;
<SessionCard university="한국대학교" title="2027학년도 수시 입학설명회"
  date="7월 24일 (금)" time="14:00" place="대강당" types={['수시','학생부종합']}
  seatsLeft={38} seatsTotal={300} onClick={...} />
```

- 잔여 15% 이하면 게이지가 레드 '마감 임박', `closed`면 흐림 처리.
- hover: 카드 리프트, 모노그램 -4° 틸트, 화살표 슬라이드 인.
