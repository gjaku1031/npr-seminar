# features — 사용자 행위 레이어

**동사** 단위 유스케이스(create-seminar, check-in-attendee …).

- 슬라이스 구조: `features/<행위>/{ index.ts, api/, ui/, model/ }`
  - `api/actions.ts` = **Server Action** (`"use server"`) — **변경의 유일한 진입점** (설계 §5·§7).
    표준형: zod 검증 → `@/server/services` 호출 → `revalidatePath` → 상태 반환.
    참고 구조에서 mutation 훅(TanStack Query)이 있던 자리에 action이 들어온 것.
- `@/server` import는 이 레이어에서 **`api/` 세그먼트만** 가능, 그것도 `@/server/services`만 (ESLint R1).
  ui는 자기 슬라이스의 action을 상대경로로 가져와 `useActionState`로 묶는다.
- 의존: `entities`·`shared`만. 같은 레이어 슬라이스 간 직접 import 금지.

예: `features/create-seminar` (표준 슬라이스).
