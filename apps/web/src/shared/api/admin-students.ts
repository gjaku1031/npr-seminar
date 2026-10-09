"use client";

/**
 * 관리자 학생 현황 어댑터 (계약 tags: Admin students / Admin student sync)
 *
 * 경계: same-origin `/api/v1` 만 부르고, 세션은 HttpOnly 쿠키임. Nest 의 ADMIN 세션
 * 가드가 판정하므로 여기서 권한을 재현하지 않음
 */

import { apiRequest } from "./client";
import { isAborted, isApiError } from "./problem";
import { BRANCH_LABELS } from "./contract";
import type {
  AdminStudent,
  AdminStudentReservationProjection,
  AdminStudentPage,
  Branch,
  FamilyBookingStatus,
  RepresentativeResolution,
  RosterUnitGroup,
  StudentClassificationSummary,
  StudentSyncStatus,
  SyncRun,
} from "./contract";

/**
 * 계약 listAdminStudents 질의 파라미터
 *
 * 검색 파라미터 이름은 `query` 임 — `search` 라는 파라미터는 계약에 없음
 */
export interface ListAdminStudentsParams {
  /**
   * 캠퍼스 필터
   */
  branch?: Branch;
  /**
   * 이름·학교·학번 부분일치. 정확히 4자리 숫자면 모/부 연락처 뒤 4자리도 함께 봄
   */
  query?: string;
  /**
   * 상단 단위 그룹 — 서버가 반 접두사로 판정함. 생략·ALL 은 전체임
   */
  unitGroup?: RosterUnitGroup;

  /**
   * 대표 반 이름 필터
   */
  representativeClass?: string;

  /**
   * 담임 이름 필터
   */
  teacherName?: string;

  /**
   * 단위 이름 필터
   */
  unitName?: string;
  /**
   * 대표 반 판정 결과로 거름 — 계약 enum 값만 보냄
   */
  resolution?: RepresentativeResolution;

  /**
   * 원천 재원 여부 필터
   */
  sourceActive?: boolean;
  /**
   * 회차를 함께 보내면 서버가 각 행에 hasReservation/reservation 투영을 얹음
   */
  seminarSessionId?: string;

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
 * 목록 응답에 겹쳐지는 계획된 학생별 필드 — 현재 배포에는 없을 수 있어 items 타입을 넓힘
 * 정식 계약 필드는 AdminStudent 본체에 있음. 아래 교차 타입은 롤링 배포 중인 레거시 응답의
 * 최상위 `reservationStatus` 만 선택적으로 받아 주기 위한 호환 경계임
 */
export interface AdminStudentReservationPage extends Omit<AdminStudentPage, "items"> {
  /**
   * 학생 행. 예약 투영·대표 담임 필드를 겹친 타입
   */
  items: Array<AdminStudentPage["items"][number] & AdminStudentReservation & AdminStudentCanonicalTeacher>;
}

/**
 * 관리자 학생 목록 조회
 */
export async function listAdminStudents(
  params: ListAdminStudentsParams = {},
  signal?: AbortSignal,
): Promise<AdminStudentReservationPage> {
  return apiRequest<AdminStudentReservationPage>("/admin/students", {
    method: "GET",
    query: {
      branch: params.branch,
      query: params.query,
      unitGroup: params.unitGroup,
      representativeClass: params.representativeClass,
      teacherName: params.teacherName,
      unitName: params.unitName,
      resolution: params.resolution,
      sourceActive: params.sourceActive,
      seminarSessionId: params.seminarSessionId,
      page: params.page,
      pageSize: params.pageSize,
    },
    signal,
  });
}

/* ── 분류 요약 4수 · 캠퍼스 라벨 (순수) ───────────────────────────────────────
 *
 * 요약 카드가 그리는 최종 4수는 서버가 센 값이고 클라이언트는 다시 세지 않음. 계약이
 * 신규 필드(eligibleUnique/math/scienceOnly/reviewRequired)를 냄 — 그걸 우선하고, 롤링
 * 배포로 아직 없을 때만 각각 대응하는 레거시 필드로 떨어짐. 두 값을 더하지 않음 —
 * 각 수는 독립이고 폴백도 1:1 임
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 요약 카드 4장이 그리는 최종 수. 전부 서버 집계값임(클라이언트가 다시 세지 않음)
 */
export interface StudentSummaryCounts {
  /**
   * 재원생 — 분류된 재원 합집합(무반 제외). branch+unitGroup 범위
   */
  eligibleUniqueStudentCount: number;
  /**
   * 수학 정규반 — 수학이 있는 전원(수학+과학 겸 포함). branch+unitGroup 범위
   */
  mathStudentCount: number;
  /**
   * 과학 정규반 — 수학 없는 과학. branch+unitGroup 범위
   */
  scienceOnlyStudentCount: number;
  /**
   * 확인 필요 — 분류 이상 전부. branch 범위만(unitGroup 무시)
   */
  reviewRequiredStudentCount: number;
}

/**
 * 요약 4수 정규화 — 신규 계약 필드를 우선하고, 없을 때(롤링 배포)만 각각 1:1 로 대응하는
 * 레거시 필드로 떨어짐. 절대 두 값을 더하거나 섞지 않음
 *   eligibleUniqueStudentCount ← uniqueStudentCount
 *   mathStudentCount           ← mathRegularStudentCount
 *   scienceOnlyStudentCount    ← scienceRegularStudentCount
 *   reviewRequiredStudentCount ← ambiguousStudentCount
 *
 * `??` 라 신규 필드가 0 이면 0 을 그대로 쓰고(폴백하지 않음), 아예 없을 때(undefined)만 폴백함
 */
export function resolveStudentSummaryCounts(summary: StudentClassificationSummary): StudentSummaryCounts {
  return {
    eligibleUniqueStudentCount: summary.eligibleUniqueStudentCount ?? summary.uniqueStudentCount,
    mathStudentCount: summary.mathStudentCount ?? summary.mathRegularStudentCount,
    scienceOnlyStudentCount: summary.scienceOnlyStudentCount ?? summary.scienceRegularStudentCount,
    reviewRequiredStudentCount: summary.reviewRequiredStudentCount ?? summary.ambiguousStudentCount,
  };
}

/**
 * 요약 카드 라벨 접두 — 캠퍼스가 선택되면(`branch`) 라벨 앞에 캠퍼스명을 세우고(예: `A 재원생`),
 * 전체(undefined)면 접두사 없이 그대로. 요약은 branch(+unit) 범위라 이 접두가 곧 그 범위를 말함
 */
export function campusScopedLabel(branch: Branch | undefined, label: string): string {
  return branch === undefined ? label : `${BRANCH_LABELS[branch]} ${label}`;
}

/* ── 회차 예약 여부 ───────────────────────────────────────────────────────────
 *
 * `seminarSessionId` 를 목록 요청에 함께 보내면 서버가 AdminStudent.hasReservation 과
 * AdminStudent.reservation 을 실어 줌. 정식 중첩 투영을 우선하고, 두 정식 필드가 모두 없는
 * 롤링 배포 응답에서만 과거 최상위 `reservationStatus` 를 fallback 으로 읽음
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 서버가 실어 줄 학생별 회차 예약 상태 — 가족 예약 상태 + 예약 없음(NONE)
 */
export type StudentReservationStatus = FamilyBookingStatus | "NONE";

/**
 * 정식 계약과 롤링 배포 호환 입력. AdminStudent 와 교차하면 정식 필드는 required 가 되고,
 * 순수 helper 테스트에서는 일부 필드만 넘길 수 있음
 */
export interface AdminStudentReservation {
  /**
   * 선택 회차 예약 여부. 회차를 보냈을 때만 옴
   */
  hasReservation?: boolean;

  /**
   * 선택 회차 예약 투영. 예약이 없으면 null
   */
  reservation?: AdminStudentReservationProjection | null;
  /**
   * @deprecated 정식 중첩 reservation 이 없는 레거시 응답에서만 사용함
   */
  reservationStatus?: StudentReservationStatus | null;
}

/**
 * 학생 행 예약 여부 표시 문구
 */
export type StudentReservationLabel = "예약" | "미예약";

/**
 * "예약 여부" 열 라벨은 오직 예약/미예약 두 값임. 정식 최상위 hasReservation 을 최우선으로
 * 판정하고, 롤링 배포 중 그 필드가 없을 때만 중첩 projection 또는 legacy 상태를 fallback 으로
 * 읽음. CANCELLED 는 서버의 hasReservation=false 규칙에 따라 미예약임
 */
export function studentReservationLabel(student: AdminStudentReservation): StudentReservationLabel {
  if (student.hasReservation !== undefined) {
    return student.hasReservation ? "예약" : "미예약";
  }

  if (student.reservation?.hasReservation !== undefined) {
    return student.reservation.hasReservation ? "예약" : "미예약";
  }

  switch (student.reservationStatus) {
    case "RESERVED":
    case "CHECKED_IN":
    case "NO_SHOW":
      return "예약";
    default:
      return "미예약";
  }
}

/* ── 대표 담임 (canonical 최상위 + 레거시 폴백) ──────────────────────────────
 *
 * 최종 규칙(지시된 정책): 담임 열은 AdminStudent 최상위 canonical `teacherName` 을 봄
 * 계약이 확정되며 본체로 올라올 필드라 현재/레거시 응답에는 아직 없을 수 있어(undefined) 선택
 * 필드로 겹쳐 받음. 이 필드가 응답에 실려 있으면(비 undefined) 그것이 authoritative 임 —
 * 비 null·비공백이면 그대로 쓰고, null·공백 문자열이면 "담임 없음"으로 확정해 폴백 없이 — 로
 * 둠. 오직 아예 없을 때만(undefined = 레거시 응답) 폴백으로 떨어짐
 *
 * 레거시 폴백은 수학 반이 있는 학생에게만 기존 대표 배정 규칙을 적용함. 수학 반이
 * 없으면(과학 전용 · SCIENCE_ALIAS) 최상위 canonical 이 있든 배정에 담임이 하나든 여럿이든
 * 대표를 짓지 않고 즉시 null 임(화면은 — 로 표시) — 배정 담임을 임의로 승격하지 않음
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * AdminStudent 최상위로 올라오는 canonical 대표 담임. 현재/레거시 응답엔 없을 수 있고
 * (undefined), null 은 "담임 없음"(과학 별칭 등)을 뜻함. 계약 확정 시 본체로 흡수됨
 */
export interface AdminStudentCanonicalTeacher {
  /**
   * 대표 담임 이름. 담임 없음이면 null, 레거시 응답이면 생략
   */
  teacherName?: string | null;
}

/**
 * 레거시 폴백 — 대표 배정(selectedSourceAssignmentKey)으로 지목된 assignment 의 담임만
 * 대표로 인정하고, 지목이 없으면 후보 담임이 하나로 좁혀질 때만 말함. 여러 명이면
 * 대표를 고르지 않음(고르면 지어내는 것). 호출부는 수학 반이 있는 학생에게만 적용함
 */
export function representativeTeacher(student: AdminStudent): string | null {
  const key = student.representativeClass.selectedSourceAssignmentKey;
  if (key !== null) {
    const selected = student.assignments.find((assignment) => assignment.sourceAssignmentKey === key);
    return selected?.teacherName ?? null;
  }

  const names = new Set(
    student.assignments
      .map((assignment) => assignment.teacherName)
      .filter((name): name is string => name !== null && name.trim() !== ""),
  );
  return names.size === 1 ? [...names][0]! : null;
}

/**
 * 담임 열이 표시할 대표 담임 — 최종 정책의 유일한 판정
 *
 *  1. 수학 반이 없으면(과학 전용·SCIENCE_ALIAS) 무조건 null — 최상위 canonical `teacherName`
 *     이 있든, 배정 담임이 하나든 여럿이든 담임을 짓지 않음(배정 담임을 절대 승격하지 않음)
 *  2. 수학(또는 수학+과학) 학생은 최상위 canonical `teacherName` 이 응답에 실려 있으면(비
 *     undefined) 그것이 authoritative 임: 비 null·비공백 문자열이면 그대로 쓰고, `null` 또는
 *     공백뿐인 문자열이면 "담임 없음"으로 확정해 null 을 냄 — 이때 레거시 폴백을 쓰지 않음
 *  3. `teacherName` 이 아예 없는(undefined) 레거시 응답일 때만 기존 유일 대표 배정
 *     폴백(representativeTeacher)을 씀
 */
export function resolveHomeroomTeacher(student: AdminStudent & AdminStudentCanonicalTeacher): string | null {
  // 1) 과학 전용(수학 반 없음)은 canonical 이든 배정 담임이든 대표를 짓지 않음 — 즉시 null
  if (student.mathClassName === null) return null;

  // 2) canonical teacherName 이 응답에 실려 있으면(비 undefined) 그 값이 authoritative 임:
  //    비 null·비공백이면 그대로, null·공백이면 "담임 없음" → null. 레거시 폴백을 쓰지 않음
  const canonical = student.teacherName;
  if (canonical !== undefined) {
    return typeof canonical === "string" && canonical.trim() !== "" ? canonical : null;
  }

  // 3) teacherName 이 undefined = canonical 없는 레거시 응답 → 기존 유일 대표 배정 폴백
  return representativeTeacher(student);
}

/* ── 확인 필요 학생 상세 (계약 GET /api/v1/admin/students/review-required) ──
 *
 * 요약 카드의 `확인 필요` 수(summary.reviewRequiredStudentCount)는 목록 응답이 이미 줌. 이
 * 엔드포인트는 그 수를 누가·왜 로 펼쳐 줌 — 결정론적 분류 이상(사유 코드)과 원천 반명
 *
 * 범위: 이 엔드포인트는 분원(branch)만 받음(page·pageSize 외 다른 필터 없음). 즉 단위
 *   범위를 지원하지 않음 — 요약의 reviewRequiredStudentCount 도 branch 범위만이라 둘은
 *   같은 분원 범위에서 일치함. 화면은 단위 필터링을 지어내지 않음
 * 응답 봉투는 `{ items, page:{ page,pageSize,totalItems,totalPages } }` 임(레거시 `totalCount`
 *   가 아님). 총원은 언제나 `page.totalItems` 를 읽음 — 첫 페이지 items 길이로 착각하지 않음
 * 계약 확정 전(롤링 배포)이라 현재 배포엔 없을 수 있음: 없으면(404·405·501) 빈 목록으로
 *   떨어뜨리고 화면은 요약 수만으로도 온전함. 취소(abort)는 그대로 올려 호출부가 처리함
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 AdminStudentReviewReasonCode — 결정론적 분류 이상 사유. 미래에 늘 수 있어 코드로 다룸
 */
export type ReviewReasonCode =
  | "MULTIPLE_MATH_CLASS"
  | "NO_RECOGNIZABLE_CLASS"
  | "UNIT_UNRESOLVED"
  | "ABNORMAL_OR_EMPTY_CLASS";

/**
 * 사유 코드 → 고정 한글 라벨. 화면은 이 표로만 그림 — 서버가 문구를 주지 않고 코드만 주기
 * 때문임. 계약에 정의된 알려진 enum 전부를 덮음
 */
const REVIEW_REASON_LABELS: Record<ReviewReasonCode, string> = {
  MULTIPLE_MATH_CLASS: "수학 정규반 중복",
  NO_RECOGNIZABLE_CLASS: "인식 가능한 반 없음",
  UNIT_UNRESOLVED: "단위 미확정",
  ABNORMAL_OR_EMPTY_CLASS: "반명 비정상·누락",
};

/**
 * 계약에 없던 미래 코드를 만나도 절대 `undefined` 를 보이지 않음 — 이 안전 라벨로 떨어짐
 */
export const REVIEW_REASON_FALLBACK_LABEL = "분류 규칙 확인 필요";

/**
 * 코드 → 라벨. 알려진 enum 은 고정 라벨, 그 밖(미래 코드)은 안전 라벨. 코드는 접근성 title 로 넘겨 둘 수 있음
 */
export function reviewReasonLabel(code: string): string {
  return (REVIEW_REASON_LABELS as Record<string, string>)[code] ?? REVIEW_REASON_FALLBACK_LABEL;
}

/**
 * 화면이 그릴 좁은 UI 모델 — 팝오버가 쓰는 것만. reasonCodes 는 코드 그대로 두고(라벨은
 * UI 가 reviewReasonLabel 로 그림), 원천 반명은 아래 우선순위로 정규화한 배열임
 */
export interface ReviewRequiredStudent {
  /**
   * 학생 ID
   */
  studentId: string;

  /**
   * 학번
   */
  sourceStudentNo: string;

  /**
   * 이름
   */
  name: string;

  /**
   * 캠퍼스
   */
  branch: Branch;
  /**
   * 서버 사유 코드 그대로(가공하지 않음). 화면이 reviewReasonLabel 로 고정 라벨을 그림
   */
  reasonCodes: string[];
  /**
   * 정규화된 원천 반명 — `rawClassNames`(신규 계약)가 배열로 있으면 그게 authoritative,
   * 없으면 `rawRepresentativeClassNames`(롤링 폴백), 그것도 없으면 `originalClassName`(비공백) 한 개
   * 셋 다 비면 빈 배열이라 화면은 —.
   */
  rawClassNames: string[];

  /**
   * 수학 정규반. 없으면 null
   */
  mathClassName: string | null;

  /**
   * 과학 반 목록
   */
  scienceClassNames: string[];
}

/**
 * 확인 필요 학생 목록과 서버가 센 총원
 */
export interface ReviewRequiredResult {
  /**
   * 목록
   */
  items: ReviewRequiredStudent[];
  /**
   * 서버가 센 확인 필요 총원(분원 범위) = page.totalItems. 화면은 이 수를 다시 세지 않음
   */
  totalCount: number;
}

/**
 * 확인 필요 학생 조회 조건
 */
export interface ListReviewRequiredParams {
  /**
   * 캠퍼스(계약 branch). 생략하면 전 캠퍼스임. 단위 범위는 엔드포인트가 받지 않음
   */
  branch?: Branch;
}

/**
 * 계약 최대이자 이 화면이 늘 쓰는 페이지 크기 — 한 번에 최대한 담아 페이지 왕복을 줄임
 */
const REVIEW_REQUIRED_PAGE_SIZE = 200;

/**
 * 엔드포인트 미배포 시 돌려줄 빈 결과
 */
const EMPTY_REVIEW_REQUIRED: ReviewRequiredResult = { items: [], totalCount: 0 };

/**
 * 이 상태 코드는 "엔드포인트가 아직 없다"는 뜻 — 진짜 오류가 아니라 미배포임. 빈 목록으로 떨어뜨림
 */
const REVIEW_REQUIRED_ABSENT_STATUS: ReadonlySet<number> = new Set([404, 405, 501]);

/**
 * 미배포(404·405·501) 응답을 정상 페이지와 구분하는 표식 — 첫 페이지가 이거면 곧장 빈 목록임
 */
const REVIEW_REQUIRED_ABSENT = Symbol("review-required-absent");

/**
 * 확인 필요 학생 한 페이지의 정규화 결과
 */
interface ReviewRequiredPageShape {
  /**
   * 목록
   */
  items: ReviewRequiredStudent[];

  /**
   * 전체 건수
   */
  totalItems: number;

  /**
   * 전체 페이지 수
   */
  totalPages: number;
}

/**
 * 문자열만 남긴 배열(계약 확정 전 방어). 배열이 아니면 빈 배열
 */
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * 원천 반명 정규화 — 우선순위:
 *   1) `rawClassNames`(신규 계약)가 배열이면 그게 authoritative(비어 있어도 폴백하지 않음),
 *   2) 아니면 `rawRepresentativeClassNames`(롤링 폴백)가 배열이면 그것,
 *   3) 둘 다 없으면 `originalClassName` 이 비공백일 때 그 한 개, 공백이면 빈 배열
 */
export function normalizeReviewRawClassNames(raw: {
  /**
   * 신규 계약 원천 반명 목록
   */
  rawClassNames?: unknown;

  /**
   * 롤링 배포 폴백 원천 반명 목록
   */
  rawRepresentativeClassNames?: unknown;

  /**
   * 원천 반명 문자열 하나
   */
  originalClassName?: unknown;
}): string[] {
  if (Array.isArray(raw.rawClassNames)) return stringArray(raw.rawClassNames);
  if (Array.isArray(raw.rawRepresentativeClassNames)) return stringArray(raw.rawRepresentativeClassNames);
  const original = typeof raw.originalClassName === "string" ? raw.originalClassName.trim() : "";
  return original === "" ? [] : [original];
}

/**
 * 한 항목을 좁은 UI 모델로 정규화. studentId 가 없으면(정체를 알 수 없어 dedup 불가) 버림
 */
export function normalizeReviewRequiredItem(raw: unknown): ReviewRequiredStudent | null {
  if (raw === null || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.studentId !== "string") return null;
  return {
    studentId: source.studentId,
    sourceStudentNo: typeof source.sourceStudentNo === "string" ? source.sourceStudentNo : "",
    name: typeof source.name === "string" ? source.name : "",
    branch: source.branch as Branch,
    reasonCodes: stringArray(source.reasonCodes),
    rawClassNames: normalizeReviewRawClassNames(source),
    mathClassName: typeof source.mathClassName === "string" ? source.mathClassName : null,
    scienceClassNames: stringArray(source.scienceClassNames),
  };
}

/**
 * 한 페이지 응답 정규화 — 총원·페이지 수는 page 메타에서 읽음. 정상 경로에서는 언제나
 * `page.totalItems` 가 총원임(첫 페이지 items 길이가 아님). page 가 없으면 마지막 방어로만
 * items 길이를 씀
 */
export function normalizeReviewRequiredPage(raw: unknown): ReviewRequiredPageShape {
  const source = (raw ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(source.items) ? source.items : [])
    .map(normalizeReviewRequiredItem)
    .filter((item): item is ReviewRequiredStudent => item !== null);
  const page = (source.page ?? {}) as Record<string, unknown>;
  const totalItems = typeof page.totalItems === "number" ? page.totalItems : items.length;
  const totalPages =
    typeof page.totalPages === "number" ? page.totalPages : items.length > 0 ? 1 : 0;
  return { items, totalItems, totalPages };
}

/**
 * 한 페이지 조회 — 미배포면 표식, 취소·진짜 오류는 던짐. 신호는 호출부가 넘긴 걸 그대로 씀
 */
async function fetchReviewRequiredPage(
  branch: Branch | undefined,
  page: number,
  signal?: AbortSignal,
): Promise<ReviewRequiredPageShape | typeof REVIEW_REQUIRED_ABSENT> {
  try {
    const raw = await apiRequest<unknown>("/admin/students/review-required", {
      method: "GET",
      query: { branch, page, pageSize: REVIEW_REQUIRED_PAGE_SIZE },
      signal,
    });
    return normalizeReviewRequiredPage(raw);
  } catch (caught) {
    // 취소는 그대로 올림 — 호출부(훅)가 무시함
    if (isAborted(caught)) throw caught;
    // 엔드포인트 미배포는 표식으로 — 호출부가 빈 목록으로 떨어뜨림
    if (isApiError(caught) && REVIEW_REQUIRED_ABSENT_STATUS.has(caught.status)) return REVIEW_REQUIRED_ABSENT;
    // 그 밖의 오류(네트워크·5xx)는 올려서 훅이 부드럽게 표시·재시도하게 둠
    throw caught;
  }
}

/**
 * 확인 필요 전원 조회 — pageSize=200 으로 첫 페이지를 읽고, `page.totalPages>1` 이면 나머지
 * 페이지까지 같은 AbortSignal 로 모두 읽어 합침. studentId 로 중복을 제거하되 페이지·행
 * 순서를 그대로 지킴(첫 등장 유지). 총원은 서버가 센 `page.totalItems`(첫 페이지 메타)를 씀
 *
 * 미배포(첫 페이지 404·405·501)는 빈 목록으로 떨어짐 — 요약 수만으로도 화면은 온전함
 */
export async function listReviewRequiredStudents(
  params: ListReviewRequiredParams = {},
  signal?: AbortSignal,
): Promise<ReviewRequiredResult> {
  const first = await fetchReviewRequiredPage(params.branch, 1, signal);
  if (first === REVIEW_REQUIRED_ABSENT) return EMPTY_REVIEW_REQUIRED;

  const pages: ReviewRequiredPageShape[] = [first];
  if (first.totalPages > 1) {
    // 2페이지부터 끝까지 — 전부 같은 signal 을 받으므로 취소가 모든 요청에 걸림
    const rest = await Promise.all(
      Array.from({ length: first.totalPages - 1 }, (_, index) =>
        fetchReviewRequiredPage(params.branch, index + 2, signal),
      ),
    );
    for (const page of rest) if (page !== REVIEW_REQUIRED_ABSENT) pages.push(page);
  }

  const seen = new Set<string>();
  const items: ReviewRequiredStudent[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.studentId)) continue;
      seen.add(item.studentId);
      items.push(item);
    }
  }

  // 총원은 첫 페이지 메타의 totalItems 임 — dedup 후 items 길이(≤ totalItems)로 대체하지 않음
  return { items, totalCount: first.totalItems };
}

/**
 * 조건에 맞는 재원생 수만 — 서버가 센 `page.totalItems` 를 읽음
 *
 * `AdminStudentPage.summary` 를 쓰지 않는 이유: 그 요약은 분류별 분해라 대표 반 기준으로
 * 학생을 가른 수임. "조건에 맞는 학생이 몇 명인가"라는 단일 결과 수는 `page.totalItems` 임
 */


export async function getStudentSyncStatus(signal?: AbortSignal): Promise<StudentSyncStatus> {
  return apiRequest<StudentSyncStatus>("/admin/student-sync/status", { method: "GET", signal });
}

/**
 * 수동 동기화 요청 옵션
 */
export interface StartManualSyncOptions {
  /**
   * 계약이 `x-idempotency: required` 로 요구함. 호출부가 `useOperationKey()` 로
   * 수명을 관리한 키를 넘김 — 여기서 즉석 생성하면 미확정 재시도가 중복 실행을 만듦
   */
  idempotencyKey: string;

  /**
   * 취소 신호
   */
  signal?: AbortSignal;
}

/**
 * 수동 동기화 시작 (202 Accepted + 전체 SyncRun)
 *
 * `reason` 은 계약상 필수이며 3~500자임. 이미 실행 중이면 409
 * STUDENT_SYNC_ALREADY_RUNNING, 회로가 열려 있으면 409 TONG_AUTH_CIRCUIT_OPEN 임
 */
export async function startManualStudentSync(
  reason: string,
  options: StartManualSyncOptions,
): Promise<SyncRun> {
  return apiRequest<SyncRun>("/admin/student-sync/runs/manual", {
    method: "POST",
    body: { reason },
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });
}

/**
 * 409 중 "지금은 시작할 수 없다" 를 뜻하는 계약 코드들
 */
export const SYNC_ALREADY_RUNNING_CODE = "STUDENT_SYNC_ALREADY_RUNNING";

/**
 * 회로가 열려 시작할 수 없음을 뜻하는 계약 코드
 */
export const SYNC_CIRCUIT_OPEN_CODE = "TONG_AUTH_CIRCUIT_OPEN";

/* ── 수동 동기화 게이트 (순수) ──────────────────────────────────────────────
 *
 * "지금 눌러도 되는가" 는 서버 상태로만 정해짐 — 이 판정을 순수 함수로 떼어 두면
 * 훅 밖에서 그대로 검증할 수 있고, 훅은 이 결과를 그대로 노출만 함
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 회로가 열려 원천 로그인이 잠긴 경우. 잠금이 풀려야 시작할 수 있음
 */
export const SYNC_BLOCKED_CIRCUIT_OPEN = "원천 로그인이 잠겨 있어 동기화를 시작할 수 없어요.";

/**
 * 최신 실행이 아직 살아 있는 경우
 */
export const SYNC_BLOCKED_ALREADY_RUNNING = "동기화가 이미 진행 중이에요.";

/**
 * 이 배포의 실시간 원천 연동(어댑터)이 꺼져 있어 시작 자체가 불가능한 경우
 * 일시 장애가 아니라 연동이 준비되지 않은 상태이므로 재시도를 권하지 않음 —
 * 운영자가 연동을 켜야 풀림. 어떤 설정 키·환경 값도 문구에 드러내지 않음
 */
export const SYNC_BLOCKED_SOURCE_NOT_READY =
  "이 배포에서는 원천 연동이 꺼져 있어 동기화를 시작할 수 없어요. 운영자가 연동을 활성화해야 해요.";

/**
 * 수동 동기화 시작 가능 여부 판정 입력
 */
export interface ManualSyncGateInput {
  /**
   * 상태를 아직 못 읽었으면 null — 그러면 시작 불가이되 사유는 아직 말할 수 없음
   */
  status: StudentSyncStatus | null;
  /**
   * 최신 실행이 살아 있는가 (`isActiveSyncRun(latestRun.status)`)
   */
  runActive: boolean;
  /**
   * 수동 요청이 이미 서버로 나가 있는가
   */
  starting: boolean;
}

/**
 * 수동 동기화 시작 가능 여부 판정 결과
 */
export interface ManualSyncGate {
  /**
   * 지금 수동 동기화를 시작할 수 있는가
   */
  canStart: boolean;
  /**
   * 시작할 수 없다면 사람이 읽을 이유. 가능하거나 아직 판정 전이면 null
   */
  blockedReason: string | null;
}

/**
 * 수동 동기화 시작 가능 여부 판정
 *
 * 시작하려면 네 가지가 모두 참이어야 함: 상태를 읽었고, 활성 실행이 없고, 회로가
 * CLOSED 이며, 실시간 원천 어댑터가 준비됐고(`liveSourceReady`), 아직 요청 중이 아님
 *
 * 사유 우선순위 — 회로 잠금이 가장 위임(기존 규칙 보존). 그 아래로 진행 중, 원천 미준비
 * 순임. 회로와 원천이 동시에 막아도 회로 사유가 이김
 */
export function evaluateManualSyncGate({ status, runActive, starting }: ManualSyncGateInput): ManualSyncGate {
  if (status === null) return { canStart: false, blockedReason: null };

  const circuitOpen = status.circuit.status === "OPEN";
  const liveSourceReady = status.liveSourceReady;
  const canStart = !runActive && !circuitOpen && liveSourceReady && !starting;

  let blockedReason: string | null = null;
  if (circuitOpen) blockedReason = SYNC_BLOCKED_CIRCUIT_OPEN;
  else if (runActive) blockedReason = SYNC_BLOCKED_ALREADY_RUNNING;
  else if (!liveSourceReady) blockedReason = SYNC_BLOCKED_SOURCE_NOT_READY;

  return { canStart, blockedReason };
}
