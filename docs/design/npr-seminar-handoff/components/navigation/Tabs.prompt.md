탭 전환. 밑줄/필 인디케이터가 스프링 이징으로 슬라이드.

```jsx
const { Tabs } = window.DesignSystem_179b2a;
<Tabs items={[{label:'예정', value:'up', count:2}, {label:'지난 설명회', value:'past'}]} value={t} onChange={setT} />
<Tabs variant="pill" items={['전체','수시','정시']} value={t} onChange={setT} />
```
