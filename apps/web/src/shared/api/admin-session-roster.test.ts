/**
 * 회차 예약 명단 어댑터 테스트 (node:test + tsx).
 *
 * 여기서 지키려는 것은 두 가지다:
 *   1. 요청이 계약 그대로 나가는가 (fetch 를 가짜로 세워 URL 만 본다 — 진짜 서버는 없다).
 *   2. 상태 파생이 **서버 상태에서만** 나오는가 (나머지는 전부 순수 함수다).
 *
 * 픽스처는 계약(openapi.yaml SessionRoster*)의 필수 필드를 전부 채운 실제 응답 모양이다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  cancelledFamilyRebookStudentIds,
  enrolledBookingCandidates,
  exportAdminSessionRosterXlsx,
  listAdminSessionRoster,
  mergeRosterEventLineage,
  parseRosterUnitGroup,
  ROSTER_BOOKING_LABELS,
  ROSTER_UNIT_TABS,
  rosterBookingActionOf,
  rosterBookingControl,
  rosterContactChoices,
  rosterEventLabel,
  rosterGuestRebookPrefill,
  rosterHasActiveBooking,
  rosterHistoryTargets,
  rosterUnitGroupLabel,
  rosterXlsxFilename,
  safeRosterXlsxFilename,
  showsBranchColumn,
} from "./admin-session-roster";
import type {
  AttendanceParty,
  Branch,
  FamilyBooking,
  FamilyBookingStatus,
  FamilyBookingStudentSnapshot,
  SessionRosterBookingHistoryReference,
  SessionRosterPage,
  SessionRosterRow,
} from "./contract";

/* ── 픽스처 ──────────────────────────────────────────────────────────────── */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const OLD_BOOKING_ID = "33333333-3333-4333-8333-333333333333";

/** 계약 SessionRosterRow 필수 필드 전부 — 기본은 "예약 없는 재원생". */
const row = (overrides: Partial<SessionRosterRow> = {}): SessionRosterRow => ({
  rosterEntryId: "44444444-4444-4444-8444-444444444444",
  participantType: "ENROLLED",
  studentId: "55555555-5555-4555-8555-555555555555",
  familyBookingStudentId: null,
  sourceStudentNo: "S-1001",
  name: "김수민",
  branch: "CAMPUS_A",
  representativeClassName: "중3 A반",
  mathClassName: "중등3 심화A",
  scienceClassNames: ["과학 목3", "과학 토2"],
  schoolName: "잠실중",
  grade: "중3",
  unitName: "중등3",
  primaryTeacher: "박선생",
  motherPhone: "01012345678",
  fatherPhone: "01087654321",
  guestContact: null,
  booking: null,
  latestOperationalEvent: null,
  bookingHistory: [],
  ...overrides,
});

const booking = (
  status: FamilyBookingStatus,
  attendanceParty: AttendanceParty = "MOTHER",
): SessionRosterRow["booking"] => ({
  familyBookingId: BOOKING_ID,
  familyBookingStudentId: "66666666-6666-4666-8666-666666666666",
  status,
  attendanceParty,
  bookingSource: "WEB_APP",
  seatCount: attendanceParty === "BOTH" ? 2 : 1,
  checkedInAt: status === "CHECKED_IN" ? "2026-07-17T05:00:00.000Z" : null,
  cancelledAt: status === "CANCELLED" ? "2026-07-16T05:00:00.000Z" : null,
  version: 3,
});

const historyRef = (
  overrides: Partial<SessionRosterBookingHistoryReference> = {},
): SessionRosterBookingHistoryReference => ({
  familyBookingId: BOOKING_ID,
  status: "RESERVED",
  current: true,
  eventsPath: `/api/v1/admin/family-bookings/${BOOKING_ID}/events`,
  createdAt: "2026-07-15T02:00:00.000Z",
  cancelledAt: null,
  ...overrides,
});

const emptyPage: SessionRosterPage = {
  items: [],
  page: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
  facets: { teachers: [], unmatchedUnitCount: 0 },
};

/* ── 요청 인코딩 ─────────────────────────────────────────────────────────── */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** 실제 네트워크 대신 URL 만 붙잡는다. */
function captureUrl(): { urls: string[] } {
  const captured: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    captured.push(typeof input === "string" ? input : input.toString());
    return new Response(JSON.stringify(emptyPage), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { urls: captured };
}

describe("listAdminSessionRoster 질의 인코딩", () => {
  it("계약 경로와 파라미터 그대로 보낸다", async () => {
    const captured = captureUrl();

    await listAdminSessionRoster(SESSION_ID, {
      branch: "CAMPUS_B",
      unitGroup: "SPECIAL_PURPOSE",
      teacherName: "박선생",
      query: "김수민",
      page: 2,
      pageSize: 50,
    });

    const url = new URL(captured.urls[0]!, "https://example.test");
    assert.equal(url.pathname, `/api/v1/admin/seminar-sessions/${SESSION_ID}/roster`);
    assert.equal(url.searchParams.get("branch"), "CAMPUS_B");
    assert.equal(url.searchParams.get("unitGroup"), "SPECIAL_PURPOSE");
    assert.equal(url.searchParams.get("teacherName"), "박선생");
    assert.equal(url.searchParams.get("query"), "김수민");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("pageSize"), "50");
  });

  it("빈 필터는 아예 싣지 않는다 — ALL 은 서버 기본값이다", async () => {
    const captured = captureUrl();

    await listAdminSessionRoster(SESSION_ID, { unitGroup: "ALL", page: 1, pageSize: 50 });

    const url = new URL(captured.urls[0]!, "https://example.test");
    assert.equal(url.searchParams.has("unitGroup"), false);
    assert.equal(url.searchParams.has("branch"), false);
    assert.equal(url.searchParams.has("teacherName"), false);
    assert.equal(url.searchParams.has("query"), false);
  });

  it("회차 id 를 경로에 이스케이프해 넣는다", async () => {
    const captured = captureUrl();

    await listAdminSessionRoster("a b/c", {});

    assert.ok(captured.urls[0]!.includes("/roster"));
    assert.ok(captured.urls[0]!.includes("a%20b%2Fc"));
  });
});

/* ── XLSX 내보내기 ──────────────────────────────────────────────────────── */

/** 실제 네트워크 대신 XLSX 바이너리와 Content-Disposition 을 흉내낸다. */
function serveXlsx(contentDisposition: string | null): { urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : input.toString());
    const headers: Record<string, string> = {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    if (contentDisposition !== null) headers["content-disposition"] = contentDisposition;
    // XLSX 시그니처(PK\x03\x04) 4바이트 — 내용은 중요치 않고 Blob 로 오는지만 본다.
    return new Response(new Blob([new Uint8Array([80, 75, 3, 4])]), { status: 200, headers });
  }) as typeof fetch;
  return { urls };
}

describe("exportAdminSessionRosterXlsx — 지금 필터 그대로의 전체 명단", () => {
  it("계약 .xlsx 경로와 필터만 보낸다 — 페이지 파라미터는 없다", async () => {
    const captured = serveXlsx('attachment; filename="seminar-roster.xlsx"');

    await exportAdminSessionRosterXlsx(SESSION_ID, {
      branch: "CAMPUS_B",
      unitGroup: "MIDDLE_3",
      teacherName: "박선생",
      query: "김수민",
    });

    const url = new URL(captured.urls[0]!, "https://example.test");
    assert.equal(url.pathname, `/api/v1/admin/seminar-sessions/${SESSION_ID}/roster.xlsx`);
    assert.equal(url.searchParams.get("branch"), "CAMPUS_B");
    assert.equal(url.searchParams.get("unitGroup"), "MIDDLE_3");
    assert.equal(url.searchParams.get("teacherName"), "박선생");
    assert.equal(url.searchParams.get("query"), "김수민");
    // 목록과 달리 전체를 뽑으므로 페이지 파라미터를 보내지 않는다.
    assert.equal(url.searchParams.has("page"), false);
    assert.equal(url.searchParams.has("pageSize"), false);
  });

  it("ALL 단위는 싣지 않는다 — 목록과 같은 규칙", async () => {
    const captured = serveXlsx(null);
    await exportAdminSessionRosterXlsx(SESSION_ID, { unitGroup: "ALL" });
    const url = new URL(captured.urls[0]!, "https://example.test");
    assert.equal(url.searchParams.has("unitGroup"), false);
  });

  it("안전한 Content-Disposition 파일명을 그대로 쓴다 (RFC5987 우선, 한글 디코딩)", async () => {
    serveXlsx("attachment; filename=\"fallback.xlsx\"; filename*=UTF-8''%EB%AA%85%EB%8B%A8.xlsx");
    const result = await exportAdminSessionRosterXlsx(SESSION_ID, {});
    assert.equal(result.filename, "명단.xlsx");
    assert.ok(result.blob instanceof Blob);
    assert.equal(result.blob.size, 4);
  });

  it("서버 파일명이 없거나 안전하지 않으면 결정적 이름으로 떨어진다", async () => {
    serveXlsx(null);
    const noHeader = await exportAdminSessionRosterXlsx(SESSION_ID, {});
    assert.equal(noHeader.filename, `seminar-roster-${SESSION_ID}.xlsx`);

    serveXlsx('attachment; filename="../evil.xlsx"');
    const unsafe = await exportAdminSessionRosterXlsx(SESSION_ID, {});
    assert.equal(unsafe.filename, `seminar-roster-${SESSION_ID}.xlsx`);
  });
});

describe("XLSX 파일명 안전 판정", () => {
  it("경로 분리자·상위 경로·제어문자·잘못된 확장자는 거르고, 하이픈·공백·한글은 허용한다", () => {
    assert.equal(safeRosterXlsxFilename("seminar-roster.xlsx"), "seminar-roster.xlsx");
    assert.equal(safeRosterXlsxFilename("명단 2026.xlsx"), "명단 2026.xlsx");
    assert.equal(safeRosterXlsxFilename("a/b.xlsx"), null);
    assert.equal(safeRosterXlsxFilename("a\\b.xlsx"), null);
    assert.equal(safeRosterXlsxFilename("../x.xlsx"), null);
    assert.equal(safeRosterXlsxFilename(".hidden.xlsx"), null);
    assert.equal(safeRosterXlsxFilename("plain.csv"), null);
    assert.equal(safeRosterXlsxFilename("bad\ttab.xlsx"), null);
    assert.equal(safeRosterXlsxFilename("bad\nline.xlsx"), null);
    assert.equal(safeRosterXlsxFilename(null), null);
    assert.equal(safeRosterXlsxFilename("   "), null);
  });

  it("결정적 대체 이름은 회차 id 를 파일명 안전 문자로 좁힌다", () => {
    assert.equal(rosterXlsxFilename(SESSION_ID), `seminar-roster-${SESSION_ID}.xlsx`);
    assert.equal(rosterXlsxFilename("a b/c"), "seminar-roster-abc.xlsx");
    assert.equal(rosterXlsxFilename(""), "seminar-roster-session.xlsx");
  });
});

/* ── 단위 탭 · 분원 열 ───────────────────────────────────────────────────── */

describe("단위 탭 대응", () => {
  it("탭 문구와 계약 값이 지시된 순서 그대로다", () => {
    assert.deepEqual(
      ROSTER_UNIT_TABS.map((tab) => tab.label),
      ["전체", "초등", "중1", "중2", "중3", "특목", "고등", "과학", "비재원생"],
    );
    assert.deepEqual(
      ROSTER_UNIT_TABS.map((tab) => tab.value),
      ["ALL", "ELEMENTARY", "MIDDLE_1", "MIDDLE_2", "MIDDLE_3", "SPECIAL_PURPOSE", "HIGH", "SCIENCE", "GUEST"],
    );
  });

  it("URL 값은 계약 enum 일 때만 받는다", () => {
    assert.equal(parseRosterUnitGroup("MIDDLE_2"), "MIDDLE_2");
    assert.equal(parseRosterUnitGroup("GUEST"), "GUEST");
    assert.equal(parseRosterUnitGroup("중2"), "ALL");
    assert.equal(parseRosterUnitGroup("ELEMENTARY_SCHOOL"), "ALL");
    assert.equal(parseRosterUnitGroup(null), "ALL");
  });
});

describe("단위 그룹 라벨 — 서버 unitName 에서만 낸다", () => {
  it("정규 단위명을 화면 라벨로 접는다", () => {
    assert.equal(rosterUnitGroupLabel("초등"), "초등");
    assert.equal(rosterUnitGroupLabel("중등1"), "중1");
    assert.equal(rosterUnitGroupLabel("중등2"), "중2");
    assert.equal(rosterUnitGroupLabel("중등3"), "중3");
    assert.equal(rosterUnitGroupLabel("고등"), "고등");
    assert.equal(rosterUnitGroupLabel("과학"), "과학");
  });

  it("특목·예중1·예고1 은 한 그룹(특목)으로 접힌다", () => {
    assert.equal(rosterUnitGroupLabel("특목"), "특목");
    assert.equal(rosterUnitGroupLabel("예중1"), "특목");
    assert.equal(rosterUnitGroupLabel("예고1"), "특목");
  });

  it("null·모르는 값은 지어내지 않고 — 로 떨어뜨린다", () => {
    assert.equal(rosterUnitGroupLabel(null), "—");
    assert.equal(rosterUnitGroupLabel("중3"), "—"); // raw 학년 문자열은 단위명이 아니다
    assert.equal(rosterUnitGroupLabel("중3 A반"), "—"); // 반명도 아니다
    assert.equal(rosterUnitGroupLabel(""), "—");
  });
});

describe("분원 열 노출", () => {
  it("전체일 때만 보인다", () => {
    assert.equal(showsBranchColumn(undefined), true);
    assert.equal(showsBranchColumn("CAMPUS_A"), false);
    assert.equal(showsBranchColumn("CAMPUS_B"), false);
    assert.equal(showsBranchColumn("CAMPUS_C"), false);
  });
});

/* ── 예약 칸 상태 ───────────────────────────────────────────────────────── */

const labelsOf = (control: ReturnType<typeof rosterBookingControl>) => control.options.map((o) => o.label);
const selected = (control: ReturnType<typeof rosterBookingControl>) =>
  control.options.find((o) => o.value === control.value)?.label ?? control.readOnlyLabel;

describe("예약 칸 상태 파생", () => {
  it("예약 없는 재원생은 `-` 와 참석 세 갈래와 수동 예약을 모두 연다", () => {
    const control = rosterBookingControl(row());

    assert.equal(selected(control), ROSTER_BOOKING_LABELS.none);
    assert.deepEqual(labelsOf(control), ["-", "예약 (모)", "예약 (부)", "예약 (모/부)", "수동 예약"]);
    assert.equal(control.readOnly, false);
  });

  it("예약 없는 행의 참석 선택은 PATCH 가 아니다 — 바꿀 활성 집계가 없다", () => {
    // 이 술어가 곧 "드랍다운이 API 를 부르는가, 대화상자를 여는가"의 갈림길이다.
    assert.equal(rosterHasActiveBooking(row()), false);
    assert.equal(rosterHasActiveBooking(row({ booking: booking("CANCELLED") })), false);
    assert.equal(rosterHasActiveBooking(row({ booking: booking("CHECKED_IN") })), false);
    assert.equal(rosterHasActiveBooking(row({ booking: booking("NO_SHOW") })), false);
    assert.equal(rosterHasActiveBooking(row({ booking: booking("RESERVED") })), true);
  });

  it("RESERVED 는 참석 학부모 변경과 취소만 — 수동 예약은 참석 종류가 아니다", () => {
    const control = rosterBookingControl(row({ booking: booking("RESERVED", "FATHER") }));

    assert.equal(selected(control), "예약 (부)");
    assert.deepEqual(labelsOf(control), ["예약 (모)", "예약 (부)", "예약 (모/부)", "예약취소"]);
    assert.equal(labelsOf(control).includes("수동 예약"), false);
    assert.equal(control.readOnly, false);
  });

  it("BOTH 는 `예약 (모/부)` 로 보인다", () => {
    assert.equal(selected(rosterBookingControl(row({ booking: booking("RESERVED", "BOTH") }))), "예약 (모/부)");
  });

  it("CHECKED_IN 은 `입장 완료` 이고 어떤 변경도 열지 않는다", () => {
    const control = rosterBookingControl(row({ booking: booking("CHECKED_IN") }));

    assert.equal(control.readOnly, true);
    assert.equal(control.readOnlyLabel, ROSTER_BOOKING_LABELS.checkedIn);
    assert.deepEqual(control.options, []);
    // 서버가 막을 전이를 화면에서 만들어 낼 방법 자체가 없어야 한다.
    assert.equal(rosterBookingActionOf(control, "cancel"), null);
    assert.equal(rosterBookingActionOf(control, "party:BOTH"), null);
  });

  it("NO_SHOW 도 변경을 열지 않는다", () => {
    const control = rosterBookingControl(row({ booking: booking("NO_SHOW") }));

    assert.equal(control.readOnly, true);
    assert.deepEqual(control.options, []);
  });

  it("취소된 재원생은 지금 값과 참석 세 갈래와 수동 예약을 연다 — 되살리기는 없다", () => {
    const control = rosterBookingControl(row({ booking: booking("CANCELLED") }));

    assert.equal(selected(control), ROSTER_BOOKING_LABELS.cancel);
    assert.equal(control.cancelled, true);
    assert.deepEqual(labelsOf(control), ["예약취소", "예약 (모)", "예약 (부)", "예약 (모/부)", "수동 예약"]);
    assert.deepEqual(rosterBookingActionOf(control, "manual"), { kind: "manual" });
    // 참석을 골라도 옛 집계를 되살리는 조작은 없다 — 새 집계를 만드는 대화상자로 간다.
    assert.equal(rosterHasActiveBooking(row({ booking: booking("CANCELLED") })), false);
  });

  it("취소된 비재원생도 행의 값으로 새 집계를 세울 수 있으면 다시 예약한다", () => {
    const control = rosterBookingControl(
      row({ participantType: "GUEST", motherPhone: null, fatherPhone: null, guestContact: "01011112222", booking: booking("CANCELLED") }),
    );

    assert.equal(control.readOnly, false);
    assert.equal(control.blockedReason, null);
    assert.deepEqual(labelsOf(control), ["예약취소", "예약 (모)", "예약 (부)", "예약 (모/부)", "수동 예약"]);
  });

  it("취소된 비재원생에 연락처가 없으면 영구 읽기 전용이 아니라 막힌 이유를 말한다", () => {
    const control = rosterBookingControl(
      row({ participantType: "GUEST", motherPhone: null, fatherPhone: null, guestContact: null, booking: booking("CANCELLED") }),
    );

    assert.equal(control.readOnly, true);
    assert.deepEqual(control.options, []);
    // 값을 지어내 보내는 대신 왜 못 하는지 말한다.
    assert.ok(control.blockedReason !== null && control.blockedReason.includes("연락처"));
  });

  it("예약 없는 비재원생 행은 지어내지 않는다 — 서버가 주지 않는 모양이다", () => {
    const noBooking = rosterBookingControl(row({ participantType: "GUEST", booking: null }));
    assert.equal(noBooking.readOnly, true);
    assert.equal(noBooking.readOnlyLabel, ROSTER_BOOKING_LABELS.none);
    assert.equal(noBooking.blockedReason, null);
  });

  it("비재원생 RESERVED 는 재원생과 똑같이 가족 예약을 다룰 수 있다", () => {
    const control = rosterBookingControl(row({ participantType: "GUEST", booking: booking("RESERVED", "MOTHER") }));

    assert.equal(control.readOnly, false);
    assert.deepEqual(labelsOf(control), ["예약 (모)", "예약 (부)", "예약 (모/부)", "예약취소"]);
  });

  it("드랍다운 값은 그 상태가 실제로 허락한 조작으로만 풀린다", () => {
    const control = rosterBookingControl(row({ booking: booking("RESERVED", "MOTHER") }));

    assert.deepEqual(rosterBookingActionOf(control, "party:BOTH"), { kind: "party", party: "BOTH" });
    assert.deepEqual(rosterBookingActionOf(control, "cancel"), { kind: "cancel" });
    assert.equal(rosterBookingActionOf(control, "manual"), null);
    assert.equal(rosterBookingActionOf(control, "예약 (모)"), null);
  });
});

/* ── 비재원생 재예약 밑값 ───────────────────────────────────────────────── */

const guestRow = (overrides: Partial<SessionRosterRow> = {}) =>
  row({
    participantType: "GUEST",
    studentId: null,
    motherPhone: null,
    fatherPhone: null,
    guestContact: "01011112222",
    booking: booking("CANCELLED"),
    ...overrides,
  });

describe("취소된 비재원생 재예약 밑값", () => {
  it("행에 남아 있는 값 그대로 새 집계를 세운다 — 지어내는 값이 없다", () => {
    assert.deepEqual(rosterGuestRebookPrefill(guestRow()), {
      contact: "01011112222",
      guest: { name: "김수민", branch: "CAMPUS_A", schoolName: "잠실중", grade: "중3" },
    });
  });

  it("계약상 필수인 학교·학년이 없으면 밑값을 만들지 않는다 — 빈 값을 지어내지 않는다", () => {
    assert.equal(rosterGuestRebookPrefill(guestRow({ schoolName: null, grade: null })), null);
  });

  it("학년이 계약 enum(초1~고3)이 아니면 밑값을 만들지 않는다", () => {
    assert.equal(rosterGuestRebookPrefill(guestRow({ grade: "중등3" })), null);
  });

  it("연락처가 없거나 계약 길이를 벗어나면 밑값을 만들지 않는다", () => {
    assert.equal(rosterGuestRebookPrefill(guestRow({ guestContact: null })), null);
    assert.equal(rosterGuestRebookPrefill(guestRow({ guestContact: "0101" })), null);
  });

  it("재원생 행은 이 경로가 아니다", () => {
    assert.equal(rosterGuestRebookPrefill(row({ booking: booking("CANCELLED") })), null);
  });
});

/* ── 대표 연락처 ────────────────────────────────────────────────────────── */

describe("대표 연락처 후보", () => {
  it("있는 쪽만 준다 — BOTH 라는 대표 연락처는 계약에 없다", () => {
    assert.deepEqual(rosterContactChoices(row()).map((c) => c.party), ["MOTHER", "FATHER"]);
    assert.deepEqual(rosterContactChoices(row({ fatherPhone: null })).map((c) => c.party), ["MOTHER"]);
    assert.deepEqual(rosterContactChoices(row({ motherPhone: null })).map((c) => c.party), ["FATHER"]);
    assert.deepEqual(rosterContactChoices(row({ motherPhone: null, fatherPhone: null })), []);
  });

  it("후보 값은 서버가 준 전체 번호 그대로다", () => {
    assert.deepEqual(rosterContactChoices(row())[0], { party: "MOTHER", label: "모", contact: "01012345678" });
  });
});

describe("함께 담을 형제 후보", () => {
  const self = row({ rosterEntryId: "self", name: "김수민" });
  const sibling = row({ rosterEntryId: "sib", name: "김수현", studentId: "s-2" });

  it("같은 대표 연락처를 쓰는 예약 없는 재원생만 고른다", () => {
    assert.deepEqual(
      enrolledBookingCandidates([self, sibling], self, "01012345678").map((r) => r.name),
      ["김수현"],
    );
  });

  it("자기 자신은 후보가 아니다", () => {
    assert.deepEqual(enrolledBookingCandidates([self], self, "01012345678"), []);
  });

  it("연락처가 다르면 후보가 아니다 — 서버가 403 으로 거절할 조합이다", () => {
    const other = row({ rosterEntryId: "other", motherPhone: "01099998888", fatherPhone: null });
    assert.deepEqual(enrolledBookingCandidates([other], self, "01012345678"), []);
  });

  it("대표 연락처가 부 쪽이어도 그 번호를 가진 형제를 찾는다", () => {
    assert.deepEqual(
      enrolledBookingCandidates([sibling], self, "01087654321").map((r) => r.rosterEntryId),
      ["sib"],
    );
  });

  it("이미 예약이 있는 형제·비재원생은 후보가 아니다", () => {
    const booked = row({ rosterEntryId: "booked", booking: booking("RESERVED") });
    const guest = row({ rosterEntryId: "guest", participantType: "GUEST", studentId: null, booking: null });
    assert.deepEqual(enrolledBookingCandidates([booked, guest], self, "01012345678"), []);
  });
});

/* ── 이력 계보 ─────────────────────────────────────────────────────────── */

describe("이력 계보 대상", () => {
  it("취소→재예약이면 오래된 집계부터 전부 부른다", () => {
    const targets = rosterHistoryTargets([
      historyRef({ familyBookingId: BOOKING_ID, createdAt: "2026-07-16T02:00:00.000Z" }),
      historyRef({
        familyBookingId: OLD_BOOKING_ID,
        status: "CANCELLED",
        current: false,
        createdAt: "2026-07-15T02:00:00.000Z",
      }),
    ]);

    assert.deepEqual(targets.map((t) => t.familyBookingId), [OLD_BOOKING_ID, BOOKING_ID]);
  });

  it("같은 집계를 두 번 부르지 않는다", () => {
    const targets = rosterHistoryTargets([historyRef(), historyRef()]);
    assert.equal(targets.length, 1);
  });

  it("서버가 현재 집계를 먼저 주더라도 오래된 순으로 바로잡는다", () => {
    // 모달의 `예약 1`·`예약 2` 번호와 아래 시간순 계보가 여기서 갈라지면 안 된다 —
    // 그래서 표시용 번호도 이 정렬에서 매긴다.
    const targets = rosterHistoryTargets([
      historyRef({ familyBookingId: BOOKING_ID, current: true, createdAt: "2026-07-16T02:00:00.000Z" }),
      historyRef({
        familyBookingId: OLD_BOOKING_ID,
        status: "CANCELLED",
        current: false,
        createdAt: "2026-07-15T02:00:00.000Z",
      }),
    ]);

    assert.deepEqual(
      targets.map((t) => t.familyBookingId),
      [OLD_BOOKING_ID, BOOKING_ID],
    );
    // 즉 `예약 1` 은 취소된 옛 예약, `예약 2` 가 현재 예약이다.
    assert.equal(targets[0]!.current, false);
    assert.equal(targets[1]!.current, true);
  });

  it("이력이 없으면 아무것도 부르지 않는다", () => {
    assert.deepEqual(rosterHistoryTargets([]), []);
  });
});

describe("이력 문구", () => {
  it("서버 명단 셀과 같은 말을 쓴다 — 주체가 문구를 가른다", () => {
    assert.equal(rosterEventLabel("CREATED", "PUBLIC_PROOF"), "웹앱 예약");
    assert.equal(rosterEventLabel("CREATED", "ADMIN"), "수동 예약");
    assert.equal(rosterEventLabel("UPDATED", "PUBLIC_PROOF"), "웹앱 예약");
    assert.equal(rosterEventLabel("UPDATED", "ADMIN"), "수동 예약");
    assert.equal(rosterEventLabel("CANCELLED", "PUBLIC_PROOF"), "웹앱 예약 취소");
    assert.equal(rosterEventLabel("CANCELLED", "ADMIN"), "수동 예약 취소");
    assert.equal(rosterEventLabel("CHECKED_IN", "SCANNER"), "입장 완료");
    assert.equal(rosterEventLabel("MARKED_NO_SHOW", "SYSTEM"), "미참석 처리");
  });

  it("QR 수명주기는 기존 계약 문구 그대로 — 명단 셀에는 오지 않지만 이력에는 남는다", () => {
    assert.equal(rosterEventLabel("QR_ISSUED", "SYSTEM"), "QR 발급");
    assert.equal(rosterEventLabel("QR_ROTATED", "PUBLIC_PROOF"), "QR 재발급");
    assert.equal(rosterEventLabel("QR_REVOKED", "ADMIN"), "QR 폐기");
  });

  it("모르는 type 은 지어내지 않고 그대로 보여 준다", () => {
    assert.equal(rosterEventLabel("SOMETHING_NEW", "ADMIN"), "SOMETHING_NEW");
  });
});

const event = (id: string, familyBookingId: string, occurredAt: string, sequence: string) => ({
  eventId: id,
  sequence,
  familyBookingId,
  occurredAt,
});

describe("이력 계보 병합", () => {
  it("여러 집계를 시간순 한 줄로 — 취소된 옛 예약이 먼저 온다", () => {
    const merged = mergeRosterEventLineage([
      [
        event("e3", BOOKING_ID, "2026-07-16T03:00:00.000Z", "30"),
        event("e4", BOOKING_ID, "2026-07-17T05:00:00.000Z", "40"),
      ],
      [
        event("e1", OLD_BOOKING_ID, "2026-07-15T02:00:00.000Z", "10"),
        event("e2", OLD_BOOKING_ID, "2026-07-16T01:00:00.000Z", "20"),
      ],
    ]);

    assert.deepEqual(merged.map((e) => e.eventId), ["e1", "e2", "e3", "e4"]);
  });

  it("같은 eventId 는 한 번만 남는다", () => {
    const merged = mergeRosterEventLineage([
      [event("e1", BOOKING_ID, "2026-07-15T02:00:00.000Z", "10")],
      [event("e1", BOOKING_ID, "2026-07-15T02:00:00.000Z", "10")],
    ]);

    assert.deepEqual(merged.map((e) => e.eventId), ["e1"]);
  });

  it("같은 시각·같은 집계면 sequence 로 가른다 (bigint 문자열)", () => {
    const merged = mergeRosterEventLineage([
      [
        event("late", BOOKING_ID, "2026-07-15T02:00:00.000Z", "9007199254740993"),
        event("early", BOOKING_ID, "2026-07-15T02:00:00.000Z", "9007199254740992"),
      ],
    ]);

    // Number 로 바꿨다면 두 값이 같아져 순서가 무너진다.
    assert.deepEqual(merged.map((e) => e.eventId), ["early", "late"]);
  });

  it("자릿수가 다른 sequence 를 사전순으로 착각하지 않는다", () => {
    const merged = mergeRosterEventLineage([
      [
        event("b", BOOKING_ID, "2026-07-15T02:00:00.000Z", "100"),
        event("a", BOOKING_ID, "2026-07-15T02:00:00.000Z", "99"),
      ],
    ]);

    assert.deepEqual(merged.map((e) => e.eventId), ["a", "b"]);
  });

  it("빈 입력은 빈 계보다", () => {
    assert.deepEqual(mergeRosterEventLineage([]), []);
    assert.deepEqual(mergeRosterEventLineage([[], []]), []);
  });
});

/* ── 취소된 재원생 가족 재예약: studentId 수집 ─────────────────────────── */

describe("cancelledFamilyRebookStudentIds — 취소된 가족의 재원생 전부(선택 행이 맨 앞)", () => {
  const STUDENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const STUDENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const STUDENT_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const link = (studentId: string | null, overrides: Partial<FamilyBookingStudentSnapshot> = {}): FamilyBookingStudentSnapshot => ({
    familyBookingStudentId: `link-${studentId ?? "guest"}`,
    participantType: "ENROLLED",
    studentId,
    sourceStudentNo: "S-1001",
    name: "학생",
    branch: "CAMPUS_A" as Branch,
    representativeClassName: null,
    schoolName: null,
    grade: null,
    unitName: null,
    teacherName: null,
    ...overrides,
  });

  const aggregate = (
    status: FamilyBookingStatus,
    students: FamilyBookingStudentSnapshot[],
  ): FamilyBooking => ({
    familyBookingId: BOOKING_ID,
    seminarSessionId: SESSION_ID,
    contact: "01000000000",
    attendanceParty: "MOTHER",
    bookingSource: "PHONE",
    seatCount: 1,
    status,
    students,
    qrStatus: "REVOKED",
    qrVersion: 1,
    version: 4,
    createdAt: "2026-07-15T02:00:00.000Z",
    updatedAt: "2026-07-16T05:00:00.000Z",
    checkedInAt: null,
    cancelledAt: status === "CANCELLED" ? "2026-07-16T05:00:00.000Z" : null,
  });

  it("명단에 안 보이는 형제까지 재원생 전원을 담고, 선택한 행을 맨 앞에 둔다", () => {
    // B 가 선택된 행 — 결과의 첫 원소여야 한다(idempotency 대상 = studentIds[0]).
    const result = cancelledFamilyRebookStudentIds(
      aggregate("CANCELLED", [link(STUDENT_A), link(STUDENT_B), link(STUDENT_C)]),
      STUDENT_B,
    );
    assert.deepEqual(result, { ok: true, studentIds: [STUDENT_B, STUDENT_A, STUDENT_C] });
  });

  it("중복 studentId 는 한 번만 담는다", () => {
    const result = cancelledFamilyRebookStudentIds(
      aggregate("CANCELLED", [link(STUDENT_A), link(STUDENT_A), link(STUDENT_B)]),
      STUDENT_A,
    );
    assert.deepEqual(result, { ok: true, studentIds: [STUDENT_A, STUDENT_B] });
  });

  it("취소 상태가 아니면 fail-closed — 옛 집계를 되살리지 않는다", () => {
    const result = cancelledFamilyRebookStudentIds(aggregate("RESERVED", [link(STUDENT_A)]), STUDENT_A);
    assert.equal(result.ok, false);
  });

  it("GUEST 링크가 섞이면 fail-closed", () => {
    const result = cancelledFamilyRebookStudentIds(
      aggregate("CANCELLED", [link(STUDENT_A), link(null, { participantType: "GUEST" })]),
      STUDENT_A,
    );
    assert.equal(result.ok, false);
  });

  it("studentId 가 없는 링크가 있으면 fail-closed", () => {
    const result = cancelledFamilyRebookStudentIds(
      aggregate("CANCELLED", [link(STUDENT_A), link(null)]),
      STUDENT_A,
    );
    assert.equal(result.ok, false);
  });

  it("빈 학생 링크면 fail-closed", () => {
    const result = cancelledFamilyRebookStudentIds(aggregate("CANCELLED", []), STUDENT_A);
    assert.equal(result.ok, false);
  });

  it("선택한 학생이 그 가족에 없으면 fail-closed — 대상이 어긋난 것이다", () => {
    const result = cancelledFamilyRebookStudentIds(aggregate("CANCELLED", [link(STUDENT_A)]), STUDENT_C);
    assert.equal(result.ok, false);
  });
});
