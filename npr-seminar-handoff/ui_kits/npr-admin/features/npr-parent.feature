# 자동 생성 — 원본(진실원): flow-data.js / flows.json (v3.3 · 2026-07-16). 직접 수정하지 말고 원본에서 재생성.
# npr 대입설명회 운영 시스템 · 권한별 E2E 유저플로우

Feature: 학부모 / 학생 — 설명회 예약자 (모바일)
  목표: 자녀 설명회를 예약·관리하고 참석 후 설문을 남긴다.
  진입: mobile.html — 로그인 없음
  권한: ✓ 모바일 예약 / ✕ 콘솔 접근 / ✕ 로그인

  # ===== PARENT-P1 · 설명회 선택 (모바일 · 로그인 없음) =====

  Scenario: PARENT-P1 · 설명회 선택 — 마감
    Given [PARENT-P1-01] mobile.html 접속 (로그인 없음)
    When [PARENT-P1-02] 캠퍼스 선택 (STEP 1)
    And [PARENT-P1-03] 설명회 목록 (STEP 2)
    And [PARENT-P1-04] 마감 여부 → 마감
    Then [PARENT-P1-05] 카드 비활성 (마감 배지)

  Scenario: PARENT-P1 · 설명회 선택 — 예약 가능
    Given [PARENT-P1-01] mobile.html 접속 (로그인 없음)
    When [PARENT-P1-02] 캠퍼스 선택 (STEP 1)
    And [PARENT-P1-03] 설명회 목록 (STEP 2)
    And [PARENT-P1-04] 마감 여부 → 예약 가능
    And [PARENT-P1-06] → 재원생 예약 (P2)

  # ===== PARENT-P2 · 재원생 예약 (모/부 매칭 · 가족) =====

  Scenario: PARENT-P2 · 재원생 예약 (모/부 매칭 · 가족) — 불일치
    Given [PARENT-P2-01] 재원생 예약 화면
    When [PARENT-P2-02] 학부모 연락처 조회
    And [PARENT-P2-03] 일치 학생? → 불일치
    And [PARENT-P2-04] 에러 → 비재원생 예약 유도 (P3)

  Scenario: PARENT-P2 · 재원생 예약 (모/부 매칭 · 가족) — 일치
    Given [PARENT-P2-01] 재원생 예약 화면
    When [PARENT-P2-02] 학부모 연락처 조회
    And [PARENT-P2-03] 일치 학생? → 일치
    And [PARENT-P2-05] 자녀 다중 체크(가족) + 참석 학부모(모/부 복수 선택)
    Then [PARENT-P2-06] 상태 변화: +Reservation(들) · reservedBy=모/부/모,부(선택) · logs+=[웹앱 예약] · 가족이면 groupId
    And 문자 발송: 자녀별 예약 확정 + QR
    When [PARENT-P2-07] 예약 완료 티켓

  # ===== PARENT-P3 · 비재원생 예약 =====

  Scenario: PARENT-P3 · 비재원생 예약 — 중복
    Given [PARENT-P3-01] 폼: 이름*·학교·학년·연락처* + 참석 학부모(모/부 복수)
    When [PARENT-P3-02] 동일 연락처 중복? → 중복
    Then [PARENT-P3-03] '이미 예약된 연락처' 차단 안내

  Scenario: PARENT-P3 · 비재원생 예약 — 신규
    Given [PARENT-P3-01] 폼: 이름*·학교·학년·연락처* + 참석 학부모(모/부 복수)
    When [PARENT-P3-02] 동일 연락처 중복? → 신규
    Then [PARENT-P3-04] 상태 변화: +Reservation(member=false · 반명=비재원생 · reservedBy=선택) · logs+=[웹앱 예약]
    And 문자 발송: 예약 확정 + QR
    And [PARENT-P3-05] 콘솔 예약 명단에 비재원생 행으로 노출

  # ===== PARENT-P4 · 예약 조회 · 변경 · 취소 =====

  Scenario: PARENT-P4 · 예약 조회 · 변경 · 취소 — 불일치
    Given [PARENT-P4-01] 예약 조회 (연락처만)
    When [PARENT-P4-02] 일치? → 불일치
    And [PARENT-P4-03] 에러 안내

  Scenario: PARENT-P4 · 예약 조회 · 변경 · 취소 — 일치 / 예약 변경
    Given [PARENT-P4-01] 예약 조회 (연락처만)
    When [PARENT-P4-02] 일치? → 일치
    And [PARENT-P4-04] 내 예약 티켓
    And [PARENT-P4-05] 관리 선택 → 예약 변경
    Then [PARENT-P4-06] 상태 변화: sessionId 이동 · history[]
    And 문자 발송: 변경 확정

  Scenario: PARENT-P4 · 예약 조회 · 변경 · 취소 — 일치 / 예약 취소
    Given [PARENT-P4-01] 예약 조회 (연락처만)
    When [PARENT-P4-02] 일치? → 일치
    And [PARENT-P4-04] 내 예약 티켓
    And [PARENT-P4-05] 관리 선택 → 예약 취소
    Then [PARENT-P4-07] 상태 변화: → cancelled · logs+=[웹앱 예약 취소 시각]
    And 문자 발송: 취소 확인

  # ===== PARENT-P5 · 만족도 설문 (별점·후기·사진) =====

  Scenario: PARENT-P5 · 만족도 설문 (별점·후기·사진) — 가능
    Given [PARENT-P5-01] 설문 문자 URL 진입 (또는 목록 하단 링크)
    When [PARENT-P5-02] 별점(1~5) + 후기(주관식) + 사진 첨부(선택)
    And [PARENT-P5-03] 제출 가능? → 가능
    Then [PARENT-P5-04] 상태 변화: +SurveyResponse{campus·unit·별점·후기·photo}
    And [PARENT-P5-05] 감사 화면 → 콘솔 설문 결과 테이블 반영 (ADMIN-F4-07)

