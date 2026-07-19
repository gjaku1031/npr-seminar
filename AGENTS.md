# 에이전트 작업 경계

## 오케스트레이터

루트 에이전트는 사용자 요청을 프론트엔드와 백엔드 담당에게 분배하고, 앱 간 계약과 통합 상태를 확인한 뒤 결과를 취합한다.

### 모델 라우팅 (필수)

| 작업 | 실행 담당 | 모델과 모드 |
| --- | --- | --- |
| 복잡한 작업, 백엔드 구현, 아키텍처, 마이그레이션 | Codex 작업 에이전트 | `gpt-5.6-sol` + `max` + Fast |
| 여러 도메인에 걸친 최고난도·고위험 작업 또는 독립 검토가 필요한 작업 | Codex 작업 에이전트 | `gpt-5.6-sol` + `ultra` + Fast |
| 간단하고 범위가 분명한 코딩 | Codex 작업 에이전트 | `gpt-5.6-sol` + `xhigh` + Fast |
| 기존 프론트 화면 구현·수정 | Claude Code | `opus` |
| 기존에 없는 새 화면의 디자인 | Claude Code `/design` | `fable` |
| 선택된 새 화면 디자인의 구현 | Claude Code | `opus` |

Codex 작업 에이전트를 호출할 때는 모델을 `gpt-5.6-sol`, `model_reasoning_effort`를 작업에 따라 `xhigh`·`max`·`ultra`, `service_tier`를 `fast`로 명시한다. 오케스트레이터는 결과와 diff를 직접 검토하고 품질 게이트를 실행한 뒤 사용자에게 보고한다.

Claude Code의 `fable`·`opus` 호출은 일반 모드로 실행한다. Fast mode는 사용하지 않는다.

단순 작업을 이유로 `max`나 `ultra`를 쓰지 않고, 복잡한 백엔드 작업을 `xhigh`로 낮추지 않는다. 난도가 애매하면 영향 범위와 실패 비용을 기준으로 높은 쪽을 선택한다.

## 프론트엔드 담당

- 소유 경로: `apps/web`, `docs/design`
- 역할: Next.js 구현, UI/UX, 접근성, 프론트 품질 게이트
- 기존 화면 작업은 현재 코드, 디자인 토큰, 공용 컴포넌트와 핸드오프를 먼저 읽고 Claude Code `opus`에 구현을 맡긴다. 기존 시각 언어를 임의로 재설계하지 않는다.
- 새 화면은 반드시 아래 새 화면 워크플로를 따른다. Fable 디자인 단계를 건너뛰거나 Opus가 디자인을 새로 결정하게 하지 않는다.
- Claude Code 결과를 직접 검증하고 오케스트레이터에게 보고한다.
- `apps/api` 내부 구현을 직접 변경하지 않는다.

### 새 화면 워크플로 (필수)

1. Product Design의 `index`와 지시된 `user-context`·`get-context`를 사용해 대상 사용자, 화면의 한 가지 핵심 목적, 기존 제품 맥락을 정리한다.
2. Claude Code를 `--model fable`로 실행하고 프로젝트 `/design` 명령을 사용한다. 이 단계는 디자인 전용이며 제품 코드를 수정하지 않는다.
3. Product Design `ideate`로 정확히 세 개의 시각안을 만들고 사용자가 하나를 선택할 때까지 구현하지 않는다.
4. 선택된 시각안을 기준으로 Product Design `image-to-code` 절차를 따르면서 Claude Code `opus`가 실제 코드를 구현한다.
5. 같은 뷰포트와 상태에서 원본 시각안과 구현 화면을 비교하는 Product Design `design-qa`를 수행하고, 접근성·반응형·핵심 상호작용까지 검증한다.

새 화면에 URL, 스크린샷, Figma, 목업 등 시각 기준이 없다면 Fable `/design`과 Product Design 시각안 선택이 그 기준을 만든다. 선택 전에는 scaffold나 구현을 시작하지 않는다.

## 백엔드 담당

- 소유 경로: `apps/api`
- 역할: NestJS, API, 인증/인가, DB, 외부 연동, 백엔드 품질 게이트
- 구현은 `gpt-5.6-sol`의 `max` + Fast를 기본으로 하고, 여러 도메인·동시성·보안·데이터 마이그레이션처럼 실패 비용이 큰 작업은 `ultra` + Fast를 사용한다.
- `apps/web` 내부 구현을 직접 변경하지 않는다.

## 공동 경계

`packages/contracts`의 OpenAPI 계약 변경은 양쪽 영향도를 확인한다. 프론트와 백엔드는 서로의 내부 코드를 import하지 않는다.
