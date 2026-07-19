확인/취소 모달. 스크림 blur 페이드 + 다이얼로그 스프링 팝.

```jsx
const { Dialog, Button } = window.DesignSystem_179b2a;
<Dialog open={open} onClose={close} title="예약을 취소할까요?"
  footer={<><Button variant="ghost" onClick={close}>돌아가기</Button><Button variant="danger">예약 취소</Button></>}>
  취소 후에는 잔여석 상황에 따라 재예약이 어려울 수 있어요.
</Dialog>
```
