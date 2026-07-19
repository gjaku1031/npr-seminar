# shared — 공용 레이어 (업무로직 없음)

- `ui/` — ★ **새 디자인 시스템이 들어올 자리** (결정 S1: 참고 구조의 NP Edu는 승계하지 않음)
- `config/` — 클라이언트 노출 env(`NEXT_PUBLIC_*`). **서버 env는 `src/server/config`** (분리 이유: 시크릿 번들 유출 차단)
- `lib/` — 순수 유틸 (지연 생성). 이음새 예약: `lib/auth`(권한·세션 헬퍼) · `lib/i18n` (설계 §8)

의존: 없음(최하층). server 존은 `shared/lib`·`shared/config`만 참조 가능 — React가 있는 `shared/ui`는 금지(R5).
