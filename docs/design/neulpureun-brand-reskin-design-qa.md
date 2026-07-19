# 늘푸른수학원 브랜드 리스킨 디자인 QA

## 범위

- 기준 자산: 사용자 제공 `늘푸른수학원` 로고 JPG
- 구현 URL: `https://npr-survey.tailedbbb5.ts.net`
- 변경 범위: 로고와 색상 토큰만 변경
- 보존 범위: 레이아웃, 타이포그래피, 간격, radius, 정보 구조, 카피, 기능, API

## 구현 확인

- [x] 사용자 제공 원본을 수정 없이 `public/brand/neulpureun-logo-source.jpg`에 적용
- [x] 앱 아이콘과 Apple touch icon에 동일 원본 적용
- [x] TopNav, 허브, 로그인, SMS 미리보기, 공개 모바일 헤더의 임시 `npr` 마크 교체
- [x] Fable 팔레트를 전역 시맨틱 토큰과 디자인 핸드오프 토큰에 반영
- [x] QR 흑백 렌더링과 스캐너 니어블랙 기능 표면 보존
- [x] 성공·경고·오류·정보 상태색을 브랜드색과 별도로 유지
- [x] 포커스 표시와 다크 스캐너 상태 전경의 WCAG AA 대비 확인
- [x] 모바일·데스크톱의 기존 레이아웃과 동작 계약 보존

## 품질 게이트

- [x] 프론트 테스트 329개 통과
- [x] TypeScript 타입 검사 통과
- [x] ESLint 전체 검사 통과
- [x] Next.js 프로덕션 빌드 통과
- [x] 운영 API, 웹, worker 서비스 active
- [x] PostgreSQL·Redis readiness 통과
- [x] 운영 로고 응답 SHA-256이 원본과 일치

## 시각 QA

- 구현 화면과 기준 로고를 같은 상태·뷰포트에서 비교하는 최종 시각 검수는 사용자가 선택한 인앱 브라우저에서 수행한다.
- 확인 대상: `/`, `/login`, `/students`, `/student-status`, `/scanner`, `/scanner/connect`, `/sms`.
- 현재 상태: **배포 및 코드 QA 완료, 인앱 브라우저 시각 승인 대기**.

