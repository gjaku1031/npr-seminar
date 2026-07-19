/**
 * 수동 동기화 게이트 순수 헬퍼 테스트 (node:test + tsx).
 *
 * 이 파일은 fetch 를 부르지 않는다 — `evaluateManualSyncGate` 는 서버 상태 스냅샷만 보는
 * 순수 함수이고, "지금 눌러도 되는가" 의 유일한 판정이다. 특히 실시간 원천 어댑터가
 * 준비되지 않았을 때(`liveSourceReady:false`) 절대 시작을 허용하지 않는지 못박는다.
 *
 * 픽스처는 계약(openapi.yaml StudentSyncStatus)의 **필수 필드를 전부** 채운 실제 응답 모양이다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  campusScopedLabel,
  evaluateManualSyncGate,
  listAdminStudents,
  listReviewRequiredStudents,
  normalizeReviewRawClassNames,
  normalizeReviewRequiredItem,
  normalizeReviewRequiredPage,
  representativeTeacher,
  resolveHomeroomTeacher,
  resolveStudentSummaryCounts,
  REVIEW_REASON_FALLBACK_LABEL,
  reviewReasonLabel,
  studentReservationLabel,
  SYNC_BLOCKED_ALREADY_RUNNING,
  SYNC_BLOCKED_CIRCUIT_OPEN,
  SYNC_BLOCKED_SOURCE_NOT_READY,
} from "./admin-students";
import type { AdminStudentCanonicalTeacher, AdminStudentReservation } from "./admin-students";
import type {
  AdminStudent,
  StudentClassificationSummary,
  StudentSourceAssignment,
  StudentSyncStatus,
  SyncCircuitStatus,
} from "./contract";

/* ── 픽스처 ──────────────────────────────────────────────────────────────── */

/** 계약 StudentSyncStatus 필수 필드 전부. 기본은 "정상·준비됨·유휴" 다. */
const status = (overrides: Partial<StudentSyncStatus> = {}): StudentSyncStatus => ({
  studentSourceOfTruth: "POSTGRESQL",
  scheduleZone: "Asia/Seoul",
  scheduleIntervalHours: 6,
  branchOrder: ["SONGPA", "WIRYE", "GWANGJIN"],
  circuit: {
    status: "CLOSED",
    version: 3,
    openedAt: null,
    openedReasonCode: null,
    openedRunId: null,
    lastResetAt: null,
    lastResetBy: null,
  },
  liveSourceReady: true,
  latestRun: null,
  canonicalReference: {
    capturedAt: "2026-07-18T00:00:00.000Z",
    uniqueStudentCount: 1200,
    includedAssignmentCount: 1500,
  },
  ...overrides,
});

/** circuit.status 만 바꾼 상태. */
const withCircuit = (circuitStatus: SyncCircuitStatus, overrides: Partial<StudentSyncStatus> = {}) =>
  status({ circuit: { ...status().circuit, status: circuitStatus }, ...overrides });

/** 계약 StudentSourceAssignment 필수 필드 전부. 담임 판정 테스트가 쓰는 key·teacherName 만 바꾼다. */
const assignment = (overrides: Partial<StudentSourceAssignment> = {}): StudentSourceAssignment => ({
  assignmentId: "a1",
  sourceAssignmentKey: "key-1",
  sourceStudentNo: "S001",
  branch: "SONGPA",
  className: "중3 수학 A",
  schoolName: null,
  grade: null,
  teacherName: null,
  sourceStatus: null,
  sourceActive: true,
  candidateType: "REGULAR",
  exclusionReason: "NONE",
  firstSeenRunId: "run-1",
  lastSeenRunId: "run-1",
  ...overrides,
});

/**
 * 계약 AdminStudent(+ canonical 담임 오버레이) 필수 필드 전부. 기본은 "수학 반 있는 재원생".
 * teacherName 은 오버레이(선택 필드)라 기본 픽스처엔 없다(레거시 응답 모양) — 필요할 때만 얹는다.
 */
const student = (
  overrides: Partial<AdminStudent & AdminStudentCanonicalTeacher> = {},
): AdminStudent & AdminStudentCanonicalTeacher => ({
  studentId: "s1",
  sourceStudentNo: "S001",
  name: "학생",
  branch: "SONGPA",
  schoolName: null,
  grade: null,
  motherPhone: null,
  fatherPhone: null,
  unitName: null,
  sourceActive: true,
  representativeClass: {
    resolution: "REGULAR",
    displayName: "중3 수학 A",
    ambiguous: false,
    regularCandidateCount: 1,
    scienceCandidateCount: 0,
    selectedSourceAssignmentKey: null,
  },
  mathClassName: "중3 수학 A",
  scienceClassNames: [],
  assignments: [],
  firstSeenAt: "2026-07-01T00:00:00.000Z",
  lastSeenAt: "2026-07-18T00:00:00.000Z",
  ...overrides,
});

/* ── 테스트 ──────────────────────────────────────────────────────────────── */

describe("evaluateManualSyncGate", () => {
  it("준비됨 + 회로 CLOSED + 유휴 → 시작 가능하고 사유가 없다", () => {
    const gate = evaluateManualSyncGate({
      status: status({ liveSourceReady: true }),
      runActive: false,
      starting: false,
    });
    assert.equal(gate.canStart, true);
    assert.equal(gate.blockedReason, null);
  });

  it("회로 CLOSED 인데 원천 미준비면 시작할 수 없고 미준비 사유를 낸다", () => {
    const gate = evaluateManualSyncGate({
      status: withCircuit("CLOSED", { liveSourceReady: false }),
      runActive: false,
      starting: false,
    });
    assert.equal(gate.canStart, false);
    assert.equal(gate.blockedReason, SYNC_BLOCKED_SOURCE_NOT_READY);
  });

  it("회로 OPEN 과 원천 미준비가 겹치면 회로 사유가 이긴다", () => {
    const gate = evaluateManualSyncGate({
      status: withCircuit("OPEN", { liveSourceReady: false }),
      runActive: false,
      starting: false,
    });
    assert.equal(gate.canStart, false);
    assert.equal(gate.blockedReason, SYNC_BLOCKED_CIRCUIT_OPEN);
  });

  it("원천이 준비돼도 회로가 OPEN 이면 회로 사유로 막힌다", () => {
    const gate = evaluateManualSyncGate({
      status: withCircuit("OPEN", { liveSourceReady: true }),
      runActive: false,
      starting: false,
    });
    assert.equal(gate.canStart, false);
    assert.equal(gate.blockedReason, SYNC_BLOCKED_CIRCUIT_OPEN);
  });

  it("실행이 살아 있으면 진행 중 사유로 막힌다 (원천 준비·회로 CLOSED 여도)", () => {
    const gate = evaluateManualSyncGate({
      status: withCircuit("CLOSED", { liveSourceReady: true }),
      runActive: true,
      starting: false,
    });
    assert.equal(gate.canStart, false);
    assert.equal(gate.blockedReason, SYNC_BLOCKED_ALREADY_RUNNING);
  });

  it("이미 요청이 나가 있으면 시작할 수 없되 별도 사유는 두지 않는다", () => {
    const gate = evaluateManualSyncGate({
      status: status({ liveSourceReady: true }),
      runActive: false,
      starting: true,
    });
    assert.equal(gate.canStart, false);
    assert.equal(gate.blockedReason, null);
  });

  it("상태를 아직 못 읽었으면 시작할 수 없고 사유도 아직 말하지 않는다", () => {
    const gate = evaluateManualSyncGate({ status: null, runActive: false, starting: false });
    assert.equal(gate.canStart, false);
    assert.equal(gate.blockedReason, null);
  });
});

/* ── 예약 여부 라벨 (순수) ────────────────────────────────────────────────────
 *
 * "예약 여부" 열은 오직 두 값만 낸다. 지시된 대응을 못박는다: RESERVED·CHECKED_IN·NO_SHOW 는
 * 예약, NONE·CANCELLED·부재는 미예약. 세부 상태를 이 열에 흘리지 않는 유일한 판정이다.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("studentReservationLabel — 예약/미예약 두 값뿐", () => {
  const of = (reservationStatus: AdminStudentReservation["reservationStatus"]) =>
    studentReservationLabel({ reservationStatus });

  it("RESERVED·CHECKED_IN·NO_SHOW 는 예약이다", () => {
    assert.equal(of("RESERVED"), "예약");
    assert.equal(of("CHECKED_IN"), "예약");
    assert.equal(of("NO_SHOW"), "예약");
  });

  it("NONE·CANCELLED 는 미예약이다", () => {
    assert.equal(of("NONE"), "미예약");
    assert.equal(of("CANCELLED"), "미예약");
  });

  it("필드 부재(현재 배포·미지정 회차)는 미예약으로 떨어진다", () => {
    assert.equal(of(undefined), "미예약");
    assert.equal(of(null), "미예약");
    assert.equal(studentReservationLabel({}), "미예약");
  });
});

/* ── 대표 담임 폴백 (순수, 레거시 경로) ───────────────────────────────────────
 *
 * representativeTeacher 는 canonical 이 없을 때 쓰는 레거시 폴백이다 — 대표 배정으로 지목된
 * 담임, 아니면 후보가 하나로 좁혀질 때만. 여기서는 폴백 자체의 규칙만 못박는다(수학 반 게이트는
 * resolveHomeroomTeacher 가 맡는다).
 * ──────────────────────────────────────────────────────────────────────────── */

describe("representativeTeacher — 레거시 폴백", () => {
  it("대표 배정 key 가 지목한 assignment 의 담임을 쓴다", () => {
    const s = student({
      representativeClass: { ...student().representativeClass, selectedSourceAssignmentKey: "key-2" },
      assignments: [
        assignment({ sourceAssignmentKey: "key-1", teacherName: "김일" }),
        assignment({ sourceAssignmentKey: "key-2", teacherName: "이이" }),
      ],
    });
    assert.equal(representativeTeacher(s), "이이");
  });

  it("지목이 없고 후보 담임이 하나면 그 담임이다", () => {
    const s = student({
      assignments: [
        assignment({ sourceAssignmentKey: "key-1", teacherName: "박유일" }),
        assignment({ sourceAssignmentKey: "key-2", teacherName: "박유일" }),
      ],
    });
    assert.equal(representativeTeacher(s), "박유일");
  });

  it("지목이 없고 후보 담임이 여럿이면 대표를 짓지 않는다(null)", () => {
    const s = student({
      assignments: [
        assignment({ sourceAssignmentKey: "key-1", teacherName: "김일" }),
        assignment({ sourceAssignmentKey: "key-2", teacherName: "이이" }),
      ],
    });
    assert.equal(representativeTeacher(s), null);
  });
});

/* ── 대표 담임 최종 정책 (순수) ───────────────────────────────────────────────
 *
 * resolveHomeroomTeacher 는 담임 열의 유일한 판정이다:
 *   1) 수학 반이 없으면(과학 전용) 최상위 canonical 이 있든 배정 담임이 몇이든 무조건 null,
 *   2) 수학 학생은 최상위 canonical teacherName 이 응답에 있으면(비 undefined) authoritative —
 *      비 null·비공백이면 그대로, null·공백이면 폴백 없이 null,
 *   3) teacherName 이 undefined(레거시 응답)일 때만 representativeTeacher 폴백.
 *
 * null·공백·undefined·최상위 문자열 네 경우를 각각 분리해 못박는다.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("resolveHomeroomTeacher — 최종 담임 정책", () => {
  it("수학 반 학생은 최상위 canonical teacherName 이 이긴다(폴백보다 우선)", () => {
    const s = student({
      teacherName: "정담임",
      representativeClass: { ...student().representativeClass, selectedSourceAssignmentKey: "key-1" },
      // 폴백이라면 '다른담임' 을 골랐을 배정이지만 canonical 이 이겨야 한다.
      assignments: [assignment({ sourceAssignmentKey: "key-1", teacherName: "다른담임" })],
    });
    assert.equal(resolveHomeroomTeacher(s), "정담임");
  });

  it("과학 전용(수학 반 null) + 배정 담임 1명이어도 첫 배정을 고르지 않고 — (null)", () => {
    const s = student({
      mathClassName: null,
      representativeClass: {
        resolution: "SCIENCE_ALIAS",
        displayName: "과학",
        ambiguous: false,
        regularCandidateCount: 0,
        scienceCandidateCount: 1,
        selectedSourceAssignmentKey: null,
      },
      scienceClassNames: ["과학 심화 A"],
      assignments: [assignment({ candidateType: "SCIENCE", teacherName: "박과학" })],
    });
    assert.equal(resolveHomeroomTeacher(s), null);
  });

  it("과학 전용(수학 반 null) + 배정 담임 여럿이어도 — (null)", () => {
    const s = student({
      mathClassName: null,
      representativeClass: {
        resolution: "SCIENCE_ALIAS",
        displayName: "과학",
        ambiguous: false,
        regularCandidateCount: 0,
        scienceCandidateCount: 2,
        selectedSourceAssignmentKey: null,
      },
      scienceClassNames: ["과학 A", "과학 B"],
      assignments: [
        assignment({ sourceAssignmentKey: "sci-1", candidateType: "SCIENCE", teacherName: "박과학" }),
        assignment({ sourceAssignmentKey: "sci-2", candidateType: "SCIENCE", teacherName: "최과학" }),
      ],
    });
    assert.equal(resolveHomeroomTeacher(s), null);
  });

  it("과학 전용은 최상위 canonical teacherName 이 있어도 승격하지 않고 — (null)", () => {
    const s = student({
      mathClassName: null,
      // 최상위 canonical 이 실려 있어도 과학 전용이면 담임을 짓지 않는다(수학 반 게이트가 이긴다).
      teacherName: "과학담임",
      representativeClass: {
        resolution: "SCIENCE_ALIAS",
        displayName: "과학",
        ambiguous: false,
        regularCandidateCount: 0,
        scienceCandidateCount: 1,
        selectedSourceAssignmentKey: null,
      },
      scienceClassNames: ["과학 심화 A"],
      assignments: [assignment({ candidateType: "SCIENCE", teacherName: "박과학" })],
    });
    assert.equal(resolveHomeroomTeacher(s), null);
  });

  it("회귀: 과학 전용 학번 2050929(강민진)은 배정 담임이 있어도 담임 없음 — (null)", () => {
    const s = student({
      studentId: "2050929",
      sourceStudentNo: "2050929",
      name: "강민진",
      mathClassName: null,
      representativeClass: {
        resolution: "SCIENCE_ALIAS",
        displayName: "과학",
        ambiguous: false,
        regularCandidateCount: 0,
        scienceCandidateCount: 2,
        selectedSourceAssignmentKey: null,
      },
      scienceClassNames: ["과학 심화 A", "과학 심화 B"],
      assignments: [
        assignment({ sourceAssignmentKey: "sci-1", sourceStudentNo: "2050929", candidateType: "SCIENCE", teacherName: "박과학" }),
        assignment({ sourceAssignmentKey: "sci-2", sourceStudentNo: "2050929", candidateType: "SCIENCE", teacherName: "최과학" }),
      ],
    });
    assert.equal(resolveHomeroomTeacher(s), null);
  });

  it("수학 학생은 canonical 이 undefined(레거시 응답)일 때만 유일 담임 폴백을 쓴다", () => {
    const s = student({
      assignments: [
        assignment({ sourceAssignmentKey: "key-1", teacherName: "박유일" }),
        assignment({ sourceAssignmentKey: "key-2", teacherName: "박유일" }),
      ],
    });
    assert.equal(s.teacherName, undefined);
    assert.equal(resolveHomeroomTeacher(s), "박유일");
  });

  it("수학 학생이라도 canonical 이 명시적 null 이면 확정 '담임 없음' — 폴백 없이 null", () => {
    const s = student({
      teacherName: null,
      // 폴백이라면 '박유일' 을 골랐을 유효한 대표 배정이 있어도 canonical null 이 이긴다.
      assignments: [assignment({ sourceAssignmentKey: "key-1", teacherName: "박유일" })],
      representativeClass: { ...student().representativeClass, selectedSourceAssignmentKey: "key-1" },
    });
    assert.equal(resolveHomeroomTeacher(s), null);
  });

  it("수학 학생이라도 canonical 이 공백뿐이면 확정 '담임 없음' — 폴백 없이 null", () => {
    const s = student({
      teacherName: "   ",
      // 공백 canonical 도 authoritative — 유효한 대표 배정이 있어도 폴백하지 않는다.
      assignments: [assignment({ sourceAssignmentKey: "key-1", teacherName: "박유일" })],
      representativeClass: { ...student().representativeClass, selectedSourceAssignmentKey: "key-1" },
    });
    assert.equal(resolveHomeroomTeacher(s), null);
  });
});

/* ── 분류 요약 4수 정규화 (순수) ──────────────────────────────────────────────
 *
 * resolveStudentSummaryCounts 는 신규 계약 필드를 우선하고, 없을 때만 각각 **1:1 로** 대응하는
 * 레거시 필드로 떨어진다 — 절대 두 값을 더하지 않는다. 각 폴백이 서로 독립인지 못박는다.
 * ──────────────────────────────────────────────────────────────────────────── */

/** 계약 StudentClassificationSummary 필수(레거시) 필드 전부. 신규 4필드는 오버라이드로만 얹는다. */
const summary = (overrides: Partial<StudentClassificationSummary> = {}): StudentClassificationSummary => ({
  uniqueStudentCount: 100,
  multiAssignmentStudentCount: 12,
  regularRepresentativeCount: 60,
  scienceAliasRepresentativeCount: 10,
  multipleRegularAmbiguousCount: 4,
  noClassAmbiguousCount: 5,
  ambiguousStudentCount: 9,
  mathRegularStudentCount: 70,
  scienceRegularStudentCount: 30,
  ...overrides,
});

describe("resolveStudentSummaryCounts — 신규 우선·레거시 1:1 폴백", () => {
  it("신규 4필드가 다 있으면 그걸 우선하고 레거시는 무시한다", () => {
    const counts = resolveStudentSummaryCounts(
      summary({
        eligibleUniqueStudentCount: 111,
        mathStudentCount: 77,
        scienceOnlyStudentCount: 33,
        reviewRequiredStudentCount: 5,
      }),
    );
    assert.deepEqual(counts, {
      eligibleUniqueStudentCount: 111,
      mathStudentCount: 77,
      scienceOnlyStudentCount: 33,
      reviewRequiredStudentCount: 5,
    });
  });

  it("신규 필드가 하나도 없으면(레거시 서버) 넷 다 대응 레거시로 폴백한다", () => {
    assert.deepEqual(resolveStudentSummaryCounts(summary()), {
      eligibleUniqueStudentCount: 100, // ← uniqueStudentCount
      mathStudentCount: 70, // ← mathRegularStudentCount
      scienceOnlyStudentCount: 30, // ← scienceRegularStudentCount
      reviewRequiredStudentCount: 9, // ← ambiguousStudentCount
    });
  });

  it("eligibleUnique 만 없으면 그 한 자리만 uniqueStudentCount 로 폴백(나머지는 신규)", () => {
    const counts = resolveStudentSummaryCounts(
      summary({ mathStudentCount: 77, scienceOnlyStudentCount: 33, reviewRequiredStudentCount: 5 }),
    );
    assert.equal(counts.eligibleUniqueStudentCount, 100);
    assert.equal(counts.mathStudentCount, 77);
    assert.equal(counts.scienceOnlyStudentCount, 33);
    assert.equal(counts.reviewRequiredStudentCount, 5);
  });

  it("mathStudentCount 만 없으면 그 한 자리만 mathRegularStudentCount 로 폴백", () => {
    const counts = resolveStudentSummaryCounts(
      summary({ eligibleUniqueStudentCount: 111, scienceOnlyStudentCount: 33, reviewRequiredStudentCount: 5 }),
    );
    assert.equal(counts.mathStudentCount, 70);
    assert.equal(counts.eligibleUniqueStudentCount, 111);
  });

  it("scienceOnlyStudentCount 만 없으면 그 한 자리만 scienceRegularStudentCount 로 폴백", () => {
    const counts = resolveStudentSummaryCounts(
      summary({ eligibleUniqueStudentCount: 111, mathStudentCount: 77, reviewRequiredStudentCount: 5 }),
    );
    assert.equal(counts.scienceOnlyStudentCount, 30);
  });

  it("reviewRequiredStudentCount 만 없으면 그 한 자리만 ambiguousStudentCount 로 폴백", () => {
    const counts = resolveStudentSummaryCounts(
      summary({ eligibleUniqueStudentCount: 111, mathStudentCount: 77, scienceOnlyStudentCount: 33 }),
    );
    assert.equal(counts.reviewRequiredStudentCount, 9);
  });

  it("신규 필드가 0 이면 0 을 그대로 쓴다(레거시로 폴백하지 않는다)", () => {
    const counts = resolveStudentSummaryCounts(
      summary({
        eligibleUniqueStudentCount: 0,
        mathStudentCount: 0,
        scienceOnlyStudentCount: 0,
        reviewRequiredStudentCount: 0,
      }),
    );
    assert.deepEqual(counts, {
      eligibleUniqueStudentCount: 0,
      mathStudentCount: 0,
      scienceOnlyStudentCount: 0,
      reviewRequiredStudentCount: 0,
    });
  });

  it("수학·과학을 더해 재원생을 만들지 않는다 — 세 수는 서로 독립이다", () => {
    // math(77)+scienceOnly(33)=110 ≠ eligibleUnique(90). 합산이면 90 이 될 수 없다.
    const counts = resolveStudentSummaryCounts(
      summary({ eligibleUniqueStudentCount: 90, mathStudentCount: 77, scienceOnlyStudentCount: 33, reviewRequiredStudentCount: 5 }),
    );
    assert.equal(counts.eligibleUniqueStudentCount, 90);
    assert.notEqual(counts.eligibleUniqueStudentCount, counts.mathStudentCount + counts.scienceOnlyStudentCount);
  });
});

/* ── 캠퍼스 접두 라벨 (순수) ──────────────────────────────────────────────────
 *
 * 요약은 캠퍼스(+단위) 범위라 라벨의 캠퍼스 접두가 곧 그 범위를 말한다. 전체(undefined)면 접두 없음.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("campusScopedLabel — 캠퍼스 접두", () => {
  it("캠퍼스가 선택되면 캠퍼스명을 앞세운다 (예: 송파 재원생)", () => {
    assert.equal(campusScopedLabel("SONGPA", "재원생"), "송파 재원생");
    assert.equal(campusScopedLabel("WIRYE", "확인 필요"), "위례 확인 필요");
    assert.equal(campusScopedLabel("GWANGJIN", "수학 정규반"), "광진 수학 정규반");
  });

  it("전체(undefined)면 접두사 없이 라벨 그대로", () => {
    assert.equal(campusScopedLabel(undefined, "과학 정규반"), "과학 정규반");
  });
});

/* ── 확인 필요 사유 라벨 (순수) ───────────────────────────────────────────────
 *
 * 서버는 코드만 준다 — 화면은 고정 한글 라벨로 그리고, 계약에 없던 미래 코드는 안전 라벨로
 * 떨어뜨려 절대 undefined 를 보이지 않는다.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("reviewReasonLabel — 알려진 enum 라벨 · 미지 코드 안전 폴백", () => {
  it("계약의 알려진 코드는 각각 고정 한글 라벨이다", () => {
    assert.equal(reviewReasonLabel("MULTIPLE_MATH_CLASS"), "수학 정규반 중복");
    assert.equal(reviewReasonLabel("NO_RECOGNIZABLE_CLASS"), "인식 가능한 반 없음");
    assert.equal(reviewReasonLabel("UNIT_UNRESOLVED"), "단위 미확정");
    assert.equal(reviewReasonLabel("ABNORMAL_OR_EMPTY_CLASS"), "반명 비정상·누락");
  });

  it("알 수 없는 미래 코드는 안전 라벨로 떨어지고 절대 undefined 가 아니다", () => {
    assert.equal(reviewReasonLabel("SOME_FUTURE_CODE"), REVIEW_REASON_FALLBACK_LABEL);
    assert.equal(reviewReasonLabel(""), REVIEW_REASON_FALLBACK_LABEL);
    assert.notEqual(reviewReasonLabel("SOME_FUTURE_CODE"), undefined);
  });
});

/* ── 원천 반명 · 페이지 정규화 (순수) ─────────────────────────────────────────
 *
 * rawClassNames(신규) 우선 → rawRepresentativeClassNames(레거시) → originalClassName(비공백).
 * 총원은 언제나 page.totalItems 다 — 첫 페이지 items 길이가 아니다.
 * ──────────────────────────────────────────────────────────────────────────── */

/** 계약 AdminStudentReviewRequired 필수 필드 전부(현재 서버 모양: rawRepresentativeClassNames). */
const reviewRaw = (overrides: Record<string, unknown> = {}) => ({
  studentId: "s1",
  sourceStudentNo: "S001",
  branch: "SONGPA",
  name: "김확인",
  originalClassName: "중3 A",
  mathClassName: null,
  scienceClassNames: [],
  reasonCodes: ["MULTIPLE_MATH_CLASS"],
  rawRepresentativeClassNames: ["중3 A", "중3 B"],
  ...overrides,
});

describe("normalizeReviewRawClassNames — 우선순위", () => {
  it("rawClassNames(신규)가 배열이면 authoritative — rawRepresentative 를 무시한다", () => {
    assert.deepEqual(
      normalizeReviewRawClassNames({ rawClassNames: ["A"], rawRepresentativeClassNames: ["B"], originalClassName: "C" }),
      ["A"],
    );
  });

  it("rawClassNames 가 빈 배열이어도 authoritative(레거시로 폴백하지 않는다)", () => {
    assert.deepEqual(
      normalizeReviewRawClassNames({ rawClassNames: [], rawRepresentativeClassNames: ["B"], originalClassName: "C" }),
      [],
    );
  });

  it("rawClassNames 가 없으면 rawRepresentativeClassNames(레거시 폴백)", () => {
    assert.deepEqual(
      normalizeReviewRawClassNames({ rawRepresentativeClassNames: ["B1", "B2"], originalClassName: "C" }),
      ["B1", "B2"],
    );
  });

  it("둘 다 없으면 originalClassName(비공백) 한 개, 공백·부재면 빈 배열", () => {
    assert.deepEqual(normalizeReviewRawClassNames({ originalClassName: "중3 A" }), ["중3 A"]);
    assert.deepEqual(normalizeReviewRawClassNames({ originalClassName: "   " }), []);
    assert.deepEqual(normalizeReviewRawClassNames({}), []);
  });
});

describe("normalizeReviewRequiredItem — 좁은 UI 모델", () => {
  it("reasonCodes 는 코드 그대로, rawClassNames 는 정규화, 나머지는 그대로 실어 온다", () => {
    const item = normalizeReviewRequiredItem(
      reviewRaw({
        reasonCodes: ["UNIT_UNRESOLVED", "NO_RECOGNIZABLE_CLASS"],
        rawRepresentativeClassNames: ["중3 A"],
        mathClassName: "중3 수학",
        scienceClassNames: ["과학 A", "과학 B"],
      }),
    );
    assert.ok(item !== null);
    assert.deepEqual(item.reasonCodes, ["UNIT_UNRESOLVED", "NO_RECOGNIZABLE_CLASS"]);
    assert.deepEqual(item.rawClassNames, ["중3 A"]);
    assert.equal(item.mathClassName, "중3 수학");
    assert.deepEqual(item.scienceClassNames, ["과학 A", "과학 B"]);
    assert.equal(item.branch, "SONGPA");
    assert.equal(item.sourceStudentNo, "S001");
  });

  it("studentId 가 없으면 버린다(중복 제거 키가 없다)", () => {
    assert.equal(normalizeReviewRequiredItem({ name: "무명" }), null);
    assert.equal(normalizeReviewRequiredItem(null), null);
  });
});

describe("normalizeReviewRequiredPage — 총원은 page.totalItems", () => {
  it("총원은 page.totalItems 를 읽는다(섞여 온 레거시 totalCount 는 무시)", () => {
    const result = normalizeReviewRequiredPage({
      items: [reviewRaw()],
      page: { page: 1, pageSize: 200, totalItems: 47, totalPages: 1 },
      totalCount: 999,
    });
    assert.equal(result.totalItems, 47);
    assert.equal(result.totalPages, 1);
    assert.equal(result.items.length, 1);
  });

  it("첫 페이지 items 길이를 총원으로 착각하지 않는다", () => {
    const result = normalizeReviewRequiredPage({
      items: [reviewRaw({ studentId: "a" }), reviewRaw({ studentId: "b" })],
      page: { page: 1, pageSize: 200, totalItems: 250, totalPages: 2 },
    });
    assert.equal(result.totalItems, 250);
    assert.notEqual(result.totalItems, result.items.length);
  });
});

/* ── 요청 인코딩 · 확인 필요 폴백 ─────────────────────────────────────────────
 *
 * 진짜 서버 없이 fetch 만 가짜로 세운다. 두 가지를 지킨다:
 *   1. seminarSessionId 가 목록 요청에 그대로 실리는가.
 *   2. review-required 가 미배포(404 등)일 때 빈 목록으로 떨어지고, 진짜 오류는 올라오는가.
 * ──────────────────────────────────────────────────────────────────────────── */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** URL 을 붙잡고, 지정한 상태/본문으로 응답하는 가짜 fetch. */
function stubFetch(status: number, body: unknown): { urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : input.toString());
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { urls };
}

/**
 * `page` 쿼리별로 다른 응답을 주는 가짜 fetch — 다중 페이지 수집·중복 제거를 검증한다.
 * 각 요청이 받은 URL 과 signal 을 기록한다(같은 AbortSignal 이 모든 페이지에 걸리는지 확인).
 */
function stubFetchByPage(byPage: Record<string, { status?: number; body: unknown }>): {
  urls: string[];
  signals: Array<AbortSignal | null | undefined>;
} {
  const urls: string[] = [];
  const signals: Array<AbortSignal | null | undefined> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input.toString();
    urls.push(raw);
    signals.push(init?.signal);
    const page = new URL(raw, "https://example.test").searchParams.get("page") ?? "1";
    const entry = byPage[page] ?? { status: 200, body: { items: [], page: { page: Number(page), pageSize: 200, totalItems: 0, totalPages: 0 } } };
    return new Response(entry.body === undefined ? null : JSON.stringify(entry.body), {
      status: entry.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { urls, signals };
}

/** review-required 한 페이지 응답 본문 — page 메타를 명시적으로 실어 준다. */
function reviewPageBody(items: unknown[], page: number, totalItems: number, totalPages: number) {
  return { items, page: { page, pageSize: 200, totalItems, totalPages } };
}

describe("listAdminStudents — seminarSessionId 인코딩", () => {
  it("회차를 함께 보내면 쿼리에 그대로 싣는다 (명단 범위는 그대로)", async () => {
    const captured = stubFetch(200, {
      items: [],
      page: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      summary: {},
      latestSuccessfulSyncAt: null,
      facets: { teachers: [] },
    });

    await listAdminStudents({ branch: "SONGPA", sourceActive: true, seminarSessionId: "sess-1", page: 1, pageSize: 10 });

    const url = new URL(captured.urls[0]!, "https://example.test");
    assert.equal(url.pathname, "/api/v1/admin/students");
    assert.equal(url.searchParams.get("seminarSessionId"), "sess-1");
    assert.equal(url.searchParams.get("branch"), "SONGPA");
    assert.equal(url.searchParams.get("sourceActive"), "true");
  });

  it("회차를 안 보내면 seminarSessionId 는 아예 싣지 않는다", async () => {
    const captured = stubFetch(200, {
      items: [],
      page: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      summary: {},
      latestSuccessfulSyncAt: null,
      facets: { teachers: [] },
    });

    await listAdminStudents({ sourceActive: true, page: 1, pageSize: 10 });

    const url = new URL(captured.urls[0]!, "https://example.test");
    assert.equal(url.searchParams.has("seminarSessionId"), false);
  });
});

/* ── canonical teacherName 보존 (어댑터) ──────────────────────────────────────
 *
 * 어댑터는 최상위 canonical `teacherName` 을 items 에 **그대로** 실어 와야 한다 — 비 null 이든
 * null(담임 없음)이든 보존하고, 아예 없는 레거시 응답(undefined)도 깨지지 않아야 한다.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("listAdminStudents — canonical teacherName 보존", () => {
  const pageWith = (items: unknown[]) => ({
    items,
    page: { page: 1, pageSize: 10, totalItems: items.length, totalPages: 1 },
    summary: {},
    latestSuccessfulSyncAt: null,
    facets: { teachers: [] },
  });

  it("최상위 teacherName(비 null)을 items 에 그대로 실어 온다", async () => {
    stubFetch(200, pageWith([student({ teacherName: "김수학" })]));
    const page = await listAdminStudents({ sourceActive: true });
    assert.equal(page.items[0]!.teacherName, "김수학");
  });

  it("teacherName: null 도 담임 없음으로 그대로 보존한다", async () => {
    stubFetch(200, pageWith([student({ teacherName: null })]));
    const page = await listAdminStudents({ sourceActive: true });
    assert.equal(page.items[0]!.teacherName, null);
  });

  it("teacherName 이 없는 레거시 응답도 깨지지 않는다(undefined)", async () => {
    stubFetch(200, pageWith([student()]));
    const page = await listAdminStudents({ sourceActive: true });
    assert.equal(page.items[0]!.teacherName, undefined);
  });

  it("한 응답에서 생략(undefined)과 명시적 null 을 각각 그대로 둔다 — 함께 뭉개지 않는다", async () => {
    stubFetch(200, pageWith([
      student({ studentId: "omitted" }), // teacherName 생략 → 키 자체가 없다
      student({ studentId: "explicit", teacherName: null }), // 명시적 null → 키가 있고 값이 null
    ]));
    const page = await listAdminStudents({ sourceActive: true });
    // 생략은 undefined, 명시적 null 은 null 로 구별돼야 한다(둘을 같은 값으로 정규화하지 않는다).
    assert.equal(page.items[0]!.teacherName, undefined);
    assert.equal(page.items[1]!.teacherName, null);
    assert.equal("teacherName" in page.items[0]!, false);
    assert.equal("teacherName" in page.items[1]!, true);
  });
});

describe("listReviewRequiredStudents — 실제 계약(페이지네이션·중복 제거·폴백)", () => {
  it("branch·page·pageSize=200 을 싣고 단위 필터는 지어내지 않는다", async () => {
    const captured = stubFetchByPage({ "1": { body: reviewPageBody([], 1, 0, 0) } });

    await listReviewRequiredStudents({ branch: "WIRYE" });

    const url = new URL(captured.urls[0]!, "https://example.test");
    assert.equal(url.pathname, "/api/v1/admin/students/review-required");
    assert.equal(url.searchParams.get("branch"), "WIRYE");
    assert.equal(url.searchParams.get("pageSize"), "200");
    assert.equal(url.searchParams.get("page"), "1");
    // 엔드포인트는 단위 범위를 받지 않는다 — 클라이언트가 unit/unitGroup 을 지어내 보내지 않는다.
    assert.equal(url.searchParams.has("unit"), false);
    assert.equal(url.searchParams.has("unitGroup"), false);
  });

  it("단일 페이지(totalPages<=1)면 두 번째 요청을 하지 않는다", async () => {
    const captured = stubFetchByPage({ "1": { body: reviewPageBody([reviewRaw()], 1, 1, 1) } });

    const result = await listReviewRequiredStudents({ branch: "SONGPA" });
    assert.equal(captured.urls.length, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]!.name, "김확인");
    assert.equal(result.totalCount, 1);
  });

  it("totalPages>1 이면 모든 페이지를 모아 studentId 로 중복 제거하고 등장 순서를 지킨다", async () => {
    const captured = stubFetchByPage({
      "1": { body: reviewPageBody([reviewRaw({ studentId: "a" }), reviewRaw({ studentId: "b" })], 1, 3, 2) },
      "2": { body: reviewPageBody([reviewRaw({ studentId: "b" }), reviewRaw({ studentId: "c" })], 2, 3, 2) },
    });

    const result = await listReviewRequiredStudents({ branch: "SONGPA" });

    // 두 페이지를 모두 부른다.
    const pages = captured.urls.map((u) => new URL(u, "https://example.test").searchParams.get("page")).sort();
    assert.deepEqual(pages, ["1", "2"]);
    // b 는 한 번만, 순서는 첫 등장 기준 a,b,c.
    assert.deepEqual(result.items.map((s) => s.studentId), ["a", "b", "c"]);
  });

  it("총원은 page.totalItems 다 — 첫 페이지 items 길이(200)로 착각하지 않는다", async () => {
    const first = Array.from({ length: 200 }, (_, index) => reviewRaw({ studentId: `s${index}` }));
    const second = Array.from({ length: 150 }, (_, index) => reviewRaw({ studentId: `t${index}` }));
    const captured = stubFetchByPage({
      "1": { body: reviewPageBody(first, 1, 350, 2) },
      "2": { body: reviewPageBody(second, 2, 350, 2) },
    });

    const result = await listReviewRequiredStudents({ branch: "SONGPA" });
    assert.equal(result.totalCount, 350);
    assert.equal(result.items.length, 350);
    assert.equal(captured.urls.length, 2);
  });

  it("AbortSignal 은 모든 페이지 요청에 그대로 전달된다", async () => {
    const captured = stubFetchByPage({
      "1": { body: reviewPageBody([reviewRaw({ studentId: "a" })], 1, 2, 2) },
      "2": { body: reviewPageBody([reviewRaw({ studentId: "b" })], 2, 2, 2) },
    });
    const controller = new AbortController();

    await listReviewRequiredStudents({ branch: "SONGPA" }, controller.signal);

    assert.equal(captured.signals.length, 2);
    for (const signal of captured.signals) assert.equal(signal, controller.signal);
  });

  it("엔드포인트가 아직 없으면(첫 페이지 404) 빈 목록으로 떨어진다 — 절대 던지지 않는다", async () => {
    stubFetch(404, { type: "about:blank", title: "Not Found", status: 404, code: "NOT_FOUND" });

    const result = await listReviewRequiredStudents({ branch: "GWANGJIN" });
    assert.deepEqual(result, { items: [], totalCount: 0 });
  });

  it("405·501 도 미배포로 보고 빈 목록으로 떨어진다", async () => {
    stubFetch(501, undefined);
    assert.deepEqual(await listReviewRequiredStudents(), { items: [], totalCount: 0 });

    stubFetch(405, undefined);
    assert.deepEqual(await listReviewRequiredStudents(), { items: [], totalCount: 0 });
  });

  it("형태가 깨진 응답도 빈 목록으로 좁혀 화면을 지킨다", async () => {
    stubFetch(200, { items: "not-an-array" });
    assert.deepEqual(await listReviewRequiredStudents(), { items: [], totalCount: 0 });
  });

  it("진짜 서버 오류(5xx)는 삼키지 않고 올린다 — 훅이 부드럽게 표시·재시도한다", async () => {
    stubFetch(500, { type: "about:blank", title: "Server Error", status: 500, code: "INTERNAL" });
    await assert.rejects(listReviewRequiredStudents({ branch: "SONGPA" }));
  });
});
