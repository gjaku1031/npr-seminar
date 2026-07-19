# features — 사용자 행위 레이어

**동사** 단위 유스케이스. 슬라이스 구조: `features/<행위>/{ index.ts, api/, ui/, model/ }`

## Server Action = 변경의 유일한 진입점 (설계 §5·§7, 결정 S4)

`api/actions.ts` (`"use server"`)가 모든 변경을 받는다. REST Route Handler(`app/api/**`)는 두지 않는다 —
조회는 RSC 페이지가 `@/server/services`를 직접 호출한다.

표준형 (설계 §7):

```
zod 검증 → @/server/services 호출 → revalidatePath → ActionState 반환
```

- 도메인 에러(`DomainError`)는 `toActionState()`가 사용자 메시지로 변환한다 — throw가 아니라 상태로 반환(폼 UX).
- `@/server` import는 이 레이어에서 **`api/` 세그먼트만** 가능, 그것도 `@/server/services`만 (ESLint R1).
  ui는 자기 슬라이스의 action을 상대경로로 가져와 `useActionState`로 묶는다.
- 의존: `entities`·`shared`만. 같은 레이어 슬라이스 간 직접 import 금지.

## 슬라이스 (핵심 조작 — 2026-07-16 범위)

| 슬라이스 | 조작 | 명세 |
|---|---|---|
| `create-session` | 설명회 생성 | §7.2 |
| `close-session` | 종료(미체크 일괄 노쇼) · 삭제 | §7.7 · 12.4 |
| `create-reservation` | 예약 생성 (모바일·전화·수동·가족) | §5.6 · §10 · 12.13 |
| `manage-reservation` | 취소 · 회차 이동 · QR 재발급 | §5.4 · 12.2 · 12.12 |
| `check-in` | 수동 체크인 · QR 입장 · 현장 입장 · 입장 취소 | §7.6 · §8.5 · §8.6 · 12.12 |
| `manage-student` | 학생 추가 · 비재원 전환 | §4.8 · 12.14 |

문자·설문·상담·통계 모듈의 조작은 해당 화면 구현 시 슬라이스를 추가한다 (설계 §10 절차).
