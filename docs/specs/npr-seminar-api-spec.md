# 입시 설명회 예약·QR 입장 시스템 — API 명세서

> **대상 독자**: 백엔드 개발팀
> **버전**: v0.1 (draft) · 최종 확정 전 리뷰 필요
> **문서 목적**: FE ↔ BE 계약(contract) 정의. DTO, 상태 코드, 동시성·인증 요구사항 전달.

---

## 0. 이 문서를 읽기 전에 (핵심 합의사항)

이 시스템은 다음 원칙 위에서 설계됐다. 구현 시 이 전제를 깨지 말 것.

1. **원천 데이터(source of truth)는 운영 DB(Postgres 권장, 예: Supabase)다.** Google Sheets는 원본이 아니다.
2. **재학생 명단(Sheets 3개)은 읽기 전용 검증 소스**다. 실시간 조회하지 말고 **캐시/동기화**해서 쓴다. (쿼터·속도 이유)
3. **Google Sheets로의 반영은 운영 DB → Sheets 단방향 미러링**이다. Sheets는 발주처가 "보기"용으로만 쓴다. FE·이 API 명세와는 무관한 별도 배치/트리거로 처리.
4. **예약자는 재학생/외부 두 유형**을 구분해 받는다. 재학생은 명단 검증 필수, 외부는 검증 없이 예약.
5. **QR은 서버가 서명한 토큰**을 발급한다. 예약 ID를 평문으로 넣지 않는다.

---

## 1. 공통 규약

### 1.1 Base & 포맷
- Base URL: `/api`
- 요청/응답 모두 `application/json; charset=utf-8`
- 시간은 전부 **ISO 8601 UTC** (`2026-03-14T05:30:00Z`). 표시용 KST 변환은 FE 책임.
- 금액·인원 등 수치는 문자열 아닌 number.

### 1.2 공통 응답 래퍼
성공/실패를 **HTTP 상태코드 + 통일된 바디**로 내려준다. FE는 이 형태에 의존한다.

**성공**
```json
{
  "success": true,
  "data": { /* 엔드포인트별 payload */ }
}
```

**실패** (HTTP 4xx/5xx)
```json
{
  "success": false,
  "error": {
    "code": "RESERVATION_SESSION_FULL",
    "message": "선택한 회차의 정원이 마감되었습니다.",
    "details": { "sessionId": "..." }
  }
}
```
> `code`는 **기계 판독용 고정 문자열**(FE 분기 처리). `message`는 사용자 노출용 한국어. 이 둘을 섞지 말 것.

### 1.3 공통 에러 코드
| code | HTTP | 의미 |
|------|------|------|
| `VALIDATION_ERROR` | 400 | 요청 스키마/필드 검증 실패 (`details.fields[]`에 필드별 사유) |
| `UNAUTHORIZED` | 401 | 인증 누락/만료 (스태프 API) |
| `FORBIDDEN` | 403 | 권한 없음 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `CONFLICT` | 409 | 동시성 충돌(정원 마감, 중복 입장 등 — 하위 code로 세분) |
| `RATE_LIMITED` | 429 | 레이트리밋 |
| `INTERNAL_ERROR` | 500 | 서버 오류 |

### 1.4 인증 (백엔드 팀 결정에 위임 — 요구사항만 명시)
> 구체 방식(Supabase Auth JWT / API Key 등)은 백엔드가 선택. **아래 요구사항만 반드시 충족.**

- **공개 API** (인증 불필요): `students/verify`, `sessions`(GET), `reservations`(POST)
- **스태프 전용 API** (반드시 인증·인가 필요): `check-in`(POST), `dashboard/stats`(GET), Realtime 구독
- 스태프 API는 인증 실패 시 `401 UNAUTHORIZED` 반환.
- 인증 토큰 전달 헤더 규약을 확정해 FE에 회신할 것 (예: `Authorization: Bearer <token>`).

### 1.5 멱등성 (중요)
- `POST /api/reservations` 와 `POST /api/check-in` 은 **네트워크 재시도로 중복 호출될 수 있음**(현장 인터넷 불안정).
- FE가 `Idempotency-Key` 헤더(UUID)를 실어 보낼 예정. 동일 키의 재요청은 **같은 결과를 재반환**하고 중복 생성/중복 입장을 만들지 말 것.

---

## 2. 엔드포인트

### 2.1 `POST /api/students/verify` — 재학생 명단 검증
재학생 유형 예약자의 명단 존재 여부 확인. **예약 생성과 분리된 사전 검증 단계.**

> ⚠️ 캐시된 명단 대상으로 조회할 것. 요청마다 Sheets API를 직접 호출하지 말 것.

**Request**
```json
{
  "studentNo": "20250114",
  "name": "홍길동"
}
```

**Response 200 (일치)**
```json
{
  "success": true,
  "data": {
    "matched": true,
    "studentId": "stu_9f8a...",   // 이후 예약 생성 시 이 값 사용
    "grade": "3",
    "classNo": "5",
    "sourceSheet": "sheet_a"       // 어느 명단에서 매칭됐는지
  }
}
```

**Response 200 (불일치)** — 불일치는 에러가 아닌 정상 응답으로 처리(FE가 폼 내 안내)
```json
{
  "success": true,
  "data": { "matched": false }
}
```

**주의점 (BE)**
- 이름+학번 **둘 다 일치**해야 matched. 학번만 맞고 이름 다르면 false.
- 개인정보 최소 노출: 매칭 실패 시 명단의 다른 정보를 절대 회신하지 말 것(명단 유출 방지).
- `studentId`는 명단 원본 학번이 아니라 **내부 식별자**를 발급해 쓸 것(학번 직접 노출 회피).

---

### 2.2 `GET /api/sessions` — 설명회 회차 목록/정원
예약 폼의 회차 선택 UI에 사용. **정원 마감 여부를 FE가 disabled 처리**하는 데 필요.

**Response 200**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "ses_a1",
        "title": "1부 오전 설명회",
        "startAt": "2026-03-14T01:00:00Z",
        "capacity": 200,
        "reservedCount": 187,
        "remaining": 13,
        "status": "open"           // open | full | closed
      }
    ]
  }
}
```

**주의점 (BE)**
- `remaining`, `status`는 서버가 계산해 내려줄 것(FE가 capacity-reserved 계산하지 않게).
- `reservedCount`는 참고용. **정원 판정의 최종 권위는 예약 생성 트랜잭션**(§2.3)이지 이 값이 아님.

---

### 2.3 `POST /api/reservations` — 예약 생성 + QR 발급
**재학생/외부 유형 분기 처리의 핵심 엔드포인트.**

**Request (재학생)**
```json
{
  "visitorType": "student",         // "student" | "external"
  "studentId": "stu_9f8a...",       // student일 때 필수 (verify에서 받은 값)
  "visitorName": "홍길동",
  "phone": "010-1234-5678",
  "sessionId": "ses_a1",
  "partySize": 2
}
```

**Request (외부)**
```json
{
  "visitorType": "external",
  "studentId": null,                // external일 때 null 또는 생략
  "visitorName": "김방문",
  "phone": "010-9876-5432",
  "sessionId": "ses_a1",
  "partySize": 3
}
```

**Response 201**
```json
{
  "success": true,
  "data": {
    "reservationId": "rsv_77c...",
    "qrToken": "eyJhbGciOi...",     // 서명된 토큰. FE는 이 문자열을 QR로 렌더만 함
    "status": "reserved",
    "session": { "sessionId": "ses_a1", "title": "1부 오전 설명회", "startAt": "..." },
    "visitorName": "홍길동",
    "partySize": 2
  }
}
```

**유형별 검증 규칙 (BE — 반드시 서버에서 강제)**
| visitorType | studentId | 검증 |
|-------------|-----------|------|
| `student` | 필수 | 서버가 studentId 유효성 재확인(verify 결과 신뢰 금지, 재검증). 유효하지 않으면 `STUDENT_NOT_VERIFIED` |
| `external` | null | studentId 있으면 무시 |

**에러 코드**
| code | HTTP | 상황 |
|------|------|------|
| `RESERVATION_SESSION_FULL` | 409 | 정원 마감 (트랜잭션 내 재확인 결과) |
| `STUDENT_NOT_VERIFIED` | 400 | student인데 studentId 무효/누락 |
| `SESSION_CLOSED` | 409 | 예약 마감된 회차 |
| `DUPLICATE_RESERVATION` | 409 | (정책 결정 필요) 동일 전화번호+회차 중복 |

**동시성 주의점 (BE — 가장 중요)**
- 정원 초과 방지는 **트랜잭션 내에서 `reservedCount < capacity` 확인 후 증가**시켜 처리. §2.2의 GET 값에 의존하지 말 것.
- 예약 오픈 순간 **동시 요청 스파이크** 발생. 낙관적 락 또는 DB 제약으로 오버부킹 원천 차단.
- `Idempotency-Key` 재시도 시 **QR 재발급이 아니라 기존 예약을 반환**.

---

### 2.4 `POST /api/check-in` — QR 스캔 입장 처리 (스태프 전용)
스캐너가 읽은 토큰으로 입장 확정. **결과 상태 5단계를 FE가 현장에 즉시 표시.**

**Request**
```json
{
  "qrToken": "eyJhbGciOi...",
  "gate": "main",                   // 선택: 게이트 구분
  "staffId": "stf_01"               // 선택: 감사 추적용
}
```

**Response 200 (성공)**
```json
{
  "success": true,
  "data": {
    "result": "checked_in",
    "reservation": {
      "reservationId": "rsv_77c...",
      "visitorName": "홍길동",
      "visitorType": "student",
      "partySize": 2,
      "session": { "title": "1부 오전 설명회", "startAt": "..." },
      "checkedInAt": "2026-03-14T00:55:12Z"
    }
  }
}
```

**Response 200 (입장 불가 — 실패도 200으로 내리고 result로 구분)**
```json
{
  "success": true,
  "data": {
    "result": "already_checked_in",
    "reservation": {
      "visitorName": "홍길동",
      "checkedInAt": "2026-03-14T00:40:03Z"   // 언제 이미 입장했는지 표시
    }
  }
}
```

**result 상태 5단계** (FE는 이 값으로 화면/색상 분기)
| result | 의미 | FE 표시 예 |
|--------|------|-----------|
| `checked_in` | 입장 완료 (정상) | 🟢 입장 완료 |
| `already_checked_in` | 이미 입장한 예약 (중복 스캔) | 🟡 이미 입장함 (+ 입장시각) |
| `cancelled` | 취소된 예약 | 🔴 취소된 예약 |
| `session_mismatch` | 다른 회차 QR (오늘/이 회차 대상 아님) | 🔴 회차 불일치 |
| `invalid` | 토큰 위조/서명 검증 실패/만료 | 🔴 무효한 QR |

> 토큰 검증 실패(`invalid`)는 **바디의 result로** 내려줄지, HTTP 400으로 내려줄지 백엔드가 택1 후 회신. FE는 통일된 방식을 선호 → **가급적 result로 통일** 권장.

**동시성 주의점 (BE — 매우 중요)**
- 중복 입장 방지는 **원자적 조건부 UPDATE**로: `UPDATE ... SET status='checked_in' WHERE status='reserved'`.
  - 영향 행 수 1 → `checked_in`
  - 영향 행 수 0 → 상태 재조회해 `already_checked_in` / `cancelled` 판별
- 애플리케이션 레벨 "조회 후 업데이트"는 경합에 취약 → 쓰지 말 것.
- 입장 이벤트는 **append-only 로그**(`check_ins`)에도 기록(감사 추적).

---

### 2.5 `GET /api/dashboard/stats` — 대시보드 초기 현황 (스태프 전용)
대시보드 **최초 로드용 스냅샷**. 이후 실시간 갱신은 §3 Realtime 구독이 담당.

**Response 200**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-03-14T00:56:00Z",
    "overall": {
      "totalReserved": 540,
      "totalCheckedIn": 312,
      "checkInRate": 0.578
    },
    "bySession": [
      {
        "sessionId": "ses_a1",
        "title": "1부 오전 설명회",
        "capacity": 200,
        "reserved": 200,
        "checkedIn": 156
      }
    ],
    "byVisitorType": {
      "student": { "reserved": 210, "checkedIn": 140 },
      "external": { "reserved": 330, "checkedIn": 172 }
    }
  }
}
```

**주의점 (BE)**
- 집계는 서버 계산. FE는 그대로 렌더.
- 재학생/외부 구분 집계(`byVisitorType`) 포함 — 발주처 요구(유형 구분 접수)에 대응.

---

## 3. Realtime 구독 규약 (대시보드 실시간 갱신)

대시보드는 폴링하지 않는다. **입장(check-in) 발생 시 서버 push → 브라우저 자동 갱신.**

**BE에 요청하는 것**
- `check_ins`(또는 입장 상태 변경) 테이블/이벤트에 대한 **실시간 변경 스트림**을 FE가 구독할 수 있게 열어줄 것.
- Supabase 사용 시: `postgres_changes` 구독 대상 테이블·이벤트(`INSERT`/`UPDATE`)와 RLS 정책을 명시해 회신.
- 자체 WebSocket 구현 시: 연결 엔드포인트(`wss://...`), 인증 방식, 메시지 스키마를 아래 형태로 정의해 회신.

**FE가 기대하는 push 메시지(예시 — 실제 스키마는 BE 확정)**
```json
{
  "type": "check_in",
  "payload": {
    "sessionId": "ses_a1",
    "visitorType": "student",
    "checkedInAt": "2026-03-14T00:57:41Z"
  }
}
```
> FE는 이 이벤트를 받아 카운터를 증분. **전체 재조회 없이 델타 반영**할 수 있도록 최소 필드(sessionId, visitorType)를 포함해줄 것.

**주의점**
- 구독은 스태프 인증 통과자만 가능(§1.4).
- 순단(재접속) 시 FE가 §2.5 stats로 재동기화. BE는 재접속을 정상 처리할 것.

---

## 4. 미결 사항 (BE 리뷰 후 회신 요청)

아래는 **백엔드 팀이 결정해 FE에 회신**해야 확정되는 항목이다.

1. **인증 방식·헤더 규약** (§1.4) — Supabase Auth JWT vs API Key 등, 토큰 전달 헤더.
2. **`invalid` 토큰 응답 형태** (§2.4) — HTTP 400 vs 200+result. (FE는 result 통일 선호)
3. **중복 예약 정책** (§2.3 `DUPLICATE_RESERVATION`) — 동일 전화+회차 중복 허용 여부.
4. **Realtime 채널 스키마** (§3) — 구독 대상·메시지 포맷 확정.
5. **QR 토큰 만료(exp) 정책** — 설명회 당일만 유효? 회차 시작 전후 유효창?
6. **명단 동기화 주기** — 예약 오픈 전 1회 + 기간 중 N시간마다? 실시간 반영 필요 여부.
7. **PII 보관 정책** — 방문자 전화번호 암호화 저장 및 설명회 종료 후 파기 시점.

---

## 5. 전달 요약 (BE 팀에게 한 줄씩)

- 명단 검증은 **캐시 대상 조회**, Sheets 직접 호출 금지.
- 정원·중복입장은 **DB 트랜잭션/원자적 UPDATE**로 처리. GET 값 신뢰 금지.
- 예약/입장 API는 **멱등**하게. `Idempotency-Key` 존중.
- 실패 응답도 **통일 래퍼 + 고정 code**로. FE는 code로 분기한다.
- check-in은 **5단계 result**를 반드시 구분해 내려줄 것.
- Realtime 구독 스키마를 확정해 회신할 것.
