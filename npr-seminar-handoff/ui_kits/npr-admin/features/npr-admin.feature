# 자동 생성 — 원본(진실원): flow-data.js / flows.json (v3.3 · 2026-07-16). 직접 수정하지 말고 원본에서 재생성.
# npr 대입설명회 운영 시스템 · 권한별 E2E 유저플로우

Feature: 관리자 — 학원 운영 · 단일 관리자 계정
  목표: 설명회 예약·현장 입장·문자·설문·통계를 하나의 콘솔에서 운영한다.
  진입: 로그인(관리자) → 허브 7개 모듈
  권한: ✓ 전체 7모듈 / ✕ 간담회(준비 중)

  # ===== ADMIN-F1 · 로그인 & 라우팅 =====

  Scenario: ADMIN-F1 · 로그인 & 라우팅
    Given [ADMIN-F1-01] 콘솔 접속 (index.html)
    When [ADMIN-F1-02] 로그인 화면 — 단일 관리자
    Then [ADMIN-F1-03] 상태 변화: npr-user = admin
    When [ADMIN-F1-04] 허브 (카드 런처 7장)
    And [ADMIN-F1-05] 아바타 메뉴 → 로그아웃
    Then 상태 변화: npr-user 삭제
    And [ADMIN-F1-06] 로그인 화면 복귀

  # ===== ADMIN-F2 · 예약 명단 (설명회별 재원생 전체 + 비재원생 · 11열) =====

  Scenario: ADMIN-F2 · 예약 명단 — 예약(모/부/모,부) / 이름·연락처 입력 + 경로 선택
    Given [ADMIN-F2-01] 예약 명단 진입
    When [ADMIN-F2-02] 범위 선택
    And [ADMIN-F2-03] 필터
    And [ADMIN-F2-04] 예약 드랍다운 변경 (재원생 행) → 예약(모/부/모,부)
    Then [ADMIN-F2-05] 상태 변화: → reserved · reservedBy=모/부/모,부 · logs+=[수동 예약 시각]
    When [ADMIN-F2-09] 입장·로그 열 확인
    And [ADMIN-F2-10] 수동 추가 (비재원생) → 이름·연락처 입력 + 경로 선택
    Then [ADMIN-F2-11] 상태 변화: +Reservation(member=false) · 반명=비재원생 · 담임 공란 · reservedBy=모/부 · source=선택 경로 · logs+=[수동 예약 시각]

  Scenario: ADMIN-F2 · 예약 명단 — 수동 예약 / 이름·연락처 입력 + 경로 선택
    Given [ADMIN-F2-01] 예약 명단 진입
    When [ADMIN-F2-02] 범위 선택
    And [ADMIN-F2-03] 필터
    And [ADMIN-F2-04] 예약 드랍다운 변경 (재원생 행) → 수동 예약
    Then [ADMIN-F2-06] 상태 변화: → reserved · logs+=[수동 예약 시각]
    When [ADMIN-F2-09] 입장·로그 열 확인
    And [ADMIN-F2-10] 수동 추가 (비재원생) → 이름·연락처 입력 + 경로 선택
    Then [ADMIN-F2-11] 상태 변화: +Reservation(member=false) · 반명=비재원생 · 담임 공란 · reservedBy=모/부 · source=선택 경로 · logs+=[수동 예약 시각]

  Scenario: ADMIN-F2 · 예약 명단 — 예약취소 / 이름·연락처 입력 + 경로 선택
    Given [ADMIN-F2-01] 예약 명단 진입
    When [ADMIN-F2-02] 범위 선택
    And [ADMIN-F2-03] 필터
    And [ADMIN-F2-04] 예약 드랍다운 변경 (재원생 행) → 예약취소
    Then [ADMIN-F2-07] 상태 변화: → cancelled · logs+=[수동 예약 취소 시각]
    When [ADMIN-F2-09] 입장·로그 열 확인
    And [ADMIN-F2-10] 수동 추가 (비재원생) → 이름·연락처 입력 + 경로 선택
    Then [ADMIN-F2-11] 상태 변화: +Reservation(member=false) · 반명=비재원생 · 담임 공란 · reservedBy=모/부 · source=선택 경로 · logs+=[수동 예약 시각]

  Scenario: ADMIN-F2 · 예약 명단 — '-' / 이름·연락처 입력 + 경로 선택
    Given [ADMIN-F2-01] 예약 명단 진입
    When [ADMIN-F2-02] 범위 선택
    And [ADMIN-F2-03] 필터
    And [ADMIN-F2-04] 예약 드랍다운 변경 (재원생 행) → '-'
    Then [ADMIN-F2-08] 상태 변화: Reservation 삭제
    When [ADMIN-F2-09] 입장·로그 열 확인
    And [ADMIN-F2-10] 수동 추가 (비재원생) → 이름·연락처 입력 + 경로 선택
    Then [ADMIN-F2-11] 상태 변화: +Reservation(member=false) · 반명=비재원생 · 담임 공란 · reservedBy=모/부 · source=선택 경로 · logs+=[수동 예약 시각]

  # ===== ADMIN-F3 · 문자 발송 =====

  Scenario: ADMIN-F3 · 문자 발송 — 가능
    Given [ADMIN-F3-01] 문자 발송 진입
    When [ADMIN-F3-02] 템플릿 선택/생성/저장 + 변수 칩
    And [ADMIN-F3-03] 대상 선택
    And [ADMIN-F3-04] 발송 가능? → 가능
    Then [ADMIN-F3-05] 상태 변화: 발송 → 로그(캠퍼스 포함)
    And 문자 발송: 선택 템플릿 · 그룹 · 캠퍼스

  # ===== ADMIN-F4 · 설명회 운영 & 만족도 설문 =====

  Scenario: ADMIN-F4 · 설명회 운영 & 만족도 설문 — 발송 / 종료 처리 / 삭제 확인
    Given [ADMIN-F4-01] 설명회 운영 진입 + 좌측 목록 선택
    When [ADMIN-F4-02] 새 설명회 생성
    Then 상태 변화: +Session
    When [ADMIN-F4-03] 현황 — 스탯 4장
    And [ADMIN-F4-04] 설문 문자 내용 편집
    Then 상태 변화: surveySms 갱신
    When [ADMIN-F4-05] 설문 보내기 (입장>0) → 발송
    Then [ADMIN-F4-06] 문자 발송: 만족도 설문 요청 (별점·후기·사진 수집 URL)
    When [ADMIN-F4-07] 만족도 설문 결과 테이블
    And [ADMIN-F4-08] 설명회 종료 → 종료 처리
    Then [ADMIN-F4-09] 상태 변화: reserved → no_show (명단 미표기 · 통계용)
    When [ADMIN-F4-10] 설명회 삭제 → 삭제 확인
    Then [ADMIN-F4-11] 상태 변화: -Session · -Reservation
    And 문자 발송: 취소 안내

  # ===== ADMIN-F5 · 간담회 예약 (미구현) =====

  Scenario: ADMIN-F5 · 간담회 예약 (미구현)
    Given [ADMIN-F5-01] 간담회 예약 — 준비 중 placeholder
    Then [ADMIN-F5-02] 기능 없음 (E2E 대상 아님)

  # ===== ADMIN-F6 · 통계 =====

  Scenario: ADMIN-F6 · 통계
    Given [ADMIN-F6-01] 통계 진입
    When [ADMIN-F6-02] 범위 선택
    And [ADMIN-F6-03] 지표 카드
    And [ADMIN-F6-04] 채널별 예약 도넛
    And [ADMIN-F6-05] 단위별 예약률·참석률

  # ===== ADMIN-F7 · QR 스캐너 =====

  Scenario: ADMIN-F7 · QR 스캐너 — ON — 이 기기로 스캔 / 인식 성공 / 기존 예약 있음
    Given [ADMIN-F7-01] 기기 모니터링 (스캐너 #1~#4)
    When [ADMIN-F7-02] 기기 선택 → ON — 이 기기로 스캔
    And [ADMIN-F7-03] 전체화면 스캐너
    And [ADMIN-F7-05] QR 인식 (데모) → 인식 성공
    Then [ADMIN-F7-06] 상태 변화: reserved → entered · scannerNo·enteredAt
    And 문자 발송: 입장 완료 안내
    When [ADMIN-F7-07] 현장 입장 (연락처 뒤 4자리 · 모/부 모두 매칭) → 기존 예약 있음
    Then [ADMIN-F7-08] 상태 변화: → entered · scannerNo 기록

  Scenario: ADMIN-F7 · QR 스캐너 — ON — 이 기기로 스캔 / 인식 성공 / 재원생·무예약
    Given [ADMIN-F7-01] 기기 모니터링 (스캐너 #1~#4)
    When [ADMIN-F7-02] 기기 선택 → ON — 이 기기로 스캔
    And [ADMIN-F7-03] 전체화면 스캐너
    And [ADMIN-F7-05] QR 인식 (데모) → 인식 성공
    Then [ADMIN-F7-06] 상태 변화: reserved → entered · scannerNo·enteredAt
    And 문자 발송: 입장 완료 안내
    When [ADMIN-F7-07] 현장 입장 (연락처 뒤 4자리 · 모/부 모두 매칭) → 재원생·무예약
    Then [ADMIN-F7-09] 상태 변화: +Reservation(수동) → entered

  Scenario: ADMIN-F7 · QR 스캐너 — ON — 이 기기로 스캔 / 인식 성공 / 비재원생
    Given [ADMIN-F7-01] 기기 모니터링 (스캐너 #1~#4)
    When [ADMIN-F7-02] 기기 선택 → ON — 이 기기로 스캔
    And [ADMIN-F7-03] 전체화면 스캐너
    And [ADMIN-F7-05] QR 인식 (데모) → 인식 성공
    Then [ADMIN-F7-06] 상태 변화: reserved → entered · scannerNo·enteredAt
    And 문자 발송: 입장 완료 안내
    When [ADMIN-F7-07] 현장 입장 (연락처 뒤 4자리 · 모/부 모두 매칭) → 비재원생
    And [ADMIN-F7-10] 예약 명단 → 비재원생 추가 안내

  Scenario: ADMIN-F7 · QR 스캐너 — OFF — 연결하기 / 인식 성공 / 기존 예약 있음
    Given [ADMIN-F7-01] 기기 모니터링 (스캐너 #1~#4)
    When [ADMIN-F7-02] 기기 선택 → OFF — 연결하기
    And [ADMIN-F7-04] 카메라 권한(허용/거부)
    And [ADMIN-F7-05] QR 인식 (데모) → 인식 성공
    Then [ADMIN-F7-06] 상태 변화: reserved → entered · scannerNo·enteredAt
    And 문자 발송: 입장 완료 안내
    When [ADMIN-F7-07] 현장 입장 (연락처 뒤 4자리 · 모/부 모두 매칭) → 기존 예약 있음
    Then [ADMIN-F7-08] 상태 변화: → entered · scannerNo 기록

  Scenario: ADMIN-F7 · QR 스캐너 — OFF — 연결하기 / 인식 성공 / 재원생·무예약
    Given [ADMIN-F7-01] 기기 모니터링 (스캐너 #1~#4)
    When [ADMIN-F7-02] 기기 선택 → OFF — 연결하기
    And [ADMIN-F7-04] 카메라 권한(허용/거부)
    And [ADMIN-F7-05] QR 인식 (데모) → 인식 성공
    Then [ADMIN-F7-06] 상태 변화: reserved → entered · scannerNo·enteredAt
    And 문자 발송: 입장 완료 안내
    When [ADMIN-F7-07] 현장 입장 (연락처 뒤 4자리 · 모/부 모두 매칭) → 재원생·무예약
    Then [ADMIN-F7-09] 상태 변화: +Reservation(수동) → entered

  Scenario: ADMIN-F7 · QR 스캐너 — OFF — 연결하기 / 인식 성공 / 비재원생
    Given [ADMIN-F7-01] 기기 모니터링 (스캐너 #1~#4)
    When [ADMIN-F7-02] 기기 선택 → OFF — 연결하기
    And [ADMIN-F7-04] 카메라 권한(허용/거부)
    And [ADMIN-F7-05] QR 인식 (데모) → 인식 성공
    Then [ADMIN-F7-06] 상태 변화: reserved → entered · scannerNo·enteredAt
    And 문자 발송: 입장 완료 안내
    When [ADMIN-F7-07] 현장 입장 (연락처 뒤 4자리 · 모/부 모두 매칭) → 비재원생
    And [ADMIN-F7-10] 예약 명단 → 비재원생 추가 안내

  # ===== ADMIN-F8 · 모바일 프리뷰 =====

  Scenario: ADMIN-F8 · 모바일 프리뷰
    Given [ADMIN-F8-01] 폰 프레임 안 MobileFlow 구동
    Then [ADMIN-F8-02] 상태 변화: 프리뷰 예약·설문이 store 즉시 반영

