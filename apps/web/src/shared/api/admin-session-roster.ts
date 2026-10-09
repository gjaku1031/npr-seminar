"use client";

/**
 * 회차 예약 명단 어댑터 (계약 tag: Admin family bookings)
 *
 * 이 화면의 읽기 단위는 예약이 걸린 참가자 한 명임 — 서버가 예약 있는 행만
 * (booked-only) 추려 주므로 예약 없는 재원생은 행으로 오지 않음. 쓰기 단위는
 * 가족 예약 집계임(형제는 같은 familyBookingId 를 되풀이함). 그래서 여기
 * 헬퍼들은 "행이 지금 어떤 상태인지"만 읽어서 서버가 허락하는 조작으로만 좁힘 —
 * 상태를 새로 지어내지 않음
 *
 * 응답은 전체 연락처를 포함한 ADMIN 전용 민감 데이터임. 저장·로깅·URL 노출 금지
 */

import { CONTACT_MAX_LENGTH, CONTACT_MIN_LENGTH } from "./admin-family-bookings";
import { apiDownload, apiRequest } from "./client";
import { BOOKING_AUDIT_EVENT_LABELS, GUEST_GRADE_OPTIONS } from "./contract";
import type {
  AttendanceParty,
  AuditActorType,
  BookingAuditEventType,
  Branch,
  FamilyBooking,
  GuestGrade,
  PublicGuestParticipantInput,
  RosterOperationalEventLabel,
  RosterOperationalEventType,
  RosterUnitGroup,
  SessionRosterBookingHistoryReference,
  SessionRosterPage,
  SessionRosterRow,
} from "./contract";

/**
 * 회차 명단 조회 조건
 */
export interface ListSessionRosterParams {
  /**
   * 캠퍼스 필터
   */
  branch?: Branch;
  /**
   * 생략하면 서버 기본값 ALL. 값이 있을 때만 실어 보냄
   */
  unitGroup?: RosterUnitGroup;
  /**
   * 정규 대표 담임 이름 그대로 — 서버가 exact 로 맞춤
   */
  teacherName?: string;
  /**
   * 이름·학교·학번 부분일치. 정확히 4자리 숫자면 연락처 뒤 4자리로 봄
   */
  query?: string;

  /**
   * 페이지 번호
   */
  page?: number;
  /**
   * 계약 최대 200
   */
  pageSize?: number;
}

/**
 * 계약 GET /api/v1/admin/seminar-sessions/{sessionId}/roster
 */
export async function listAdminSessionRoster(
  seminarSessionId: string,
  params: ListSessionRosterParams = {},
  signal?: AbortSignal,
): Promise<SessionRosterPage> {
  return apiRequest<SessionRosterPage>(
    `/admin/seminar-sessions/${encodeURIComponent(seminarSessionId)}/roster`,
    {
      method: "GET",
      query: {
        branch: params.branch,
        // ALL 은 서버 기본값이라 굳이 URL 을 늘리지 않음
        unitGroup: params.unitGroup === "ALL" ? undefined : params.unitGroup,
        teacherName: params.teacherName,
        query: params.query,
        page: params.page,
        pageSize: params.pageSize,
      },
      signal,
    },
  );
}

/* ── 명단 XLSX 내보내기 ────────────────────────────────────────────────────
 *
 * 계약 GET /api/v1/admin/seminar-sessions/{sessionId}/roster.xlsx — 지금 회차·캠퍼스·단위·
 * 담임·검색 조건 그대로의 명단을 XLSX 바이너리로 줌. 목록과 달리 페이지가 아니라
 * 조건에 맞는 전체를 서버가 뽑음(페이지 파라미터를 보내지 않음). 응답은 전체 연락처를
 * 담은 ADMIN 전용 민감 데이터임 — Blob 을 로깅·저장하지 않음
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * XLSX 응답 미디어 타입
 */
const ROSTER_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * XLSX 내보내기가 받는 필터 — 목록과 같되 페이지 파라미터는 없음(서버가 전체를 뽑음)
 */
export type ExportSessionRosterParams = Omit<ListSessionRosterParams, "page" | "pageSize">;

/**
 * 명단 XLSX 내려받기 결과
 */
export interface RosterXlsxDownload {
  /**
   * 파일 내용. 전체 연락처를 담은 민감 데이터
   */
  blob: Blob;
  /**
   * 안전 판정을 통과했거나, 통과하지 못하면 결정적 대체 이름. 언제나 `.xlsx` 로 끝남
   */
  filename: string;
}

/**
 * 서버가 준 `Content-Disposition` 파일명이 그대로 써도 안전한지 판정함. 통과하지 못하면
 * null 을 돌려 호출부가 결정적 이름으로 떨어지게 함. 경로 분리자·상위 경로·제어문자·비정상
 * 확장자는 거름 — 서버가 준 값이라도 사용자 파일 시스템에 그대로 내려보내기 전에 좁힘
 */
export function safeRosterXlsxFilename(raw: string | null): string | null {
  if (raw === null) return null;
  const name = raw.trim();
  if (name === "" || name.length > 120) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  if (name === "." || name === ".." || name.startsWith(".")) return null;
  // 제어문자(개행·탭·NUL 등) 금지 — 하이픈·공백·한글은 허용함. 문자열 안에 제어문자 리터럴을 두지
  // 않으려고 코드포인트로 검사함
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return null;
  }
  if (!/\.xlsx$/i.test(name)) return null;
  return name;
}

/**
 * 서버 파일명을 못 쓸 때의 결정적 이름 — 회차 id 를 파일명에 안전한 문자로 좁혀 붙임
 */
export function rosterXlsxFilename(seminarSessionId: string): string {
  const safeId = seminarSessionId.replace(/[^A-Za-z0-9._-]/g, "");
  return `seminar-roster-${safeId === "" ? "session" : safeId}.xlsx`;
}

/**
 * 계약 GET .../roster.xlsx — 지금 필터 그대로의 전체 명단을 XLSX 로 내려받음
 */
export async function exportAdminSessionRosterXlsx(
  seminarSessionId: string,
  params: ExportSessionRosterParams = {},
  signal?: AbortSignal,
): Promise<RosterXlsxDownload> {
  const download = await apiDownload(
    `/admin/seminar-sessions/${encodeURIComponent(seminarSessionId)}/roster.xlsx`,
    {
      query: {
        branch: params.branch,
        // 목록과 같은 규칙 — ALL 은 서버 기본값이라 싣지 않음
        unitGroup: params.unitGroup === "ALL" ? undefined : params.unitGroup,
        teacherName: params.teacherName,
        query: params.query,
      },
      accept: ROSTER_XLSX_CONTENT_TYPE,
      signal,
    },
  );

  return {
    blob: download.blob,
    filename: safeRosterXlsxFilename(download.filename) ?? rosterXlsxFilename(seminarSessionId),
  };
}

/* ── 상단 단위 탭 ──────────────────────────────────────────────────────── */

/**
 * 탭 ↔ 계약 enum 의 유일한 대응표
 *
 * 라벨은 화면 문구이고 값은 계약 값임. `단위` 판정 규칙(특목 = 특목·예중1·예고1 등)은
 *   전적으로 서버에 있음 — 여기서 반명 접두사를 뜯어 다시 계산하지 않음
 */
export const ROSTER_UNIT_TABS: ReadonlyArray<{ value: RosterUnitGroup; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "ELEMENTARY", label: "초등" },
  { value: "MIDDLE_1", label: "중1" },
  { value: "MIDDLE_2", label: "중2" },
  { value: "MIDDLE_3", label: "중3" },
  { value: "SPECIAL_PURPOSE", label: "특목" },
  { value: "HIGH", label: "고등" },
  { value: "SCIENCE", label: "과학" },
  { value: "GUEST", label: "비재원생" },
];

/**
 * 계약 단위 그룹 값 집합
 */
const UNIT_GROUPS: ReadonlySet<string> = new Set(ROSTER_UNIT_TABS.map((tab) => tab.value));

/**
 * URL 에서 읽은 값이 계약 enum 일 때만 받아들임 — 아니면 전체로 되돌림
 */
export function parseRosterUnitGroup(raw: string | null): RosterUnitGroup {
  return raw !== null && UNIT_GROUPS.has(raw) ? (raw as RosterUnitGroup) : "ALL";
}

/**
 * `분원` 열은 분원 전체일 때만 의미가 있음 — 한 분원을 고르면 모든 행이 같은 값이라
 * 소음임
 */
export function showsBranchColumn(branch: Branch | undefined): boolean {
  return branch === undefined;
}

/**
 * 서버가 판정한 정규 단위명(`unitName`) → 표에 찍는 단위 그룹 라벨
 *
 * 라벨의 유일한 출처는 이 서버 필드임 — 반명이나 raw 학년을 뜯어 다시 계산하지 않음
 *   특목·예중1·예고1 은 상단 탭과 같은 규칙으로 한 그룹(특목)으로 접힘. AdminStudent.unitName /
 *   SessionRosterRow.unitName 이 계약상 `string | null` 로 넓으므로, 모르는 값과 null 은
 *   지어내지 않고 조용히 `—` 로 떨어뜨림
 */
export function rosterUnitGroupLabel(unitName: string | null): string {
  switch (unitName) {
    case "초등":
      return "초등";
    case "중등1":
      return "중1";
    case "중등2":
      return "중2";
    case "중등3":
      return "중3";
    case "특목":
    case "예중1":
    case "예고1":
      return "특목";
    case "고등":
      return "고등";
    case "과학":
      return "과학";
    default:
      return "—";
  }
}

/* ── 예약 칸 상태 ──────────────────────────────────────────────────────── */

/**
 * 참조 화면의 예약 드랍다운 문구 — 서버 상태와 1:1 로만 이음
 */
export const ROSTER_BOOKING_LABELS = {
  none: "-",
  mother: "예약 (모)",
  father: "예약 (부)",
  both: "예약 (모/부)",
  manual: "수동 예약",
  cancel: "예약취소",
  checkedIn: "입장 완료",
} as const;

/**
 * 참석 보호자별 드롭다운 문구
 */
const PARTY_LABELS: Record<AttendanceParty, string> = {
  MOTHER: ROSTER_BOOKING_LABELS.mother,
  FATHER: ROSTER_BOOKING_LABELS.father,
  BOTH: ROSTER_BOOKING_LABELS.both,
};

/**
 * 드랍다운 한 칸이 실제로 무슨 조작인지 — 문구가 아니라 이 값으로 분기함
 */
export type RosterBookingAction =
  | { kind: "none" }
  | { kind: "party"; party: AttendanceParty }
  | { kind: "manual" }
  | { kind: "cancel" };

/**
 * 명단 예약 드롭다운의 선택지 하나
 */
export interface RosterBookingOption {
  /**
   * `<option>` 의 value — 문구가 아니라 안정된 키임
   */
  value: string;

  /**
   * 표시 문구
   */
  label: string;

  /**
   * 선택 시 실행할 조작
   */
  action: RosterBookingAction;
}

/**
 * 명단 한 행의 예약 드롭다운 상태
 */
export interface RosterBookingControl {
  /**
   * 지금 상태의 문구 = 선택된 option 의 value
   */
  value: string;
  /**
   * 고를 수 있는 것 전부 (지금 값 포함)
   */
  options: RosterBookingOption[];
  /**
   * 드랍다운 자체를 열 수 없는 상태 — 서버가 거절할 전이를 화면에서 아예 만들지 않음
   * CHECKED_IN(입장 완료)·NO_SHOW, 그리고 다시 지어낼 수 없는 비재원생 행이 여기 해당함
   */
  readOnly: boolean;
  /**
   * 읽기 전용일 때 그 자리에 그대로 보여 줄 문구
   */
  readOnlyLabel: string;
  /**
   * 취소된 상태인지 — 색만 다르게 줌
   */
  cancelled: boolean;
  /**
   * 읽기 전용이 막힌 상태라서 그런 것이면 그 이유. 아니면 null
   *
   * 되는 척도, 조용히 회색으로 죽어 있지도 않게 하려고 둠 — 왜 못 하는지 말함
   */
  blockedReason: string | null;
}

/**
 * 참석 보호자 외 고정 선택지
 */
const OPTION = {
  none: { value: "none", label: ROSTER_BOOKING_LABELS.none, action: { kind: "none" } as const },
  manual: { value: "manual", label: ROSTER_BOOKING_LABELS.manual, action: { kind: "manual" } as const },
  cancel: { value: "cancel", label: ROSTER_BOOKING_LABELS.cancel, action: { kind: "cancel" } as const },
};

/**
 * 참석 보호자 선택지 생성
 */
const partyOption = (party: AttendanceParty): RosterBookingOption => ({
  value: `party:${party}`,
  label: PARTY_LABELS[party],
  action: { kind: "party", party },
});

/**
 * 참석 보호자 세 갈래 선택지
 */
const PARTY_OPTIONS = [partyOption("MOTHER"), partyOption("FATHER"), partyOption("BOTH")];

/**
 * 행 하나의 예약 칸 상태 — 서버 상태에서만 파생함
 *
 * 지시된 드랍다운은 `- / 예약 (모) / 예약 (부) / 예약 (모/부) / 수동 예약 / 예약취소` 임
 * 그 여섯 칸을 상태별로 서버가 허락하는 만큼만 엶:
 *
 * - 예약 없음(`booking: null`, 재원생) → `-` + 참석 세 갈래 + `수동 예약`
 *   여기서 참석을 고르는 것은 API 호출이 아님. 활성 예약이 없으니 PATCH 할 집계가
 *     없고, 새 집계는 대표 연락처·경로·사유를 명시적으로 받아야 함. 그래서 참석 선택은
 *     `attendanceParty` 가 미리 채워진 수동 예약 대화상자를 여는 것으로만 이어짐
 *     BOTH 를 골라도 대표 연락처는 여전히 대화상자가 물음 — 화면이 짐작하지 않음
 * - CANCELLED(재원생) → 지금 값 `예약취소` + 참석 세 갈래 + `수동 예약`. 옛 집계는 건드리지
 *   않음(되살리기·삭제 없음) — 새 집계를 만들 뿐임
 * - CANCELLED(비재원생) → 행이 이미 이름·분원·연락처를 들고 있으면 같은 값으로 새 게스트
 *   집계를 만들 수 있음. 만들 수 없으면 영구 읽기 전용이 아니라 *막힌 이유*를 말함
 * - 예약 없음(비재원생) → 존재하지 않는 행임. 서버가 이런 행을 주지 않고, 지어내지도 않음
 * - RESERVED → 참석 학부모 변경(PATCH)과 명시적 취소만. `수동 예약`은 참석 종류가 아님
 * - CHECKED_IN / NO_SHOW → 서버가 변경을 막는 상태임. 드랍다운을 주지 않음
 */
export function rosterBookingControl(row: SessionRosterRow): RosterBookingControl {
  const booking = row.booking;
  const guest = row.participantType === "GUEST";

  if (booking === null) {
    // 예약 없는 비재원생 행은 서버가 주지 않음 — 만들 근거가 없으므로 표기만 함
    if (guest) {
      return {
        value: OPTION.none.value,
        options: [OPTION.none],
        readOnly: true,
        readOnlyLabel: ROSTER_BOOKING_LABELS.none,
        cancelled: false,
        blockedReason: null,
      };
    }

    return {
      value: OPTION.none.value,
      options: [OPTION.none, ...PARTY_OPTIONS, OPTION.manual],
      readOnly: false,
      readOnlyLabel: ROSTER_BOOKING_LABELS.none,
      cancelled: false,
      blockedReason: null,
    };
  }

  if (booking.status === "CHECKED_IN") {
    return {
      value: `party:${booking.attendanceParty}`,
      options: [],
      readOnly: true,
      readOnlyLabel: ROSTER_BOOKING_LABELS.checkedIn,
      cancelled: false,
      blockedReason: null,
    };
  }

  if (booking.status === "NO_SHOW") {
    return {
      value: `party:${booking.attendanceParty}`,
      options: [],
      readOnly: true,
      readOnlyLabel: "미참석",
      cancelled: false,
      blockedReason: null,
    };
  }

  if (booking.status === "CANCELLED") {
    // 비재원생도 행에 남은 값으로 새 집계를 세울 수 있으면 다시 예약할 수 있음
    // 값이 모자라면 지어내지 않고 왜 막혔는지 말함 — 영구 읽기 전용이 아님
    const blockedReason = guest ? guestRebookBlockedReason(row) : null;
    if (blockedReason !== null) {
      return {
        value: OPTION.cancel.value,
        options: [],
        readOnly: true,
        readOnlyLabel: ROSTER_BOOKING_LABELS.cancel,
        cancelled: true,
        blockedReason,
      };
    }

    return {
      value: OPTION.cancel.value,
      options: [OPTION.cancel, ...PARTY_OPTIONS, OPTION.manual],
      readOnly: false,
      readOnlyLabel: ROSTER_BOOKING_LABELS.cancel,
      cancelled: true,
      blockedReason: null,
    };
  }

  return {
    value: `party:${booking.attendanceParty}`,
    options: [...PARTY_OPTIONS, OPTION.cancel],
    readOnly: false,
    readOnlyLabel: PARTY_LABELS[booking.attendanceParty],
    cancelled: false,
    blockedReason: null,
  };
}

/**
 * 이 행에 지금 걸 수 있는 활성 예약이 있는가 — 즉 참석 선택이 PATCH 인가, 새 집계인가
 *
 * RESERVED 만 참석 변경(PATCH)의 대상임. 예약 없음·취소됨은 바꿀 집계 자체가 없으므로
 * 같은 `예약 (모)` 선택이라도 대화상자를 여는 것으로 가야 함
 */
export function rosterHasActiveBooking(row: SessionRosterRow): boolean {
  return row.booking?.status === "RESERVED";
}

/**
 * value → 조작. 모르는 값이면 null (서버로 아무것도 내보내지 않음)
 */
export function rosterBookingActionOf(control: RosterBookingControl, value: string): RosterBookingAction | null {
  return control.options.find((option) => option.value === value)?.action ?? null;
}

/* ── 비재원생 재예약 (취소된 행) ───────────────────────────────────────── */

/**
 * 취소된 비재원생 행으로 새 게스트 집계를 세울 수 있는가 — 없으면 그 이유
 *
 * 계약 GUEST 생성은 `contact`(8~40자) + `guest.name` + `guest.branch` + `guest.schoolName`
 * + `guest.grade`(초1~고3 enum)를 모두 요구함. 행에 다 있고 학년이 enum 이면 다시 묻지 않아도
 * 정직하게 만들 수 있음. 하나라도 없거나 학년이 enum 이 아니면 지어내는 대신 막힌 이유를 돌려줌
 *
 * 옛 집계는 절대 되살리거나 지우지 않음 — 서버가 새 집계를 만들고 옛 이력은 남음
 */
const GUEST_GRADE_SET: ReadonlySet<string> = new Set(GUEST_GRADE_OPTIONS.map((g) => g.value));

/**
 * 값이 비재원생 학년 enum 인지 판별
 */
function isGuestGrade(value: string | null): value is GuestGrade {
  return value !== null && GUEST_GRADE_SET.has(value);
}

/**
 * 취소된 비재원생 행을 그대로 재예약할 수 없는 이유. 가능하면 null
 */
function guestRebookBlockedReason(row: SessionRosterRow): string | null {
  if (row.name.trim() === "") return "이 행에 이름이 없어 새 예약을 만들 수 없어요.";
  if (row.guestContact === null) {
    return "이 행에 학부모 연락처가 없어 여기서 다시 예약할 수 없어요 — 위의 비재원생 수동 추가로 등록해 주세요.";
  }

  const contact = row.guestContact.trim();
  if (contact.length < CONTACT_MIN_LENGTH || contact.length > CONTACT_MAX_LENGTH) {
    return "이 행의 연락처가 계약이 받는 형식이 아니라 여기서 다시 예약할 수 없어요 — 위의 비재원생 수동 추가로 등록해 주세요.";
  }

  // 계약: guest 는 학교·학년(정확한 enum)이 필수임. 행에 없거나 enum 이 아니면 지어내지 않고 막음
  if (row.schoolName === null || row.schoolName.trim() === "" || !isGuestGrade(row.grade)) {
    return "이 행에 학교·학년 정보가 부족해 여기서 다시 예약할 수 없어요 — 위의 비재원생 수동 추가로 등록해 주세요.";
  }

  return null;
}

/**
 * 취소된 비재원생 행에서 그대로 뽑은 재예약 밑값 — 참석·경로·사유는 대화상자가 받음
 */
export interface RosterGuestRebookPrefill {
  /**
   * 보호자 연락처 원문
   */
  contact: string;

  /**
   * 비재원생 정보
   */
  guest: PublicGuestParticipantInput;
}

/**
 * 취소된 비재원생 행 → 새 게스트 집계의 밑값. 만들 수 없으면 null
 *
 * 학교·학년은 계약상 선택이라 없으면 실어 보내지 않음 — 빈 문자열을 값인 척 넣지 않음
 */
export function rosterGuestRebookPrefill(row: SessionRosterRow): RosterGuestRebookPrefill | null {
  if (row.participantType !== "GUEST" || row.guestContact === null) return null;
  if (guestRebookBlockedReason(row) !== null) return null;
  // guestRebookBlockedReason 가 통과했으면 school/grade 는 유효함(방어적으로 다시 좁힘)
  if (row.schoolName === null || !isGuestGrade(row.grade)) return null;

  return {
    contact: row.guestContact.trim(),
    guest: {
      name: row.name.trim(),
      branch: row.branch,
      schoolName: row.schoolName.trim(),
      grade: row.grade,
    },
  };
}

/* ── 대표 연락처 (재원생 신규 예약) ─────────────────────────────────────── */

/**
 * 재원생 신규 예약의 대표 연락처 후보
 */
export interface RosterContactChoice {
  /**
   * 연락처 주인. 모 또는 부
   */
  party: Extract<AttendanceParty, "MOTHER" | "FATHER">;

  /**
   * 표시 문구
   */
  label: string;

  /**
   * 연락처 원문
   */
  contact: string;
}

/**
 * 재원생 신규 예약이 보낼 수 있는 대표 연락처 후보
 *
 * 계약상 `contact` 는 선택한 학생의 모 또는 부 연락처와 digest 가 맞아야 함 —
 * 즉 BOTH 라는 대표 연락처는 존재하지 않음. 그래서 참석이 모+부여도 대표 연락처는
 * 여전히 한쪽을 골라야 하고, 화면이 임의로 정하지 않음
 */
export function rosterContactChoices(row: SessionRosterRow): RosterContactChoice[] {
  const choices: RosterContactChoice[] = [];
  if (row.motherPhone !== null) choices.push({ party: "MOTHER", label: "모", contact: row.motherPhone });
  if (row.fatherPhone !== null) choices.push({ party: "FATHER", label: "부", contact: row.fatherPhone });
  return choices;
}

/**
 * 같은 대표 연락처로 함께 예약해야 하는 형제 후보 (지금 페이지에서 보이는 범위)
 *
 * 서버는 한 회차·한 연락처에 활성 예약을 하나만 허용함(ACTIVE_FAMILY_BOOKING_EXISTS)
 * 즉 형제를 따로따로 예약할 수 없고 한 가족 예약에 함께 담아야 함 — 계약이 studentIds 를
 * 배열(1~10)로 받는 이유임. 후보 판정은 서버 규칙과 같은 근거(모/부 연락처 일치)만 씀
 *
 * 여기서 고르는 값은 화면에 이미 떠 있는 행들뿐임 — 다른 페이지의 형제까지 알아내지
 *   않음. 그래서 이 목록은 "이만큼은 확실히 같이 담을 수 있다"이지 "전부"가 아님
 */
export function enrolledBookingCandidates(
  rows: readonly SessionRosterRow[],
  self: SessionRosterRow,
  contact: string,
): SessionRosterRow[] {
  return rows.filter(
    (row) =>
      row.rosterEntryId !== self.rosterEntryId &&
      row.participantType === "ENROLLED" &&
      row.studentId !== null &&
      row.booking === null &&
      (row.motherPhone === contact || row.fatherPhone === contact),
  );
}

/* ── 재원생 재예약 (취소된 가족) ───────────────────────────────────────────── */

/**
 * 취소된 재원생 가족 예약을 다시 예약할 때, 함께 담아야 할 재원생 studentId 전부
 *
 * 왜 명단 행만으로는 부족한가: `enrolledBookingCandidates` 는 지금 페이지에서 보이는
 * `booking === null` 행만 줌. 취소된 가족의 형제는 (a) 같은 취소된 집계를 가리키므로
 * `booking !== null` 이고, (b) 다른 페이지에 있을 수 있음 — 둘 다 그 필터에서 빠짐. 그렇게
 * 일부만 다시 예약하면 나머지 형제는 나중에 같은 연락처로 예약하려다 서버가
 * `ACTIVE_FAMILY_BOOKING_EXISTS` 로 막음. 그래서 취소된 집계(`FamilyBooking.students`,
 * 취소 뒤에도 마지막으로 풀린 학생 링크를 담고 있음)에서 재원생 전원을 끌어와 한 번에 담음
 *
 * fail-closed 규칙 — 하나라도 어긋나면 학생을 지어내지 않고 이유를 돌려줌:
 * - 집계가 CANCELLED 가 아니면(경합으로 살아났거나 잘못 열렸으면) 옛 집계를 되살릴 수 없음
 * - 링크가 GUEST 이거나 studentId 가 null 이면 재원생 예약으로 다시 담을 수 없음
 * - 대화상자를 연 그 학생이 이 가족에 없으면 대상이 어긋난 것임
 *
 * 중복 studentId 는 한 번만 담고, 선택한 행의 학생을 맨 앞에 둠 — 그게 idempotency 대상
 * (`primaryStudentId`)이자 새 집계의 대표임. 옛 집계는 되살리지 않음: 호출부는 이 목록으로
 * 새 집계를 POST 함
 */
export type CancelledFamilyRebookResolution =
  | { ok: true; studentIds: string[] }
  | { ok: false; reason: string };

/**
 * 취소된 가족 예약을 새로 예약할 학생 ID 목록 계산. 선택한 학생을 맨 앞에 둠
 */
export function cancelledFamilyRebookStudentIds(
  detail: FamilyBooking,
  primaryStudentId: string,
): CancelledFamilyRebookResolution {
  if (detail.status !== "CANCELLED") {
    return { ok: false, reason: "이 예약이 취소 상태가 아니에요. 명단을 새로 불러와 확인해 주세요." };
  }

  const ids: string[] = [];
  for (const link of detail.students) {
    if (link.participantType !== "ENROLLED" || link.studentId === null) {
      return {
        ok: false,
        reason: "취소된 예약의 재원생 정보를 온전히 읽지 못했어요. 형제를 개별로 다시 예약해 주세요.",
      };
    }
    if (!ids.includes(link.studentId)) ids.push(link.studentId);
  }

  if (ids.length === 0) {
    return {
      ok: false,
      reason: "취소된 예약에 담긴 재원생이 없어요. 명단을 새로 불러와 확인해 주세요.",
    };
  }
  if (!ids.includes(primaryStudentId)) {
    return {
      ok: false,
      reason: "선택한 학생이 이 취소된 가족 예약에 없어요. 명단을 새로 불러와 확인해 주세요.",
    };
  }

  return { ok: true, studentIds: [primaryStudentId, ...ids.filter((id) => id !== primaryStudentId)] };
}

/* ── 이력 계보 ─────────────────────────────────────────────────────────── */

/**
 * 이력을 읽어야 할 가족 예약들 — 오래된 집계부터
 *
 * 취소 뒤 재예약이면 집계가 둘 이상임. 목록을 그릴 때 미리 읽으면 한 페이지가 곧
 * N+1 요청이므로, 이 함수는 열었을 때 무엇을 부를지만 정함
 */
export function rosterHistoryTargets(
  history: readonly SessionRosterBookingHistoryReference[],
): SessionRosterBookingHistoryReference[] {
  const seen = new Set<string>();
  return [...history]
    .filter((reference) => {
      if (seen.has(reference.familyBookingId)) return false;
      seen.add(reference.familyBookingId);
      return true;
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

/**
 * 이력 한 줄의 문구 — 명단의 `latestOperationalEvent.label` 과 같은 말을 씀
 *
 * 왜 여기서 만드는가: 계약의 이벤트 목록(BookingAuditEvent)에는 label 이 없고 type 과
 *   actor 만 있음. 반면 명단 행은 서버가 붙인 label 을 줌. 둘을 다른 말로 부르면 같은
 *   사건이 셀에서는 `웹앱 예약`, 모달에서는 `예약 생성` 으로 보임
 *
 * 지어내는 게 아니라 서버 규칙을 계약 필드로 그대로 옮긴 것임: 서버는
 *   actorSubject 가 없으면 PUBLIC_PROOF 로 분류하고 그때만 `웹앱 …` 이라고 부름
 *   (session-roster.service eventLabel/eventActorType). 그래서 판정 근거는 actorType 뿐임
 *   서버가 이미 label 을 준 이벤트(최신 1건)는 이 함수 대신 그 값을 그대로 씀
 */
export function rosterEventLabel(
  type: RosterOperationalEventType | string,
  actorType: AuditActorType,
): RosterOperationalEventLabel | string {
  switch (type) {
    case "CREATED":
    case "UPDATED":
      return actorType === "PUBLIC_PROOF" ? "웹앱 예약" : "수동 예약";
    case "CANCELLED":
      return actorType === "PUBLIC_PROOF" ? "웹앱 예약 취소" : "수동 예약 취소";
    case "CHECKED_IN":
      return "입장 완료";
    case "MARKED_NO_SHOW":
      return "미참석 처리";
    // QR 수명주기는 명단 셀에는 안 오지만 전체 이력에는 남음 — 기존 계약 문구 그대로 둠
    default:
      return BOOKING_AUDIT_EVENT_LABELS[type as BookingAuditEventType] ?? type;
  }
}

/**
 * 시간순 병합에 필요한 최소한의 모양 — 계약 BookingAuditEvent 가 그대로 들어맞음
 */
interface MergeableEvent {
  /**
   * 이벤트 ID
   */
  eventId: string;

  /**
   * 순번
   */
  sequence: string;

  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 발생 시각
   */
  occurredAt: string;
}

/**
 * 여러 집계의 이력을 하나의 시간순 계보로 — 과거→현재
 *
 * - `eventId` 로 중복을 걷어냄 (같은 집계를 두 번 읽어도 줄이 겹치지 않음)
 * - 같은 시각이면 `sequence` 로 가름. sequence 는 계약상 bigint 문자열이라 숫자로
 *   바꾸지 않고 길이→사전순으로 비교함 (집계가 다르면 sequence 공간도 다르므로
 *   마지막에 familyBookingId 로 안정 정렬만 해 줌)
 */
export function mergeRosterEventLineage<T extends MergeableEvent>(groups: ReadonlyArray<readonly T[]>): T[] {
  const byId = new Map<string, T>();
  for (const group of groups) {
    for (const event of group) {
      if (!byId.has(event.eventId)) byId.set(event.eventId, event);
    }
  }

  return [...byId.values()].sort((left, right) => {
    const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (byTime !== 0) return byTime;
    if (left.familyBookingId === right.familyBookingId) return compareSequence(left.sequence, right.sequence);
    return left.familyBookingId.localeCompare(right.familyBookingId);
  });
}

/**
 * bigint 문자열 비교 — Number 로 바꾸면 큰 값에서 정밀도가 깨짐
 */
function compareSequence(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left < right ? -1 : left > right ? 1 : 0;
}
