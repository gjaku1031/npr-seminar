"use client";

/**
 * 예약 명단 (계약 tag: Admin family bookings — 회차 roster).
 *
 * ★ 행 하나 = 그 회차의 **예약과 연결된 참가자 한 명**이다. 서버가 페이지를 나누기 전에
 *   booked-only 범위를 적용하므로, 예약이 없는 재원생은 행으로 오지 않는다.
 *
 * ★ 그런데 **바뀌는 단위는 여전히 가족 예약**이다. 형제는 각자 행이지만 같은
 *   familyBookingId 를 되풀이하므로, 참석 학부모 변경·취소는 형제 모두에게 걸린다.
 *   그래서 조작 전에 그 사실을 먼저 말한다.
 *
 * ★ 단위(초등·중1…) 판정과 담임 정규화는 **서버 몫**이다. 반명을 뜯어 다시 계산하지 않고
 *   탭은 계약 enum 만 보낸다.
 *
 * ★ 응답은 전체 연락처를 담은 ADMIN 전용 민감 데이터다 — 저장·로깅·URL 노출 금지.
 */

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ADMIN_BOOKING_SOURCE_LABELS,
  ADMIN_CANCELLATION_TYPE_OPTIONS,
  ATTENDANCE_PARTY_LABELS,
  BRANCH_LABELS,
  BRANCH_OPTIONS,
  enrolledBookingCandidates,
  GUEST_GRADE_OPTIONS,
  isValidBookingReason,
  ROSTER_BOOKING_LABELS,
  ROSTER_UNIT_TABS,
  rosterBookingActionOf,
  rosterBookingControl,
  rosterContactChoices,
  rosterGuestRebookPrefill,
  rosterHasActiveBooking,
  rosterUnitGroupLabel,
  showsBranchColumn,
  type AdminBookingSource,
  type AdminCancellationType,
  type AttendanceParty,
  type Branch,
  type GuestGrade,
  type PublicGuestParticipantInput,
  type RosterBookingControl,
  type RosterContactChoice,
  type RosterGuestRebookPrefill,
  type SeminarSessionOption,
  type SessionRosterRow,
} from "@/shared/api";
import {
  candidateAlreadyBooked,
  candidateContactChoices,
  ENROLLED_BOOKING_MAX_STUDENTS,
  mutationDialogsForRetainedAction,
  useBookableSessions,
  useBookingMutations,
  useCancelledFamilyRebook,
  useEnrolledStudentSearch,
  useRosterXlsxExport,
  useSameContactSiblings,
  useSessionRoster,
  type BookingMutationKind,
  type EnrolledContactChoice,
  type EnrolledStudentCandidate,
} from "@/features/manage-family-booking";
import { fmtDateTimeShort, fmtSessionDate } from "@/shared/lib/format";
import { fmtPhone } from "@/shared/lib/phone";
import { Badge, Button, Card, Dialog, EmptyState, Icons, Input, Select, Tag, Toast } from "@/shared/ui";
import {
  ROSTER_FILTER_LABEL_STYLE,
  ROSTER_FILTER_ROW_STYLE,
  ROSTER_FILTER_SEARCH_WIDTH,
  ROSTER_FILTER_SPACER_WIDTH,
  ROSTER_FILTER_TAG_STYLE,
} from "../lib/roster-filter-layout";
import { BookingEventsDialog } from "./BookingEventsDialog";
import { ParticipationMonitoringTag } from "./ParticipationMonitoringTag";

const PARTY_OPTIONS: ReadonlyArray<{ value: AttendanceParty; label: string }> = [
  { value: "MOTHER", label: ATTENDANCE_PARTY_LABELS.MOTHER },
  { value: "FATHER", label: ATTENDANCE_PARTY_LABELS.FATHER },
  { value: "BOTH", label: ATTENDANCE_PARTY_LABELS.BOTH },
];

const SOURCE_OPTIONS: AdminBookingSource[] = ["PHONE", "TEACHER", "ON_SITE"];

const at = (iso: string) => fmtDateTimeShort(new Date(iso));

function sessionLabel(option: SeminarSessionOption): string {
  const { session, seminarTitle } = option;
  const scope = session.branch === null ? "전체" : BRANCH_LABELS[session.branch];
  return `${seminarTitle} · ${fmtSessionDate(new Date(session.startsAt))} · ${scope}`;
}

/** 지금 페이지에서 같은 가족 예약을 공유하는 다른 학생들 — 조작이 누구에게 걸리는지 밝힌다. */
function siblingsOf(rows: readonly SessionRosterRow[], row: SessionRosterRow): SessionRosterRow[] {
  const familyBookingId = row.booking?.familyBookingId;
  if (familyBookingId === undefined) return [];
  return rows.filter(
    (other) => other.rosterEntryId !== row.rosterEntryId && other.booking?.familyBookingId === familyBookingId,
  );
}

/**
 * 조작 요청 — 확인 대화상자가 뜨기 전까지 붙잡아 두는 자리.
 *
 * ★ 여기 오는 건 **활성 예약이 있는 행**뿐이다. 참석 변경은 PATCH 이므로 바꿀 집계가 있어야
 *   하고, 취소도 마찬가지다. 예약이 없거나 취소된 행에서 고른 참석은 이 갈래가 아니라
 *   `BookingDraft`(새 집계를 만드는 대화상자)로 간다.
 */
type PendingRequest =
  | { kind: "party"; row: SessionRosterRow; party: AttendanceParty }
  | { kind: "cancel"; row: SessionRosterRow };

/**
 * 확인 대화상자가 돌려주는 값 — 참석 변경은 자유 사유, 취소는 정해진 취소 갈래다.
 * 관리자 취소는 계약상 자유 사유를 받지 않으므로 문자열이 아니라 `cancellationType` 을 낸다.
 */
type ConfirmResult =
  | { kind: "party"; reason: string }
  | { kind: "cancel"; cancellationType: AdminCancellationType };

/**
 * 새 예약을 만들려는 참 — 아직 아무것도 보내지 않았다.
 *
 * 드랍다운에서 `예약 (모)` 를 골랐다고 바로 서버로 나가지 않는다: 활성 예약이 없으면 PATCH 할
 * 집계가 없고, 새 집계는 대표 연락처·경로·사유를 **명시적으로** 받아야 하기 때문이다.
 * `party` 는 그 대화상자에 미리 채워 줄 값이고, `수동 예약`으로 열었으면 null 이다.
 */
type BookingDraft = { row: SessionRosterRow; party: AttendanceParty | null };

export function StudentsView() {
  const sessions = useBookableSessions();
  const fallbackSessionId = sessions.options[0]?.session.seminarSessionId;
  const roster = useSessionRoster(fallbackSessionId);

  const { reload: reloadRoster } = roster;
  const mutations = useBookingMutations(reloadRoster);
  const xlsx = useRosterXlsxExport(roster.filters.sessionId);

  const [searchDraft, setSearchDraft] = useState(roster.filters.query);
  /** 상단 `수동 추가` 메뉴로 여는, 명단 행과 무관한 새 비재원생 대화상자(밑값이 없다). */
  const [guestOpen, setGuestOpen] = useState(false);
  /** 상단 `수동 추가` 메뉴로 여는 재원생 검색·예약 대화상자. */
  const [enrolledSearchOpen, setEnrolledSearchOpen] = useState(false);
  const [eventsFor, setEventsFor] = useState<SessionRosterRow | null>(null);
  /** 명단 행 드랍다운에서 여는 재원생 새 집계 대화상자(수동 예약·취소 후 재예약). */
  const [manualFor, setManualFor] = useState<BookingDraft | null>(null);
  /** 취소된 비재원생 행에서 그 행의 값으로 다시 예약하는 대화상자. */
  const [guestRebook, setGuestRebook] = useState<BookingDraft | null>(null);
  const [request, setRequest] = useState<PendingRequest | null>(null);

  /**
   * 예약 칸에서 "새 예약을 만들자"가 눌렸을 때 — 재원생·비재원생 각자의 대화상자를 연다.
   * 어느 쪽이든 **여는 것뿐**이고, 서버로 나가는 건 대화상자가 사유·경로까지 받은 뒤다.
   */
  const openBookingDraft = (row: SessionRosterRow, party: AttendanceParty | null) => {
    if (row.participantType === "GUEST") setGuestRebook({ row, party });
    else setManualFor({ row, party });
  };

  /**
   * 붙잡힌 의도의 **그대로 재시도**가 성공하면, 그 조작을 시작했던 대화상자를 닫는다.
   *
   * 재시도는 옛(붙잡힌) 페이로드를 보낸다 — 성공했는데 편집된 값이 뜬 대화상자를 열어 두면
   * 사용자가 다시 제출을 눌러 새 키로 같은 변경을 중복 발행할 수 있다. action 별로 정확히 그
   * 대화상자만 닫는다.
   */
  const closeDialogsForRetainedRetry = (action: BookingMutationKind) => {
    for (const dialog of mutationDialogsForRetainedAction(action)) {
      if (dialog === "confirm") setRequest(null);
      else if (dialog === "manualEnrolled") {
        // 재원생 예약은 두 곳에서 나간다(행 드랍다운의 수동 예약·상단 검색) — 둘 다 닫는다.
        setManualFor(null);
        setEnrolledSearchOpen(false);
      } else {
        setGuestOpen(false);
        setGuestRebook(null);
      }
    }
  };

  // URL 이 바깥에서 바뀌면 입력창도 따라간다 (렌더 중 조정 — effect 는 낡은 값을 한 프레임 그린다).
  const [syncedQuery, setSyncedQuery] = useState(roster.filters.query);
  if (syncedQuery !== roster.filters.query) {
    setSyncedQuery(roster.filters.query);
    setSearchDraft(roster.filters.query);
  }

  const selected = useMemo(
    () => sessions.options.find((o) => o.session.seminarSessionId === roster.filters.sessionId) ?? null,
    [sessions.options, roster.filters.sessionId],
  );

  /** 분원 열은 "전체"일 때만 의미가 있다 — 한 분원을 고르면 모든 행이 같은 값이라 소음이다. */
  const showBranchColumn = showsBranchColumn(roster.filters.branch);

  const rows = roster.page?.items ?? [];
  /** 현재 캠퍼스·단위·담임·검색 조건의 학생/가족/실 참가자 집계 — 목록 페이지와 분리된 서버 값. */
  const monitoring = roster.page?.monitoring;
  /** 담임 선택지는 서버 facets 그대로 — 화면이 목록에서 긁어 모으면 페이지마다 달라진다. */
  const teachers = roster.page?.facets.teachers ?? [];
  const unmatchedUnitCount = roster.page?.facets.unmatchedUnitCount ?? 0;

  /**
   * URL 의 담임이 지금 분원의 facets 에 없을 수 있다(분원을 바꿨거나 링크를 받은 경우).
   * 그래도 필터는 서버에 걸려 있으므로 선택지에 남겨 둔다 — 빈 칸으로 보이면 왜 명단이
   * 비었는지 알 수 없다.
   */
  const teacherOptions =
    roster.filters.teacherName !== undefined && !teachers.includes(roster.filters.teacherName)
      ? [roster.filters.teacherName, ...teachers]
      : teachers;

  // 두 줄 필터의 라벨(캠퍼스·단위) — group 을 가리키는 접근성 연결. 조기 반환 전에 부른다.
  const campusLabelId = useId();
  const unitLabelId = useId();

  if (sessions.loading) return <EmptyState>설명회를 불러오는 중이에요…</EmptyState>;

  if (sessions.error !== null) {
    return (
      <div role="alert" style={{ padding: "40px 0", textAlign: "center" }}>
        <p style={{ fontSize: 13.5, color: "var(--text-body)", margin: "0 0 12px" }}>{sessions.error}</p>
        <Button variant="secondary" size="sm" onClick={sessions.reload}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (sessions.options.length === 0) return <EmptyState>등록된 설명회가 없어요.</EmptyState>;

  return (
    <div data-screen-label="예약 명단">
      {/* 상단: 제목(좌) + 회차 선택·엑셀 다운로드(우) */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>
            RESERVATIONS
          </div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800, whiteSpace: "nowrap" }}>예약 명단</h1>
        </div>
        <span style={{ flex: 1, minWidth: 8 }} />
        {/* 엑셀 다운로드는 고른 회차·필터 기준 내보내기라 회차 선택 옆 header action 으로 둔다 —
            아래 필터의 action 컬럼(수동 추가·담임)을 방해하지 않는다. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
          <Select
            options={sessions.options.map((o) => ({ label: sessionLabel(o), value: o.session.seminarSessionId }))}
            value={roster.filters.sessionId}
            onChange={(sessionId) => roster.setFilters({ sessionId })}
            style={{ width: 380, maxWidth: "min(380px, 82vw)", whiteSpace: "nowrap" }}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Icons.download size={16} />}
            disabled={xlsx.downloading}
            onClick={() =>
              xlsx.download({
                branch: roster.filters.branch,
                unitGroup: roster.filters.unitGroup,
                teacherName: roster.filters.teacherName,
                query: roster.filters.query.trim() === "" ? undefined : roster.filters.query.trim(),
              })
            }
          >
            {xlsx.downloading ? "내보내는 중…" : "엑셀 다운로드"}
          </Button>
        </div>
      </div>

      {/*
        필터 — 학생 현황과 같은 두 줄 구조. 왼쪽 두 줄은 각자 nowrap + 가로 스크롤이라 페이지가
        아니라 그 줄만 밀린다. 오른쪽 action 컬럼은 `수동 추가`(위)·담임(아래)을 수직 정렬한다.
        1행 검색폭 = 2행 여백이라 `캠퍼스`·`단위` 라벨이 같은 x 에서 시작한다.
      */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginTop: 18 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* 1행: 검색 → 캠퍼스 라벨 → 캠퍼스 버튼 */}
          <div style={ROSTER_FILTER_ROW_STYLE}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                roster.setFilters({ query: searchDraft });
              }}
              style={{ flexShrink: 0, width: ROSTER_FILTER_SEARCH_WIDTH }}
            >
              <Input
                placeholder="이름·학교·학번·연락처 뒤 4자리"
                value={searchDraft}
                onChange={setSearchDraft}
                icon={<Icons.search size={15} />}
                style={{ width: "100%" }}
              />
              <button type="submit" style={{ display: "none" }} aria-hidden />
            </form>

            <span id={campusLabelId} style={ROSTER_FILTER_LABEL_STYLE}>
              캠퍼스
            </span>
            <div role="group" aria-labelledby={campusLabelId} style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <ParticipationMonitoringTag
                label="전체"
                selected={roster.filters.branch === undefined}
                monitoring={monitoring}
                onSelect={() => roster.setFilters({ branch: undefined })}
                style={ROSTER_FILTER_TAG_STYLE}
              />
              {BRANCH_OPTIONS.map((option) => (
                <ParticipationMonitoringTag
                  key={option.value}
                  label={option.label}
                  selected={roster.filters.branch === option.value}
                  monitoring={monitoring}
                  onSelect={() => roster.setFilters({ branch: option.value })}
                  style={ROSTER_FILTER_TAG_STYLE}
                />
              ))}
            </div>
          </div>

          {/* 2행: (검색폭만큼 왼쪽 여백) → 단위 라벨 → 단위 버튼 */}
          <div style={ROSTER_FILTER_ROW_STYLE}>
            <span aria-hidden style={{ width: ROSTER_FILTER_SPACER_WIDTH, flexShrink: 0 }} />
            <span id={unitLabelId} style={ROSTER_FILTER_LABEL_STYLE}>
              단위
            </span>
            <div role="group" aria-labelledby={unitLabelId} style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {ROSTER_UNIT_TABS.map((tab) => (
                <Tag
                  key={tab.value}
                  selected={roster.filters.unitGroup === tab.value}
                  onClick={() => roster.setFilters({ unitGroup: tab.value })}
                  style={ROSTER_FILTER_TAG_STYLE}
                >
                  {tab.label}
                </Tag>
              ))}
            </div>
          </div>
        </div>

        {/* 오른쪽 action 컬럼 — `수동 추가`가 담임 드롭다운 바로 위에 수직 정렬된다. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
          <AddMenu onAddEnrolled={() => setEnrolledSearchOpen(true)} onAddGuest={() => setGuestOpen(true)} />
          {/* 담임 선택지는 서버 facets 그대로다 — 목록에서 긁어 모으면 페이지마다 흔들린다. */}
          <Select
            options={[{ label: "담임 전체", value: "" }, ...teacherOptions.map((teacher) => ({ label: teacher, value: teacher }))]}
            value={roster.filters.teacherName ?? ""}
            onChange={(teacher) => roster.setFilters({ teacherName: teacher === "" ? undefined : teacher })}
            style={{ width: 124, flexShrink: 0 }}
          />
        </div>
      </div>

      {/*
        서버가 어느 단위 규칙에도 걸리지 않는다고 알려 준 학생들 — 단위 탭을 고르면 이들은
        어느 탭에도 나타나지 않는다. 조용히 빠뜨리면 명단이 전부인 척하게 되므로 밝힌다.
      */}
      {unmatchedUnitCount > 0 && roster.filters.unitGroup !== "ALL" && (
        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.5 }}>
          반명이 단위 규칙에 걸리지 않는 학생 {unmatchedUnitCount.toLocaleString("ko-KR")}명은 단위 탭에 나타나지
          않아요 — <b>전체</b> 탭에서 볼 수 있어요.
        </p>
      )}

      <RosterTable
        roster={roster}
        rows={rows}
        showBranchColumn={showBranchColumn}
        pendingId={mutations.pendingId}
        onChangeParty={(row, party) => setRequest({ kind: "party", row, party })}
        onCancel={(row) => setRequest({ kind: "cancel", row })}
        onBook={openBookingDraft}
        onOpenEvents={setEventsFor}
      />

      {request !== null && (
        <ConfirmRequestDialog
          request={request}
          siblings={siblingsOf(rows, request.row)}
          pending={mutations.pendingId !== null}
          onClose={() => setRequest(null)}
          onConfirm={async (result) => {
            const booking = request.row.booking;
            if (booking === null) return;
            let ok = false;
            if (request.kind === "cancel" && result.kind === "cancel") {
              ok = await mutations.cancel({
                familyBookingId: booking.familyBookingId,
                expectedVersion: booking.version,
                cancellationType: result.cancellationType,
              });
            } else if (request.kind === "party" && result.kind === "party") {
              ok = await mutations.changeParty({
                familyBookingId: booking.familyBookingId,
                attendanceParty: request.party,
                expectedVersion: booking.version,
                reason: result.reason,
              });
            }
            if (ok) setRequest(null);
          }}
        />
      )}

      {manualFor !== null && selected !== null && (
        <ManualBookingDialog
          row={manualFor.row}
          initialParty={manualFor.party}
          option={selected}
          candidates={rows}
          pending={mutations.enrolledPending}
          onClose={() => setManualFor(null)}
          onSubmit={async (input) => {
            const ok = await mutations.addEnrolled(input);
            if (ok) setManualFor(null);
          }}
        />
      )}

      {/* 상단 메뉴의 재원생 추가 — 활성 재원생을 검색해 새 가족 예약을 만든다(자유 사유 없음). */}
      {enrolledSearchOpen && selected !== null && (
        <EnrolledSearchDialog
          option={selected}
          branch={roster.filters.branch}
          pending={mutations.enrolledPending}
          onClose={() => setEnrolledSearchOpen(false)}
          onSubmit={async (input) => {
            const ok = await mutations.addEnrolled(input);
            if (ok) setEnrolledSearchOpen(false);
          }}
        />
      )}

      {/* 전역 추가 — 밑값이 없다. 명단에 없는 새 비재원생을 처음부터 받는 자리다. */}
      {guestOpen && selected !== null && (
        <GuestDialog
          option={selected}
          pending={mutations.guestPending}
          onClose={() => setGuestOpen(false)}
          onSubmit={async (input) => {
            const ok = await mutations.addGuest(input);
            if (ok) setGuestOpen(false);
          }}
        />
      )}

      {/*
        취소된 비재원생 재예약 — 같은 대화상자를 그 행의 값으로 채워서 연다. 옛 집계는 그대로
        두고 **새 집계**를 만든다(계약상 취소된 집계를 되살리는 길은 없다).
      */}
      {guestRebook !== null && selected !== null && (
        <GuestDialog
          option={selected}
          prefill={rosterGuestRebookPrefill(guestRebook.row)}
          initialParty={guestRebook.party}
          pending={mutations.guestPending}
          onClose={() => setGuestRebook(null)}
          onSubmit={async (input) => {
            const ok = await mutations.addGuest(input);
            if (ok) setGuestRebook(null);
          }}
        />
      )}

      <BookingEventsDialog row={eventsFor} onClose={() => setEventsFor(null)} />

      {/* 다운로드 실패는 명단 조작 토스트와 겹치지 않게 위쪽에 따로 띄운다. */}
      {xlsx.error !== null && (
        <div style={{ position: "fixed", bottom: 82, left: "50%", transform: "translateX(-50%)", zIndex: 120 }}>
          <Toast tone="danger" action="닫기" onAction={xlsx.dismiss}>
            {xlsx.error}
          </Toast>
        </div>
      )}

      {(mutations.notice !== null || mutations.error !== null) && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 120 }}>
          {/*
            결과 미상인 의도가 붙잡혀 있으면 재시도를 **그 의도 그대로** 내준다 — 화면에 편집된
            값이 떠 있어도 몰래 옛 페이로드를 보내지 않고, 누르는 것이 무엇인지 말해 준다.
          */}
          {(() => {
            const retry = mutations.error !== null ? mutations.retryRetained : null;
            return (
              <Toast
                tone={mutations.error !== null ? "danger" : "success"}
                action={retry !== null ? "같은 요청 재시도" : "닫기"}
                onAction={
                  retry !== null
                    ? async () => {
                        // 재시도가 확정 성공하면 그 조작을 시작했던 대화상자를 닫아, 편집된 값으로
                        // 다시 제출해 새 키로 중복 발행하는 길을 막는다.
                        const outcome = await retry();
                        if (outcome.ok) closeDialogsForRetainedRetry(outcome.action);
                      }
                    : mutations.dismiss
                }
              >
                {mutations.error ?? mutations.notice}
              </Toast>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ── 수동 추가 메뉴 ─────────────────────────────────────────────────────── */

/**
 * 상단 `수동 추가` 메뉴 — `재원생 추가` / `비재원생 추가` 두 갈래를 연다.
 *
 * 트리거는 기존 primary 버튼과 같은 토큰(보라 그라디언트)으로 그리되, DS Button 은 ref·aria·
 * keydown 을 넘겨받지 못하므로 접근성을 위해 native `<button>` 으로 둔다.
 *
 * 접근성: 트리거는 `aria-haspopup="menu"` + `aria-expanded`, 팝오버는 `role="menu"` 에
 * `role="menuitem"` 버튼들. 열리면 첫 항목으로 포커스가 가고, ↑/↓·Home/End 로 이동, Enter/Space
 * 로 실행, Escape·Tab·바깥 포인터로 닫는다. Escape 로 닫으면 트리거로 포커스를 되돌린다.
 */
function AddMenu({ onAddEnrolled, onAddGuest }: { onAddEnrolled: () => void; onAddGuest: () => void }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const items = useMemo(
    () => [
      { key: "enrolled", label: "재원생 추가", onSelect: onAddEnrolled },
      { key: "guest", label: "비재원생 추가", onSelect: onAddGuest },
    ],
    [onAddEnrolled, onAddGuest],
  );

  const closeMenu = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (wrapRef.current !== null && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  useEffect(() => {
    // 열리면 첫 항목으로 포커스를 옮긴다 — 키보드로 바로 고를 수 있게.
    if (open) itemsRef.current[0]?.focus();
  }, [open]);

  const moveFocus = (index: number) => {
    const count = items.length;
    itemsRef.current[((index % count) + count) % count]?.focus();
  };

  const select = (onSelect: () => void) => {
    setOpen(false);
    onSelect();
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: 44,
          padding: "0 20px",
          fontSize: 15,
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          letterSpacing: "var(--tracking-body)",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          color: "var(--text-on-brand)",
          border: "1px solid transparent",
          background: hover
            ? "linear-gradient(135deg, var(--violet-700), var(--violet-500))"
            : "linear-gradient(135deg, var(--violet-800), var(--violet-600))",
          boxShadow: hover ? "0 8px 28px rgba(54,95,8,0.40)" : "none",
          transition: "all var(--dur-fast) var(--ease-out)",
        }}
      >
        <Icons.plus size={16} />
        수동 추가
        <Icons.chevronDown
          size={14}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-base) var(--ease-spring)" }}
        />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="수동 추가"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            minWidth: 176,
            background: "var(--surface-card)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-hairline)",
            boxShadow: "var(--shadow-float)",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            animation: "ds-scale-in var(--dur-base) var(--ease-spring) both",
            transformOrigin: "top right",
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(element) => {
                itemsRef.current[index] = element;
              }}
              type="button"
              role="menuitem"
              onClick={() => select(item.onSelect)}
              onKeyDown={(event) => {
                switch (event.key) {
                  case "ArrowDown":
                    event.preventDefault();
                    moveFocus(index + 1);
                    break;
                  case "ArrowUp":
                    event.preventDefault();
                    moveFocus(index - 1);
                    break;
                  case "Home":
                    event.preventDefault();
                    moveFocus(0);
                    break;
                  case "End":
                    event.preventDefault();
                    moveFocus(items.length - 1);
                    break;
                  case "Escape":
                    event.preventDefault();
                    closeMenu(true);
                    break;
                  case "Tab":
                    setOpen(false);
                    break;
                  default:
                    break;
                }
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "var(--surface-sunken)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--radius-xs)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-body)",
                transition: "background var(--dur-fast) var(--ease-out)",
              }}
            >
              <Icons.plus size={14} style={{ color: "var(--text-accent)" }} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 표 ────────────────────────────────────────────────────────────────── */

/**
 * 열 폭 — 12(캠퍼스 없음)·13(캠퍼스) 열이 1031px 뷰포트(콘텐츠 ≈ 983px)에 들어가도록 좁게
 * 잡는다. 페이지 가로 스크롤은 표를 감싼 `overflowX:auto` 가 막고, 좁은 폭에서만 표 내부에서
 * 아주 조금 스크롤된다. 반명 한 칸을 **수학반·과학반** 두 칸으로 나눈 것이 이번 변경이다.
 */
function gridCols(showBranch: boolean): string {
  return showBranch
    ? "28px 50px 40px 1fr 76px 88px 1fr 38px 54px 112px 98px 68px 1.3fr"
    : "28px 52px 1fr 78px 92px 1fr 38px 56px 116px 100px 70px 1.35fr";
}

/** 열 사이 간격 — 헤더·행·최소폭 계산이 같은 값을 쓴다. */
const COL_GAP = 7;

function headers(showBranch: boolean): string[] {
  return [
    "No",
    "학번",
    // 열 이름표는 "캠퍼스" — 내부 속성/API 는 그대로 branch 다.
    ...(showBranch ? ["캠퍼스"] : []),
    "학생이름",
    // 반명 한 칸을 서버가 주는 두 배정으로 나눈다 — 대표 반이 아니라 실제 수학반·과학반이다.
    "수학반",
    "과학반",
    "학교",
    // 열 이름표는 "단위" — 서버가 판정한 unitName 을 그룹 라벨로 접어 보여 준다.
    "단위",
    "담임명",
    "학부모연락처",
    "예약",
    "입장",
    "최신 로그",
  ];
}

function RosterTable({
  roster,
  rows,
  showBranchColumn,
  pendingId,
  onChangeParty,
  onCancel,
  onBook,
  onOpenEvents,
}: {
  roster: ReturnType<typeof useSessionRoster>;
  rows: readonly SessionRosterRow[];
  showBranchColumn: boolean;
  pendingId: string | null;
  onChangeParty: (row: SessionRosterRow, party: AttendanceParty) => void;
  onCancel: (row: SessionRosterRow) => void;
  onBook: (row: SessionRosterRow, party: AttendanceParty | null) => void;
  onOpenEvents: (row: SessionRosterRow) => void;
}) {
  const { page, loading, refreshing, error, filtered } = roster;
  const cols = gridCols(showBranchColumn);

  return (
    <Card padding="0" style={{ marginTop: 16, overflow: "hidden" }}>
      {error !== null && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px var(--card-pad)",
            background: "var(--status-danger-soft)",
            color: "var(--status-danger)",
            fontSize: 12.5,
          }}
        >
          <span>{error}</span>
          <Button variant="secondary" size="sm" onClick={roster.reload}>
            다시 시도
          </Button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <div
          aria-busy={loading || refreshing}
          style={{
            // 12열(캠퍼스 없음)은 1031px 뷰포트의 콘텐츠 폭(≈983px)에 맞춰 내부 스크롤이 없게, 13열
            // (캠퍼스=전체)은 열이 하나 더라 아주 조금만 내부에서 스크롤되게 둔다.
            minWidth: showBranchColumn ? 1060 : 980,
            opacity: refreshing ? 0.6 : 1,
            transition: "opacity var(--dur-fast)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: cols,
              gap: COL_GAP,
              padding: "11px 14px",
              background: "var(--surface-sunken)",
              fontSize: 11.5,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.02em",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {headers(showBranchColumn).map((header) => (
              <span key={header}>{header}</span>
            ))}
          </div>

          {loading && page === null
            ? Array.from({ length: 8 }, (_, index) => (
                <div key={index} style={{ height: 44, borderTop: "1px solid var(--border-hairline)", display: "flex", alignItems: "center", padding: "0 14px" }}>
                  <span style={{ height: 11, flex: 1, borderRadius: 999, background: "var(--surface-sunken)", animation: "ds-shimmer 1.5s linear infinite" }} />
                </div>
              ))
            : rows.map((row, index) => (
                <RosterRow
                  key={row.rosterEntryId}
                  row={row}
                  no={(page!.page.page - 1) * page!.page.pageSize + index + 1}
                  index={index}
                  cols={cols}
                  showBranchColumn={showBranchColumn}
                  pending={pendingId !== null && pendingId === row.booking?.familyBookingId}
                  onChangeParty={onChangeParty}
                  onCancel={onCancel}
                  onBook={onBook}
                  onOpenEvents={onOpenEvents}
                />
              ))}

          {page !== null && rows.length === 0 && (
            <EmptyState>{filtered ? "조건에 맞는 명단이 없어요." : "이 회차의 명단이 비어 있어요."}</EmptyState>
          )}
        </div>
      </div>

      {page !== null && rows.length > 0 && <Pagination roster={roster} />}
    </Card>
  );
}

/** 서버가 나눈 페이지 그대로 — 총계도 서버 값이다(한 페이지를 전체인 척하지 않는다). */
function Pagination({ roster }: { roster: ReturnType<typeof useSessionRoster> }) {
  const meta = roster.page!.page;
  const first = meta.page <= 1;
  const last = meta.page >= meta.totalPages;

  return (
    <nav
      aria-label="명단 페이지"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 10,
        padding: "12px var(--card-pad)",
        borderTop: "1px solid var(--border-hairline)",
        fontSize: 12.5,
        color: "var(--text-muted)",
        fontFeatureSettings: '"tnum"',
      }}
    >
      <span aria-live="polite">
        총 {meta.totalItems.toLocaleString("ko-KR")}명
        {meta.totalPages > 1 && ` · ${meta.page}/${meta.totalPages} 페이지`}
      </span>
      {meta.totalPages > 1 && (
        <Fragment>
          <Button variant="secondary" size="sm" disabled={first} onClick={() => roster.setFilters({ page: meta.page - 1 })}>
            이전
          </Button>
          <Button variant="secondary" size="sm" disabled={last} onClick={() => roster.setFilters({ page: meta.page + 1 })}>
            다음
          </Button>
        </Fragment>
      )}
    </nav>
  );
}

const faint = (value: string | null) =>
  value === null ? <span style={{ color: "var(--text-faint)" }}>—</span> : <span>{value}</span>;

function RosterRow({
  row,
  no,
  index,
  cols,
  showBranchColumn,
  pending,
  onChangeParty,
  onCancel,
  onBook,
  onOpenEvents,
}: {
  row: SessionRosterRow;
  no: number;
  index: number;
  cols: string;
  showBranchColumn: boolean;
  pending: boolean;
  onChangeParty: (row: SessionRosterRow, party: AttendanceParty) => void;
  onCancel: (row: SessionRosterRow) => void;
  onBook: (row: SessionRosterRow, party: AttendanceParty | null) => void;
  onOpenEvents: (row: SessionRosterRow) => void;
}) {
  const control = rosterBookingControl(row);
  const guest = row.participantType === "GUEST";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: cols,
        gap: COL_GAP,
        alignItems: "center",
        textAlign: "center",
        padding: "10px 14px",
        borderTop: "1px solid var(--border-hairline)",
        fontSize: 13,
        color: "var(--text-body)",
        background: "var(--surface-card)",
        opacity: control.cancelled ? 0.62 : 1,
        animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(index, 14) * 16}ms both`,
      }}
    >
      <span style={{ color: "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>{no}</span>

      {/*
        비재원생의 합성 학번(`비재원-…`)은 내부 값이라 노출하지 않는다.
        학번은 한 줄로 — body 전역 `overflow-wrap: anywhere` 가 좁은 학번 칸에서 숫자를 두 줄로
        쪼개므로 여기서 nowrap 으로 막는다. 7자리도 이 칸 폭(50·52px) 안에 들어가 잘리지 않는다.
      */}
      <span style={{ fontFeatureSettings: '"tnum"', color: "var(--text-muted)", fontSize: 12, width: "100%", minWidth: 0, whiteSpace: "nowrap" }}>
        {guest ? faint(null) : row.sourceStudentNo}
      </span>

      {showBranchColumn && <span style={{ fontSize: 12 }}>{BRANCH_LABELS[row.branch]}</span>}

      {/* 비재원생임은 수학반·과학반·학번·단위로 이미 드러난다 — 이름 옆에 딱지를 덧붙이지 않는다. */}
      <span style={{ fontWeight: 700, color: "var(--text-strong)", fontSize: 12.5 }}>{row.name}</span>

      {/* 반명 한 칸이 아니라 서버가 준 수학반·과학반 두 칸이다. 과학반이 여럿이면 첫 이름 +N. */}
      <MathClassCell name={row.mathClassName} />
      <ScienceClassCell names={row.scienceClassNames} />
      <span style={{ fontSize: 12.5 }}>{faint(row.schoolName)}</span>
      {/* 단위는 raw 학년(row.grade)이 아니라 서버 unitName 을 그룹 라벨로 접어 찍는다. */}
      <span style={{ fontSize: 12.5 }}>{rosterUnitGroupLabel(row.unitName)}</span>
      <span style={{ fontSize: 12.5 }}>{faint(row.primaryTeacher)}</span>

      <ContactCell row={row} />

      <BookingCell
        row={row}
        control={control}
        pending={pending}
        onChangeParty={onChangeParty}
        onCancel={onCancel}
        onBook={onBook}
      />

      <EntryCell row={row} />

      <LatestLogCell row={row} onOpenEvents={onOpenEvents} />
    </div>
  );
}

/**
 * 학부모연락처 — 관리자 응답은 마스킹하지 않는다(계약 SensitiveResponse).
 * 재원생은 모/부 두 줄, 비재원생은 예약 연락처 한 줄이다. 비재원생 번호가 모인지 부인지는
 * 계약이 말하지 않으므로 **짐작해서 이름표를 붙이지 않는다**.
 */
function ContactCell({ row }: { row: SessionRosterRow }) {
  const style = { fontFeatureSettings: '"tnum"', fontSize: 11.5, lineHeight: 1.5 } as const;

  if (row.participantType === "GUEST") {
    return (
      <span style={style}>
        {row.guestContact === null ? faint(null) : <span style={{ color: "var(--text-muted)" }}>{fmtPhone(row.guestContact)}</span>}
      </span>
    );
  }

  if (row.motherPhone === null && row.fatherPhone === null) return <span style={style}>{faint(null)}</span>;

  return (
    <span style={style}>
      {row.motherPhone !== null && <span style={{ color: "var(--text-muted)" }}>모 {fmtPhone(row.motherPhone)}</span>}
      {row.motherPhone !== null && row.fatherPhone !== null && <br />}
      {row.fatherPhone !== null && <span style={{ color: "var(--text-faint)" }}>부 {fmtPhone(row.fatherPhone)}</span>}
    </span>
  );
}

/** 수학반 한 칸 — 하나뿐이라 넘치면 …로 줄이고 title 로 전체를 보인다. */
function MathClassCell({ name }: { name: string | null }) {
  if (name === null) return <span style={{ fontSize: 12.5 }}>{faint(null)}</span>;
  return (
    <span
      title={name}
      style={{ fontSize: 12.5, color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {name}
    </span>
  );
}

/**
 * 과학반 칸 — 없으면 —, 하나면 그대로, **여럿이면 첫 이름 +N** 팝업으로 보인다.
 * 세로로 이름을 쌓아 행 높이를 늘리지 않는다(지시) — 넘치는 이름은 팝업이 감당한다.
 */
function ScienceClassCell({ names }: { names: readonly string[] }) {
  if (names.length === 0) return <span style={{ fontSize: 12.5 }}>{faint(null)}</span>;
  if (names.length === 1) {
    return (
      <span
        title={names[0]}
        style={{ fontSize: 12.5, color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {names[0]}
      </span>
    );
  }
  return <SciencePopover names={names} />;
}

/**
 * 과학반이 여럿일 때의 `첫 이름 +N` 팝업.
 *
 * ★ 폭 안전: 팝업은 이름을 세로로 나열하되 `max-content`(최대 260px)로 줄바꿈하고, 셀 폭을
 *   늘리거나 행을 세로로 접지 않는다.
 * ★ hover·focus·touch 세 갈래로 연다 — 포인터는 hover, 키보드는 focus, 터치는 클릭 토글.
 *   Escape·바깥 포인터·스크롤·리사이즈로 닫는다.
 * ★ 표는 `overflow:auto` 스크롤 컨테이너 안이라 셀 안 absolute 는 잘린다 — body 포털 + fixed 로
 *   앵커해 클리핑·쌓임 문제를 피한다(스캐너와 같은 포털 방식).
 */
function SciencePopover({ names }: { names: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // 트리거→포털 팝업으로 포인터가 건너뛰는 짧은 틈에 바로 닫히지 않도록 120ms 유예를 둔다.
  const closeTimer = useRef<number | null>(null);
  const popoverId = useId();
  const first = names[0] ?? "";
  const extra = names.length - 1;

  /** 뷰포트 좌우 여백 — fixed 팝업이 화면 밖으로 삐져나가지 않게 이 안으로 가둔다. */
  const VIEWPORT_MARGIN = 8;

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  const openPopover = () => {
    cancelClose();
    const trigger = triggerRef.current;
    if (trigger !== null) {
      const rect = trigger.getBoundingClientRect();
      // 최대 320이되 뷰포트 여백을 넘지 않는 폭을 잡고, 그 폭 기준으로 중앙을 좌우 여백 안에 가둔다.
      const width = Math.min(320, window.innerWidth - VIEWPORT_MARGIN * 2);
      const half = width / 2;
      const center = rect.left + rect.width / 2;
      const left = Math.min(Math.max(center, VIEWPORT_MARGIN + half), window.innerWidth - VIEWPORT_MARGIN - half);
      setCoords({ top: rect.bottom + 6, left, width });
    }
    setOpen(true);
  };

  // 언마운트 시 남은 닫기 타이머를 정리한다.
  useEffect(() => cancelClose, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) === true || popoverRef.current?.contains(target) === true) return;
      setOpen(false);
    };
    // 표 내부 스크롤·창 크기 변경이면 앵커가 어긋난다 — 다시 계산하지 않고 닫는다.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  return (
    <span style={{ display: "inline-flex", justifyContent: "center", width: "100%", minWidth: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        aria-label={`과학반 ${names.length}개: ${names.join(", ")}`}
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClose}
        onFocus={openPopover}
        onBlur={() => setOpen(false)}
        onClick={() => (open ? setOpen(false) : openPopover())}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          maxWidth: "100%",
          minWidth: 0,
          background: "none",
          border: "none",
          padding: "2px 4px",
          borderRadius: "var(--radius-xs)",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          color: "var(--text-body)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{first}</span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-accent)",
            background: "var(--surface-brand-soft)",
            borderRadius: 999,
            padding: "1px 5px",
          }}
        >
          +{extra}
        </span>
      </button>
      {open &&
        coords !== null &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            id={popoverId}
            onMouseEnter={cancelClose}
            onPointerEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: "translateX(-50%)",
              zIndex: 200,
              minWidth: 180,
              width: coords.width,
              maxWidth: coords.width,
              padding: "9px 11px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-card)",
              border: "1px solid var(--border-hairline)",
              boxShadow: "var(--shadow-float)",
              display: "flex",
              flexDirection: "column",
              gap: 5,
              fontFamily: "var(--font-body)",
              textAlign: "left",
              animation: "ds-fade-in var(--dur-fast) var(--ease-out) both",
            }}
          >
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-faint)" }}>
              과학반 {names.length}개
            </span>
            {names.map((name, index) => (
              <span
                key={`${name}-${index}`}
                style={{ fontSize: 12, color: "var(--text-body)", lineHeight: 1.45, whiteSpace: "nowrap", wordBreak: "keep-all", overflowWrap: "normal" }}
              >
                {name}
              </span>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}

/**
 * 예약 칸의 상태 컨트롤은 한 가족이다 — 조작 가능한 native `<select>` 든, 읽기 전용 표기든
 * **같은 폭·높이·라운드·타이포·정렬**을 쓴다. 색만 상태에 따라 갈린다. 아래 base 와 tone 이
 * 그 유일한 출처라, 드랍다운과 읽기 전용이 따로 놀지 않게 막는다. (상호작용/의미 차이는
 * 그대로다 — 읽기 전용은 절대 조작 가능한 컨트롤이 되지 않는다.)
 */
const STATUS_CONTROL_BASE = {
  width: "100%",
  boxSizing: "border-box",
  height: 30,
  padding: "0 6px",
  lineHeight: 1,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-soft)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 600,
  textAlign: "center",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

type StatusControlTone = "empty" | "booked" | "cancelled" | "checkedIn" | "noShow";

/** 상태별 배경·글자·테두리 색 — 드랍다운과 읽기 전용 표기가 공유하는 유일한 색 출처. */
function statusControlColors(tone: StatusControlTone): { background: string; color: string; borderColor: string } {
  switch (tone) {
    case "cancelled":
      return { background: "var(--status-danger-soft)", color: "var(--status-danger)", borderColor: "var(--status-danger-soft)" };
    case "checkedIn":
      return { background: "var(--surface-brand-soft)", color: "var(--text-accent)", borderColor: "var(--border-soft)" };
    case "booked":
      return { background: "var(--surface-brand-soft)", color: "var(--text-strong)", borderColor: "var(--border-soft)" };
    case "noShow":
      return { background: "var(--surface-sunken)", color: "var(--text-muted)", borderColor: "var(--border-soft)" };
    case "empty":
    default:
      return { background: "var(--surface-card)", color: "var(--text-strong)", borderColor: "var(--border-soft)" };
  }
}

/**
 * 예약 칸 — 서버가 허락하는 조작만 연다.
 * 입장 완료·미참석처럼 서버가 변경을 막는 상태에서는 드랍다운 자체를 주지 않는다.
 */
function BookingCell({
  row,
  control,
  pending,
  onChangeParty,
  onCancel,
  onBook,
}: {
  row: SessionRosterRow;
  control: RosterBookingControl;
  pending: boolean;
  onChangeParty: (row: SessionRosterRow, party: AttendanceParty) => void;
  onCancel: (row: SessionRosterRow) => void;
  onBook: (row: SessionRosterRow, party: AttendanceParty | null) => void;
}) {
  if (control.readOnly) {
    if (control.readOnlyLabel === ROSTER_BOOKING_LABELS.none) {
      return <span style={{ color: "var(--text-faint)", fontSize: 12.5 }}>{ROSTER_BOOKING_LABELS.none}</span>;
    }
    // 읽기 전용 표기도 드랍다운과 같은 컨트롤 문법을 쓴다 — 단, 상호작용은 절대 열지 않는다.
    const tone: StatusControlTone = control.cancelled
      ? "cancelled"
      : control.readOnlyLabel === ROSTER_BOOKING_LABELS.checkedIn
        ? "checkedIn"
        : control.readOnlyLabel === "미참석"
          ? "noShow"
          : "booked";
    const colors = statusControlColors(tone);
    const box = (
      <span style={{ ...STATUS_CONTROL_BASE, ...colors }}>{control.readOnlyLabel}</span>
    );
    if (control.blockedReason === null) return box;
    // 막힌 이유가 있으면 회색으로 죽여 놓지 않고 왜인지 말한다 — 되는 척도, 침묵도 아니다.
    return (
      <span title={control.blockedReason} style={{ display: "block" }}>
        {box}
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          {control.blockedReason}
        </span>
      </span>
    );
  }

  const selectTone: StatusControlTone = control.cancelled ? "cancelled" : row.booking === null ? "empty" : "booked";
  const selectColors = statusControlColors(selectTone);

  return (
    <select
      aria-label={`${row.name} 예약`}
      disabled={pending}
      value={control.value}
      onChange={(event) => {
        const action = rosterBookingActionOf(control, event.target.value);
        // 칸은 언제나 **서버 상태**를 보여 준다 — 고른 값은 의도일 뿐 아직 사실이 아니다.
        // 되돌려 두지 않으면 대화상자를 닫거나 실패했을 때 칸만 거짓말을 하고 남는다.
        event.target.value = control.value;
        if (action === null || action.kind === "none") return;
        if (action.kind === "cancel") {
          onCancel(row);
          return;
        }
        if (action.kind === "manual") {
          onBook(row, null);
          return;
        }
        // 참석 선택: 바꿀 활성 집계가 있으면 PATCH, 없으면 **새 집계**다.
        // 후자는 대표 연락처·경로·사유를 대화상자가 명시적으로 받아야 하므로 API 호출이 아니다.
        if (rosterHasActiveBooking(row)) onChangeParty(row, action.party);
        else onBook(row, action.party);
      }}
      style={{
        ...STATUS_CONTROL_BASE,
        ...selectColors,
        cursor: pending ? "progress" : "pointer",
        textAlignLast: "center",
      }}
    >
      {control.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** 입장 — 예약이 말해 주는 사실만. 스캐너 번호는 계약이 주지 않으므로 지어내지 않는다. */
function EntryCell({ row }: { row: SessionRosterRow }) {
  const booking = row.booking;

  if (booking !== null && booking.checkedInAt !== null) {
    return (
      <span style={{ fontSize: 11.5, lineHeight: 1.5, fontFeatureSettings: '"tnum"' }}>
        <b style={{ color: "var(--status-success)", fontWeight: 700 }}>입장</b>
        <br />
        <span style={{ color: "var(--text-muted)" }}>{at(booking.checkedInAt)}</span>
      </span>
    );
  }

  if (booking !== null && (booking.status === "RESERVED" || booking.status === "NO_SHOW")) {
    return <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>대기</span>;
  }

  return <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>—</span>;
}

/**
 * 최신 로그 — 서버가 붙인 문구와 시각을 그대로 인라인으로 보여 주고, 누르면 전체 이력을 연다.
 * 여기서 이력을 미리 읽지 않는다 — 셀은 트리거일 뿐이다(행마다 읽으면 곧 N+1).
 */
function LatestLogCell({ row, onOpenEvents }: { row: SessionRosterRow; onOpenEvents: (row: SessionRosterRow) => void }) {
  const latest = row.latestOperationalEvent;
  if (latest === null) return <span style={{ color: "var(--text-faint)", fontSize: 12.5 }}>—</span>;

  /** 취소 뒤 재예약이면 이력이 여러 예약에 걸쳐 있다 — 그 사실을 셀에서도 알린다. */
  const extra = row.bookingHistory.length - 1;

  return (
    <button
      type="button"
      onClick={() => onOpenEvents(row)}
      aria-label={`${row.name} 예약 이력 열기 — ${latest.label} ${at(latest.occurredAt)}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        alignItems: "center",
        width: "100%",
        background: "none",
        border: "none",
        borderRadius: "var(--radius-xs)",
        padding: "4px 2px",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontFeatureSettings: '"tnum"',
        textAlign: "center",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
        <b style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-body)" }}>{latest.label}</b>
        {extra > 0 && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-faint)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--border-hairline)",
              borderRadius: 999,
              padding: "1px 6px",
            }}
          >
            예약 {row.bookingHistory.length}건
          </span>
        )}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{at(latest.occurredAt)}</span>
    </button>
  );
}

/* ── 확인 (참석 학부모 변경 · 취소) ─────────────────────────────────────── */

function ConfirmRequestDialog({
  request,
  siblings,
  pending,
  onClose,
  onConfirm,
}: {
  request: PendingRequest;
  siblings: readonly SessionRosterRow[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (result: ConfirmResult) => void;
}) {
  const cancelling = request.kind === "cancel";
  const [reason, setReason] = useState("");
  const [cancellationType, setCancellationType] = useState<AdminCancellationType>("PHONE");

  // 참석 변경은 자유 사유가 필수다. 취소는 정해진 갈래 하나를 고르므로 언제나 유효하다.
  const valid = cancelling ? true : isValidBookingReason(reason);

  return (
    <Dialog
      open
      onClose={onClose}
      title={cancelling ? "예약 취소" : "참석 학부모 변경"}
      width={440}
      footer={
        <Fragment>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button
            variant={cancelling ? "danger" : "primary"}
            disabled={!valid || pending}
            onClick={() =>
              onConfirm(
                cancelling
                  ? { kind: "cancel", cancellationType }
                  : { kind: "party", reason: reason.trim() },
              )
            }
          >
            {pending ? "처리 중…" : cancelling ? "취소하기" : "변경하기"}
          </Button>
        </Fragment>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
          <b>{request.row.name}</b> 학생이 속한 <b>가족 예약 한 건</b>에 적용돼요.
          {request.kind === "party" && ` 참석 학부모를 ${ATTENDANCE_PARTY_LABELS[request.party]}(으)로 바꿔요.`}
          {cancelling && " 취소해도 기록은 지워지지 않아요 — 좌석이 반환되고 QR 이 폐기돼요."}
        </p>

        {/* 형제는 각자 행이지만 예약은 하나다 — 조작이 누구에게까지 걸리는지 먼저 말한다. */}
        {siblings.length > 0 && (
          <p
            role="note"
            style={{
              margin: 0,
              padding: "10px 12px",
              borderRadius: "var(--radius-xs)",
              background: "var(--status-warning-soft)",
              fontSize: 12,
              color: "var(--text-body)",
              lineHeight: 1.55,
            }}
          >
            이 예약에는 <b>{siblings.map((sibling) => sibling.name).join(", ")}</b> 학생도 함께 묶여 있어요 — 가족 예약이라
            변경·취소가 그 학생들에게도 똑같이 적용돼요.
          </p>
        )}

        {cancelling ? (
          // 관리자 취소는 자유 사유가 아니라 계약이 정한 취소 갈래 하나다 — 전화·선생님·기타.
          <Field label="취소 유형">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ADMIN_CANCELLATION_TYPE_OPTIONS.map((option) => (
                <Tag
                  key={option.value}
                  selected={cancellationType === option.value}
                  onClick={() => setCancellationType(option.value)}
                  style={{ height: 34 }}
                >
                  {option.label}
                </Tag>
              ))}
            </div>
          </Field>
        ) : (
          <Input label="사유 *" placeholder="3자 이상 — 기록에 남아요" value={reason} onChange={setReason} hint={`${reason.trim().length}/500`} />
        )}
      </div>
    </Dialog>
  );
}

/* ── 재원생 수동 예약 (신규 · 취소 후 재예약) ──────────────────────────── */

function ManualBookingDialog({
  row,
  initialParty,
  option,
  candidates,
  pending,
  onClose,
  onSubmit,
}: {
  row: SessionRosterRow;
  /** 드랍다운에서 참석을 골라 열었으면 그 값. `수동 예약`으로 열었으면 null. */
  initialParty: AttendanceParty | null;
  option: SeminarSessionOption;
  candidates: readonly SessionRosterRow[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: {
    seminarSessionId: string;
    contact: string;
    attendanceParty: AttendanceParty;
    bookingSource: AdminBookingSource;
    studentIds: string[];
  }) => void;
}) {
  const contacts = rosterContactChoices(row);
  // 후보가 하나뿐이면 고를 것이 없으니 미리 고른다. 둘이면 **비워 둔다** — 모/부 중 어느 쪽이
  // 대표인지는 화면이 짐작할 수 없고, 참석이 모+부(BOTH)여도 대표는 여전히 한쪽이다.
  const [contact, setContact] = useState<RosterContactChoice | null>(contacts.length === 1 ? contacts[0]! : null);
  // 드랍다운에서 `예약 (모/부)` 를 골라 왔으면 참석은 이미 정해졌다 — 대표 연락처는 아니다.
  const [party, setParty] = useState<AttendanceParty | null>(initialParty);
  const [source, setSource] = useState<AdminBookingSource>("PHONE");
  const [withSiblings, setWithSiblings] = useState<string[]>([]);

  const rebooking = row.booking?.status === "CANCELLED";

  // 취소된 재원생 가족의 재예약 — 명단에 안 보이는 형제까지 함께 담아야 하므로, 대화상자를 연
  // 지금(클릭) 그 취소된 집계 1건을 불러 재원생 전부를 끌어온다. 신규 예약이면 부르지 않는다.
  const familyRebook = useCancelledFamilyRebook(
    rebooking && row.booking !== null ? row.booking.familyBookingId : null,
    row.studentId,
  );

  // 신규(booking===null) 예약에서만 같은 대표 연락처의 형제를 체크박스로 고른다.
  // 재예약은 취소된 집계에서 재원생 전원을 고정으로 담으므로 이 후보를 쓰지 않는다.
  const siblings = rebooking || contact === null ? [] : enrolledBookingCandidates(candidates, row, contact.contact);

  // 보낼 studentIds: 재예약이면 취소된 가족 전원(선택 행이 맨 앞, 중복 제거), 신규면 선택 행 + 고른 형제.
  const studentIds =
    row.studentId === null ? null : rebooking ? familyRebook.studentIds : [row.studentId, ...withSiblings];

  const valid = contact !== null && party !== null && studentIds !== null && studentIds.length > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={rebooking ? "다시 예약" : "수동 예약"}
      width={470}
      footer={
        <Fragment>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={!valid || pending}
            icon={<Icons.plus size={15} />}
            onClick={() => {
              if (contact === null || party === null || studentIds === null) return;
              onSubmit({
                seminarSessionId: option.session.seminarSessionId,
                contact: contact.contact,
                attendanceParty: party,
                bookingSource: source,
                studentIds,
              });
            }}
          >
            {pending ? "예약 중…" : "예약"}
          </Button>
        </Fragment>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
          <b>{row.name}</b>({row.representativeClassName}) 학생을 <b>{sessionLabel(option)}</b> 회차에 예약해요.
          {rebooking && " 취소된 기록은 그대로 남고 새 예약이 만들어져요."}
        </p>

        {contacts.length === 0 ? (
          // 연락처가 없으면 서버가 소유 검증을 통과시킬 방법이 없다 — 되는 척하지 않는다.
          <p role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: "var(--radius-xs)", background: "var(--status-danger-soft)", fontSize: 12, color: "var(--status-danger)", lineHeight: 1.55 }}>
            이 학생은 저장된 학부모 연락처가 없어 여기서 예약할 수 없어요. 학생 정보를 먼저 동기화해 주세요.
          </p>
        ) : (
          <Field label="대표 연락처 *" hint="예약 소유를 확인하는 번호예요 — 참석이 모/부여도 대표는 한쪽이에요.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {contacts.map((choice) => (
                <Tag
                  key={choice.party}
                  selected={contact?.party === choice.party}
                  onClick={() => {
                    setContact(choice);
                    // 연락처가 바뀌면 형제 후보 자체가 달라진다 — 고른 것을 들고 가지 않는다.
                    setWithSiblings([]);
                  }}
                  style={{ height: 34 }}
                >
                  {choice.label} {fmtPhone(choice.contact)}
                </Tag>
              ))}
            </div>
          </Field>
        )}

        <Field label="참석 학부모 *">
          <div style={{ display: "flex", gap: 8 }}>
            {PARTY_OPTIONS.map((p) => (
              <Tag key={p.value} selected={party === p.value} onClick={() => setParty(p.value)} style={{ height: 34, minWidth: 64, justifyContent: "center" }}>
                {p.label}
              </Tag>
            ))}
          </div>
        </Field>

        {/*
          취소된 재원생 가족 재예약 — 형제를 고르는 게 아니라 취소된 집계의 재원생 **전원**을
          함께 담는다. 일부만 다시 예약하면 나머지 형제가 나중에 ACTIVE_FAMILY_BOOKING_EXISTS 로
          막히기 때문이다. 명단에 안 보이는 형제도 포함되므로 몇 명인지 밝힌다.
        */}
        {rebooking && (
          <>
            {familyRebook.loading && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55 }}>
                취소된 예약의 가족 구성을 불러오는 중이에요…
              </p>
            )}
            {familyRebook.error !== null && (
              <p
                role="alert"
                style={{ margin: 0, padding: "10px 12px", borderRadius: "var(--radius-xs)", background: "var(--status-danger-soft)", fontSize: 12, color: "var(--status-danger)", lineHeight: 1.55 }}
              >
                {familyRebook.error}
              </p>
            )}
            {familyRebook.studentIds !== null && (
              <p
                role="note"
                style={{ margin: 0, padding: "10px 12px", borderRadius: "var(--radius-xs)", background: "var(--status-warning-soft)", fontSize: 12, color: "var(--text-body)", lineHeight: 1.55 }}
              >
                이 취소된 가족 예약의 재원생 <b>{familyRebook.studentIds.length}명</b>을 한 예약으로 함께 다시
                예약해요 — 명단에 보이지 않는 다른 페이지의 형제도 포함돼요. 일부만 예약하면 나머지 형제가
                뒤에 막혀요.
              </p>
            )}
          </>
        )}

        {siblings.length > 0 && (
          <Field
            label="함께 예약할 형제"
            hint="한 연락처에는 회차당 예약이 하나예요 — 따로 예약하면 서버가 거절해요."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {siblings.map((sibling) => (
                <label key={sibling.rosterEntryId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={sibling.studentId !== null && withSiblings.includes(sibling.studentId)}
                    onChange={(event) =>
                      setWithSiblings((previous) =>
                        sibling.studentId === null
                          ? previous
                          : event.target.checked
                            ? [...previous, sibling.studentId]
                            : previous.filter((id) => id !== sibling.studentId),
                      )
                    }
                  />
                  <span>
                    {sibling.name} · {sibling.representativeClassName}
                  </span>
                </label>
              ))}
            </div>
          </Field>
        )}

        <Field label="예약 경로 *">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SOURCE_OPTIONS.map((value) => (
              <Tag key={value} selected={source === value} onClick={() => setSource(value)} style={{ height: 34 }}>
                {ADMIN_BOOKING_SOURCE_LABELS[value]}
              </Tag>
            ))}
          </div>
        </Field>

        {/* 자유 사유는 받지 않는다 — 서버가 예약 경로로 감사 사유를 파생한다. */}
      </div>
    </Dialog>
  );
}

/* ── 비재원생 수동 추가 · 취소된 비재원생 재예약 ──────────────────────── */

/**
 * 비재원생 새 집계 대화상자 — 두 곳에서 쓴다.
 *
 * 1. 전역 `+ 비재원생 수동 추가` — `prefill: null`. 명단에 없는 사람을 처음부터 받는다.
 * 2. 취소된 비재원생 행의 재예약 — `prefill` 이 그 행의 이름·분원·학교·학년·연락처다.
 *    옛 집계를 되살리는 게 아니라 같은 값으로 **새 집계**를 만든다(계약에 되살리기가 없다).
 *    밑값은 잠기지 않는다 — 잘못 남아 있는 값을 고쳐 보낼 수 있어야 한다.
 */
function GuestDialog({
  option,
  prefill = null,
  initialParty = null,
  pending,
  onClose,
  onSubmit,
}: {
  option: SeminarSessionOption;
  prefill?: RosterGuestRebookPrefill | null;
  /** 드랍다운에서 참석을 골라 열었을 때만 채워진다. */
  initialParty?: AttendanceParty | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: {
    seminarSessionId: string;
    contact: string;
    attendanceParty: AttendanceParty;
    bookingSource: AdminBookingSource;
    guest: PublicGuestParticipantInput;
  }) => void;
}) {
  const sessionBranch = option.session.branch;
  const rebooking = prefill !== null;
  const [form, setForm] = useState({
    name: prefill?.guest.name ?? "",
    contact: prefill?.contact ?? "",
    schoolName: prefill?.guest.schoolName ?? "",
    grade: prefill?.guest.grade ?? "",
    branch: (sessionBranch ?? prefill?.guest.branch ?? "SONGPA") as Branch,
    party: initialParty ?? ("MOTHER" as AttendanceParty),
    source: "PHONE" as AdminBookingSource,
  });

  // BRANCH 회차는 그 분원만 받는다 — 고를 여지를 주면 서버가 409 로 거절할 뿐이다.
  const branchLocked = sessionBranch !== null;
  const contactOk = form.contact.trim().length >= 8 && form.contact.trim().length <= 40;
  // 계약: 비재원 guest 는 학교·학년(정확한 enum)이 모두 필수다.
  const schoolOk = form.schoolName.trim() !== "";
  const gradeOk = form.grade !== "";
  // 비재원생 수동 추가는 자유 사유를 받지 않는다 — reason 은 아예 보내지 않고 서버가 예약
  // 경로로 감사 사유를 파생한다(지어낸 값을 채우지 않는다).
  const valid = form.name.trim() !== "" && contactOk && schoolOk && gradeOk;

  return (
    <Dialog
      open
      onClose={onClose}
      title={rebooking ? "비재원생 다시 예약" : "비재원생 수동 추가"}
      width={480}
      footer={
        <Fragment>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={!valid || pending}
            icon={<Icons.plus size={15} />}
            onClick={() =>
              onSubmit({
                seminarSessionId: option.session.seminarSessionId,
                contact: form.contact.trim(),
                attendanceParty: form.party,
                bookingSource: form.source,
                guest: {
                  name: form.name.trim(),
                  branch: form.branch,
                  schoolName: form.schoolName.trim(),
                  grade: form.grade as GuestGrade,
                },
              })
            }
          >
            {pending ? (rebooking ? "예약 중…" : "추가 중…") : rebooking ? "예약" : "추가"}
          </Button>
        </Fragment>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
          {rebooking ? (
            <>
              <b>{form.name || "이 학생"}</b> 학생을 <b>{sessionLabel(option)}</b> 회차에 <b>새 예약</b>으로 등록해요 —
              명단 행에 남아 있던 값을 채워 뒀어요. 취소된 기록은 그대로 남고 새 예약이 만들어져요.
            </>
          ) : (
            <>
              <b>{sessionLabel(option)}</b> 회차의 <b>비재원생</b> 예약으로 등록돼요 — 재원생은 이 경로가 아니라 명단
              행의 <b>수동 예약</b>에서 추가해요.
            </>
          )}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="이름 *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="학부모 연락처 *" placeholder="010-0000-0000" value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} />
          <Input label="학교 *" value={form.schoolName} onChange={(v) => setForm({ ...form, schoolName: v })} />
          {/* 계약 grade 는 초1~고3 정확한 enum 이라 자유 입력이 아니라 Select 로 받는다. */}
          <Select
            label="학년 *"
            placeholder="선택"
            options={GUEST_GRADE_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
            value={form.grade}
            onChange={(v) => setForm({ ...form, grade: v })}
          />
        </div>

        {branchLocked ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
            캠퍼스 <b>{BRANCH_LABELS[sessionBranch]}</b> — 이 회차는 해당 캠퍼스 전용이에요.
          </p>
        ) : (
          <Select
            label="캠퍼스 *"
            options={BRANCH_OPTIONS.map((b) => ({ value: b.value, label: b.label }))}
            value={form.branch}
            onChange={(v) => setForm({ ...form, branch: v as Branch })}
          />
        )}

        <Field label="참석 학부모">
          <div style={{ display: "flex", gap: 8 }}>
            {PARTY_OPTIONS.map((p) => (
              <Tag key={p.value} selected={form.party === p.value} onClick={() => setForm({ ...form, party: p.value })} style={{ height: 34, minWidth: 64, justifyContent: "center" }}>
                {p.label}
              </Tag>
            ))}
          </div>
        </Field>

        <Field label="예약 경로">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SOURCE_OPTIONS.map((source) => (
              <Tag key={source} selected={form.source === source} onClick={() => setForm({ ...form, source })} style={{ height: 34 }}>
                {ADMIN_BOOKING_SOURCE_LABELS[source]}
              </Tag>
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-strong)" }}>{label}</span>
      {hint !== undefined && <span style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.5 }}>{hint}</span>}
      {children}
    </div>
  );
}

/* ── 재원생 추가 (활성 재원생 검색 → 새 가족 예약) ─────────────────────── */

/** 후보의 수학반·과학반을 한 줄로 — 과학반이 여럿이면 첫 이름 +N 로 접는다(검색 목록·요약 공용). */
function candidateClassSummary(candidate: EnrolledStudentCandidate): string {
  const math = candidate.mathClassName ?? "—";
  const science =
    candidate.scienceClassNames.length === 0
      ? "—"
      : candidate.scienceClassNames.length === 1
        ? candidate.scienceClassNames[0]!
        : `${candidate.scienceClassNames[0]} +${candidate.scienceClassNames.length - 1}`;
  return `수학반 ${math} · 과학반 ${science}`;
}

/**
 * 상단 `수동 추가 › 재원생 추가` — 활성 재원생을 검색해 새 가족 예약을 만든다.
 *
 * 흐름: 이름·학교·학번·연락처 뒤 4자리로 검색(디바운스) → 대표 학생 하나 선택(이미 활성/입장
 * 예약이 있는 학생은 비활성) → 대표 연락처·참석·예약 경로 선택 → 같은 연락처 형제(선택, 총
 * 1~10) → 예약. 자유 사유는 받지 않는다(서버가 예약 경로로 파생). 중복은 서버가 최종 판정한다.
 *
 * ★ 연락처는 write-only 다 — 대표 연락처·형제 매칭에만 쓰고 저장·로깅하지 않는다.
 */
function EnrolledSearchDialog({
  option,
  branch,
  pending,
  onClose,
  onSubmit,
}: {
  option: SeminarSessionOption;
  /** 상단에서 캠퍼스를 골랐으면 그 범위로 검색을 좁힌다. */
  branch: Branch | undefined;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: {
    seminarSessionId: string;
    contact: string;
    attendanceParty: AttendanceParty;
    bookingSource: AdminBookingSource;
    studentIds: string[];
  }) => void;
}) {
  const sessionId = option.session.seminarSessionId;
  const [term, setTerm] = useState("");
  const [primary, setPrimary] = useState<EnrolledStudentCandidate | null>(null);
  const [contact, setContact] = useState<EnrolledContactChoice | null>(null);
  const [party, setParty] = useState<AttendanceParty | null>(null);
  const [source, setSource] = useState<AdminBookingSource>("PHONE");
  const [siblingIds, setSiblingIds] = useState<string[]>([]);

  const search = useEnrolledStudentSearch({ sessionId, branch, term });
  const siblingLookup = useSameContactSiblings({
    sessionId,
    branch,
    contact: contact?.contact ?? null,
    primaryStudentId: primary?.studentId ?? null,
  });

  // 대표를 바꾸면 그 아래 선택(연락처·형제)은 근거가 사라진다 — 함께 비운다. 연락처가 하나뿐이면
  // 고를 것이 없으니 미리 고른다(둘이면 모/부 중 어느 쪽이 대표인지 화면이 짐작하지 않는다).
  const choosePrimary = (candidate: EnrolledStudentCandidate) => {
    const choices = candidateContactChoices(candidate);
    setPrimary(candidate);
    setContact(choices.length === 1 ? choices[0]! : null);
    setSiblingIds([]);
  };

  const resetPrimary = () => {
    setPrimary(null);
    setContact(null);
    setSiblingIds([]);
  };

  const contactChoices = primary === null ? [] : candidateContactChoices(primary);
  const totalStudents = 1 + siblingIds.length;
  const valid =
    primary !== null &&
    !candidateAlreadyBooked(primary) &&
    contact !== null &&
    party !== null &&
    totalStudents <= ENROLLED_BOOKING_MAX_STUDENTS;

  const toggleSibling = (studentId: string, checked: boolean) => {
    setSiblingIds((previous) => {
      if (!checked) return previous.filter((id) => id !== studentId);
      if (previous.includes(studentId)) return previous;
      // 대표 1명을 포함해 10명을 넘기지 않는다 — 서버 상한과 같다.
      if (1 + previous.length >= ENROLLED_BOOKING_MAX_STUDENTS) return previous;
      return [...previous, studentId];
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="재원생 추가"
      width={520}
      footer={
        <Fragment>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={!valid || pending}
            icon={<Icons.plus size={15} />}
            onClick={() => {
              if (primary === null || contact === null || party === null) return;
              onSubmit({
                seminarSessionId: sessionId,
                contact: contact.contact,
                attendanceParty: party,
                bookingSource: source,
                studentIds: [primary.studentId, ...siblingIds],
              });
            }}
          >
            {pending ? "예약 중…" : "예약"}
          </Button>
        </Fragment>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
          <b>{sessionLabel(option)}</b> 회차에 <b>재원생</b>을 예약해요 — 활성 재원생을 검색해 대표 학생을 고르세요.
          비재원생은 <b>수동 추가 › 비재원생 추가</b>에서 받아요.
        </p>

        {primary === null ? (
          <>
            <Field
              label="학생 검색 *"
              hint="이름·학교·학번·연락처 뒤 4자리로 찾아요. 이미 예약된 학생은 고를 수 없어요."
            >
              <Input
                placeholder="이름·학교·학번·연락처 뒤 4자리"
                value={term}
                onChange={setTerm}
                icon={<Icons.search size={15} />}
              />
            </Field>

            <div
              role="listbox"
              aria-label="검색 결과"
              aria-busy={search.loading}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 300,
                overflowY: "auto",
                minHeight: 96,
              }}
            >
              {search.loading && <EmptyState>재원생을 검색하는 중이에요…</EmptyState>}

              {!search.loading && search.error !== null && (
                <p
                  role="alert"
                  style={{ margin: 0, padding: "10px 12px", borderRadius: "var(--radius-xs)", background: "var(--status-danger-soft)", fontSize: 12, color: "var(--status-danger)", lineHeight: 1.55 }}
                >
                  {search.error}
                </p>
              )}

              {!search.loading && search.error === null && search.candidates.length === 0 && (
                <EmptyState>조건에 맞는 활성 재원생이 없어요.</EmptyState>
              )}

              {!search.loading &&
                search.error === null &&
                search.candidates.map((candidate) => {
                  const booked = candidateAlreadyBooked(candidate);
                  const statusLabel =
                    candidate.reservationStatus === "CHECKED_IN" ? "입장 완료" : booked ? "예약됨" : null;
                  return (
                    <button
                      key={candidate.studentId}
                      type="button"
                      role="option"
                      aria-selected={false}
                      aria-disabled={booked}
                      disabled={booked}
                      onClick={() => choosePrimary(candidate)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        padding: "9px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-hairline)",
                        background: "var(--surface-card)",
                        cursor: booked ? "not-allowed" : "pointer",
                        opacity: booked ? 0.55 : 1,
                        fontFamily: "var(--font-body)",
                        transition: "border var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
                      }}
                      onMouseEnter={(event) => {
                        if (!booked) event.currentTarget.style.borderColor = "var(--violet-600)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.borderColor = "var(--border-hairline)";
                      }}
                    >
                      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                          <b style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>{candidate.name}</b>
                          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                            {candidate.schoolName ?? "학교 미정"}
                            {candidate.grade !== null && ` · ${candidate.grade}`}
                            {` · ${candidate.sourceStudentNo}`}
                          </span>
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{candidateClassSummary(candidate)}</span>
                      </span>
                      {statusLabel !== null && (
                        <Badge tone="neutral" size="sm" style={{ flexShrink: 0 }}>
                          {statusLabel}
                        </Badge>
                      )}
                    </button>
                  );
                })}

              {!search.loading && search.error === null && search.hasMore && (
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5, textAlign: "center" }}>
                  검색 결과가 많아 일부만 보여요 (전체 {search.totalItems.toLocaleString("ko-KR")}명) — 더 좁혀 주세요.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 고른 대표 학생 — 다시 고르면 아래 선택이 전부 초기화된다. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-soft)",
                background: "var(--surface-brand-soft)",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <b style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-strong)" }}>{primary.name}</b>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {primary.schoolName ?? "학교 미정"}
                  {primary.grade !== null && ` · ${primary.grade}`} · {candidateClassSummary(primary)}
                </span>
              </span>
              <Button variant="secondary" size="sm" onClick={resetPrimary}>
                다시 선택
              </Button>
            </div>

            {contactChoices.length === 0 ? (
              <p
                role="alert"
                style={{ margin: 0, padding: "10px 12px", borderRadius: "var(--radius-xs)", background: "var(--status-danger-soft)", fontSize: 12, color: "var(--status-danger)", lineHeight: 1.55 }}
              >
                이 학생은 저장된 학부모 연락처가 없어 여기서 예약할 수 없어요. 학생 정보를 먼저 동기화해 주세요.
              </p>
            ) : (
              <Field label="대표 연락처 *" hint="예약 소유를 확인하는 번호예요 — 참석이 모/부여도 대표는 한쪽이에요.">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {contactChoices.map((choice) => (
                    <Tag
                      key={choice.party}
                      selected={contact?.party === choice.party}
                      onClick={() => {
                        setContact(choice);
                        // 연락처가 바뀌면 형제 후보 자체가 달라진다 — 고른 것을 들고 가지 않는다.
                        setSiblingIds([]);
                      }}
                      style={{ height: 34 }}
                    >
                      {choice.label} {fmtPhone(choice.contact)}
                    </Tag>
                  ))}
                </div>
              </Field>
            )}

            <Field label="참석 학부모 *">
              <div style={{ display: "flex", gap: 8 }}>
                {PARTY_OPTIONS.map((p) => (
                  <Tag key={p.value} selected={party === p.value} onClick={() => setParty(p.value)} style={{ height: 34, minWidth: 64, justifyContent: "center" }}>
                    {p.label}
                  </Tag>
                ))}
              </div>
            </Field>

            <Field label="예약 경로 *">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SOURCE_OPTIONS.map((value) => (
                  <Tag key={value} selected={source === value} onClick={() => setSource(value)} style={{ height: 34 }}>
                    {ADMIN_BOOKING_SOURCE_LABELS[value]}
                  </Tag>
                ))}
              </div>
            </Field>

            {/* 같은 연락처 형제 — 선택. 한 회차·한 연락처에 예약은 하나뿐이라 함께 담아야 한다. */}
            {contact !== null && (
              <Field
                label="함께 예약할 형제"
                hint={`같은 연락처의 재원생을 함께 담아요 — 한 연락처엔 회차당 예약이 하나예요. 총 ${ENROLLED_BOOKING_MAX_STUDENTS}명까지.`}
              >
                {siblingLookup.loading && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>같은 연락처의 형제를 찾는 중이에요…</p>
                )}
                {siblingLookup.error !== null && (
                  <p
                    role="alert"
                    style={{ margin: 0, padding: "8px 10px", borderRadius: "var(--radius-xs)", background: "var(--status-danger-soft)", fontSize: 12, color: "var(--status-danger)" }}
                  >
                    {siblingLookup.error}
                  </p>
                )}
                {!siblingLookup.loading && siblingLookup.error === null && siblingLookup.siblings.length === 0 && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>같은 연락처를 쓰는 다른 재원생이 없어요.</p>
                )}
                {siblingLookup.siblings.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {siblingLookup.siblings.map((sibling) => {
                      const checked = siblingIds.includes(sibling.studentId);
                      const capReached = !checked && 1 + siblingIds.length >= ENROLLED_BOOKING_MAX_STUDENTS;
                      return (
                        <label
                          key={sibling.studentId}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12.5,
                            cursor: capReached ? "not-allowed" : "pointer",
                            opacity: capReached ? 0.5 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={capReached}
                            onChange={(event) => toggleSibling(sibling.studentId, event.target.checked)}
                          />
                          <span>
                            {sibling.name}
                            {sibling.mathClassName !== null && ` · ${sibling.mathClassName}`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                  총 <b>{totalStudents}</b>명 (최대 {ENROLLED_BOOKING_MAX_STUDENTS})
                </span>
              </Field>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
