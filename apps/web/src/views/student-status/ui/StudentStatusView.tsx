"use client";

/**
 * 학생 현황 — 원천에서 동기화된 재원생 명부와 그 동기화 상태 (계약 tags: Admin students /
 * Admin student sync). 예약 명단(`/students`)과 겹치지 않는다: 여기는 "명부가 최신인가",
 * 저기는 "이 설명회에 누가 예약했나"다.
 *
 * 데이터 규율 — 이 화면이 말할 수 있는 것만 말한다:
 * - 이 화면은 재원(active) 명부다 — 목록 요청은 사용자 필터와 무관하게 늘 sourceActive:true 다.
 * - 요약 카드 4개는 서버가 센 분류 집계(summary)를 그대로 그린다. 재원생·수학 정규반·과학
 *   정규반 셋은 **분원(branch)+단위(unitGroup)+sourceActive:true** 범위라 **단위 탭을 바꾸면
 *   함께 바뀐다**. 확인 필요 하나만 **분원 범위만**이라 단위를 바꿔도 그대로다. 검색어(q)·담임·
 *   페이지 등 나머지 필터는 넷 다 의도적으로 무시한다(브라우징 중 헤더 안정). 반면 페이지 하단의
 *   "총 N명"(page.totalItems)과 items 는 그 모든 필터가 걸린 결과다. 클라이언트는 요약을 다시
 *   세거나 별도 요청을 더 쏘지 않고 서버 값을 그대로 그린다.
 * - 계약에 **다음 동기화 예정 시각이 없다**. 그래서 주기(6시간)만 말하고 시각은 짓지 않는다.
 * - 분원별 상태는 마지막 실행 기록 안에만 있다. 기록이 없으면 없다고 말한다.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BRANCH_LABELS,
  BRANCH_SYNC_STATUS_LABELS,
  campusScopedLabel,
  isBranchSyncFailed,
  isBranchSyncSettled,
  resolveHomeroomTeacher,
  resolveStudentSummaryCounts,
  reviewReasonLabel,
  rosterUnitGroupLabel,
  studentReservationLabel,
  SYNC_RUN_STATUS_LABELS,
  type AdminStudent,
  type AdminStudentCanonicalTeacher,
  type AdminStudentReservation,
  type Branch,
  type BranchSyncRun,
  type ReviewRequiredStudent,
  type RosterUnitGroup,
  type SeminarSessionOption,
} from "@/shared/api";
import {
  buildTeacherOptions,
  STUDENT_PAGE_SIZE,
  useAdminStudents,
  useReviewRequiredStudents,
  useStudentSync,
  type ReviewRequiredState,
} from "@/features/student-sync";
import { useSeminarSessions } from "@/features/admin-overview";
import { fmtDateTimeShort, fmtSessionDate } from "@/shared/lib/format";
import { fmtPhone } from "@/shared/lib/phone";
import { Button, Card, Icons, Input, Select, Tag } from "@/shared/ui";
import { EmptyState, StatCard } from "@/shared/ui";
import {
  computeSciencePopupPosition,
  SCIENCE_POPUP_MARGIN,
  type SciencePopupPosition,
} from "../lib/science-popup-position";

const BRANCH_TABS: ReadonlyArray<{ value: Branch | "ALL"; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "SONGPA", label: BRANCH_LABELS.SONGPA },
  { value: "WIRYE", label: BRANCH_LABELS.WIRYE },
  { value: "GWANGJIN", label: BRANCH_LABELS.GWANGJIN },
];

/**
 * 단위 그룹 칩 — 라벨은 화면 문구, 값은 계약 RosterUnitGroup 이다. `단위` 판정 규칙(특목 =
 * 특목·예중1·예고1 등)은 전적으로 서버에 있다. 명부에는 비재원생(GUEST) 칩이 없다.
 */
const UNIT_GROUP_CHIPS: ReadonlyArray<{ value: RosterUnitGroup; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "ELEMENTARY", label: "초등" },
  { value: "MIDDLE_1", label: "중1" },
  { value: "MIDDLE_2", label: "중2" },
  { value: "MIDDLE_3", label: "중3" },
  { value: "SPECIAL_PURPOSE", label: "특목" },
  { value: "HIGH", label: "고등" },
  { value: "SCIENCE", label: "과학" },
];

const num = (value: number) => value.toLocaleString("ko-KR");
const at = (iso: string) => fmtDateTimeShort(new Date(iso));

/** 예약 회차 선택지 라벨 — 예약 명단과 같은 문구 규칙(설명회 · 날짜 · 캠퍼스 범위). */
function sessionLabel(option: SeminarSessionOption): string {
  const { session, seminarTitle } = option;
  const scope = session.branch === null ? "전체" : BRANCH_LABELS[session.branch];
  return `${seminarTitle} · ${fmtSessionDate(new Date(session.startsAt))} · ${scope}`;
}

/**
 * 필터 Tag 전용 치수 — 공용 Tag 보다 촘촘하게 죄어 두 줄 필터가 각 줄 안에서 자연스럽게
 * 흐르게 한다. 이 화면 안에서만 쓰고 공용 Tag 는 건드리지 않는다.
 */
const FILTER_TAG_STYLE = { height: 30, padding: "0 9px", fontSize: 12 } as const;

/* 두 줄 필터의 열 맞춤 상수 — 1행 검색폭 = 2행 왼쪽 여백이라야 `캠퍼스`·`단위` 라벨이
   같은 x 에서 시작하고, 라벨 폭이 같아야 그 뒤 버튼들도 같은 x 에서 시작한다. 라벨은
   flexShrink:0 + 고정폭이라 아무리 좁아져도 잘리지 않는다(각 줄은 스스로 가로 스크롤한다). */
const FILTER_SEARCH_WIDTH = 220;
const FILTER_LABEL_WIDTH = 46;
const FILTER_ROW_GAP = 12;

/** 한 줄 필터 컨테이너 — nowrap + 가로 스크롤. 페이지가 아니라 이 줄만 스크롤한다.
    세로 padding 은 선택 칩의 부드러운 글로우가 가로 스크롤 클리핑에 잘리지 않게 하는 여유다. */
const FILTER_ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: FILTER_ROW_GAP,
  flexWrap: "nowrap",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "4px 0",
  maxWidth: "100%",
} as const;

/** 필터 라벨(캠퍼스·단위) — 고정폭·비축소·줄바꿈 금지라 어떤 폭에서도 클리핑되지 않는다. */
const FILTER_LABEL_STYLE = {
  width: FILTER_LABEL_WIDTH,
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 700,
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
} as const;

/* ── 동기화 밴드 ────────────────────────────────────────────────────────── */

function BranchSyncChip({ run }: { run: BranchSyncRun }) {
  const settled = isBranchSyncSettled(run.status);
  const failed = isBranchSyncFailed(run.status);
  const tone = settled ? "var(--status-success)" : failed ? "var(--status-danger)" : "var(--violet-200)";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
      <span
        aria-hidden
        style={{
          width: 15,
          height: 15,
          borderRadius: 999,
          background: settled || failed ? tone : "transparent",
          border: settled || failed ? "none" : `2px solid ${tone}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {settled && <Icons.check size={10} />}
      </span>
      <b style={{ fontWeight: 700, color: "var(--text-on-brand)" }}>{BRANCH_LABELS[run.branch]}</b>
      <span style={{ color: "var(--violet-200)" }}>{BRANCH_SYNC_STATUS_LABELS[run.status]}</span>
    </span>
  );
}

function SyncBand({
  sync,
  totalStudentCount,
  lastSuccessfulSyncAt,
}: {
  sync: ReturnType<typeof useStudentSync>;
  /** 재원생 수(요약 eligibleUniqueStudentCount, 분원+단위 범위) — 재원생 카드와 같은 값. 아직 못 읽었으면 null. */
  totalStudentCount: number | null;
  /** 마지막 **성공** 시각은 학생 목록 응답이 들고 온다 — 상태 응답에는 이 필드가 없다. */
  lastSuccessfulSyncAt: string | null;
}) {
  const { status } = sync;

  if (sync.loading && status === null) {
    return (
      <div
        aria-busy="true"
        aria-label="동기화 상태를 불러오는 중"
        style={{
          height: 118,
          marginTop: 18,
          borderRadius: "var(--radius-md)",
          background: "var(--surface-sunken)",
          animation: "ds-shimmer 1.5s linear infinite",
        }}
      />
    );
  }

  if (status === null) {
    return (
      <Card variant="outline" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span role="alert" style={{ fontSize: 13.5, color: "var(--text-body)" }}>
            {sync.error ?? "동기화 상태를 불러오지 못했어요."}
          </span>
          <Button variant="secondary" size="sm" onClick={sync.reload}>
            다시 시도
          </Button>
        </div>
      </Card>
    );
  }

  const circuitOpen = status.circuit.status === "OPEN";
  const latestRun = status.latestRun;
  /**
   * 회로가 CLOSED 인데도 실시간 원천 연동이 꺼져 시작할 수 없는 경우 — 회로 배너와
   * 겹치지 않는 별개의 사유다. 훅이 판정한 `blockedReason` 을 그대로 노출한다
   * (여기서 문구를 다시 짓지 않는다). 진행 중일 때는 사유를 띄우지 않는다.
   */
  const showBlockedReason = !circuitOpen && !sync.runActive && sync.blockedReason !== null;
  // 분원 실행은 SONGPA→WIRYE→GWANGJIN 순차다. 서버가 준 sequence 로만 정렬한다.
  const branches = latestRun === null ? [] : [...latestRun.branches].sort((a, b) => a.sequence - b.sequence);

  return (
    <section
      aria-label="학생 동기화 상태"
      style={{
        marginTop: 18,
        borderRadius: "var(--radius-md)",
        background: "var(--violet-800)",
        color: "var(--text-on-brand)",
        boxShadow: "var(--shadow-card)",
        animation: "ds-fade-up var(--dur-base) var(--ease-out) both",
      }}
    >
      {/* 1행: 전체 상태 · 마지막 성공 · 주기 · 수동 실행 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          flexWrap: "wrap",
          padding: "16px var(--card-pad)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 12px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.16)",
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: circuitOpen ? "var(--status-danger)" : "var(--status-success)",
              boxShadow: sync.runActive ? "0 0 0 3px rgba(255,255,255,0.25)" : "none",
            }}
          />
          {circuitOpen ? "중지" : "정상"}
        </span>

        <BandDivider />
        <BandField label="마지막 동기화">
          {lastSuccessfulSyncAt === null ? "기록 없음" : at(lastSuccessfulSyncAt)}
        </BandField>

        <BandDivider />
        {/* 계약에 다음 실행 예정 시각이 없다 — 주기만 말하고 시각은 짓지 않는다. */}
        <span style={{ fontSize: 13 }}>{status.scheduleIntervalHours}시간마다 자동 최신화</span>

        <span style={{ flex: 1, minWidth: 8 }} />

        <Button
          variant="secondary"
          disabled={!sync.canStart}
          onClick={sync.startSync}
          style={{ background: "#fff", flexShrink: 0 }}
        >
          {sync.starting ? "요청 중…" : sync.runActive ? "동기화 중…" : "지금 동기화"}
        </Button>
      </div>

      {/* 2행: 분원별 상태 · 전체 학생 수 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          padding: "13px var(--card-pad)",
          borderTop: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        <span style={{ fontSize: 12.5, color: "var(--violet-200)", fontWeight: 700 }}>캠퍼스 동기화 상태</span>

        {branches.length === 0 ? (
          <span style={{ fontSize: 12.5, color: "var(--violet-200)" }}>
            아직 동기화 실행 기록이 없어 캠퍼스별 상태를 표시할 수 없어요.
          </span>
        ) : (
          branches.map((run) => <BranchSyncChip key={run.branch} run={run} />)
        )}

        <span style={{ flex: 1, minWidth: 8 }} />

        <span style={{ fontSize: 12.5, display: "inline-flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: "var(--violet-200)", fontWeight: 700 }}>총 학생 수</span>
          <b style={{ fontSize: 14, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>
            {totalStudentCount === null ? "—" : `${num(totalStudentCount)}명`}
          </b>
        </span>
      </div>

      {/* 진행 · 거절 · 중지 사유는 상태 변화로만 말한다 (스크린리더에 즉시 전달) */}
      <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {sync.runActive && latestRun !== null ? `동기화 ${SYNC_RUN_STATUS_LABELS[latestRun.status]}` : ""}
        {sync.notice ?? ""}
      </div>

      {(sync.notice !== null ||
        circuitOpen ||
        showBlockedReason ||
        (latestRun !== null && latestRun.errorCode !== null && !sync.runActive)) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            padding: "11px var(--card-pad)",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            fontSize: 12.5,
          }}
        >
          {circuitOpen ? (
            <span>
              원천 로그인이 잠겨 있어 동기화가 중지됐어요
              {status.circuit.openedReasonCode !== null && ` (${status.circuit.openedReasonCode})`}. 잠금이 풀리기
              전까지 수동 실행을 시작할 수 없어요.
            </span>
          ) : showBlockedReason ? (
            <span>{sync.blockedReason}</span>
          ) : latestRun !== null && latestRun.errorCode !== null && !sync.runActive ? (
            <span>마지막 실행이 끝나지 못했어요 ({latestRun.errorCode}).</span>
          ) : (
            <span>{sync.notice}</span>
          )}
        </div>
      )}
    </section>
  );
}

function BandField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--violet-200)", fontWeight: 700, fontSize: 12.5 }}>{label}</span>
      <span style={{ fontFeatureSettings: '"tnum"', fontWeight: 600 }}>{children}</span>
    </span>
  );
}

function BandDivider() {
  return <span aria-hidden style={{ width: 1, height: 14, background: "rgba(255,255,255,0.28)" }} />;
}

/* ── 화면 ──────────────────────────────────────────────────────────────── */

export function StudentStatusView() {
  const sync = useStudentSync();
  // 예약 회차 선택지는 예약 명단과 같은 원천(설명회→회차)이다. 첫 회차를 fallback 으로 넘겨
  // "예약 여부" 열이 늘 어떤 회차 기준인지 갖게 한다(URL 이 회차를 지목하면 그쪽이 이긴다).
  const sessions = useSeminarSessions();
  const fallbackSessionId = sessions.options[0]?.session.seminarSessionId;
  const students = useAdminStudents(fallbackSessionId);
  const [searchDraft, setSearchDraft] = useState(students.filters.query);

  const { reload: reloadStudents } = students;
  const { settledToken } = sync;

  // 동기화가 끝나면 명부가 바뀌었을 수 있다 — 그때 한 번만 다시 읽는다.
  useEffect(() => {
    if (settledToken > 0) reloadStudents();
  }, [settledToken, reloadStudents]);

  /**
   * URL 이 바깥에서 바뀌면(뒤로가기·링크 진입) 입력창도 따라가야 한다. effect 로 맞추면
   * 낡은 값이 한 프레임 그려지므로, 렌더 중에 바뀐 것을 감지해 곧바로 맞춘다
   * (React 가 권장하는 "prop 이 바뀔 때 state 조정" 패턴이다).
   */
  const [syncedQuery, setSyncedQuery] = useState(students.filters.query);
  if (syncedQuery !== students.filters.query) {
    setSyncedQuery(students.filters.query);
    setSearchDraft(students.filters.query);
  }

  const page = students.page;
  const summary = page?.summary ?? null;
  // 카드가 그릴 최종 4수 — 신규 계약 필드 우선, 없을 때만 각각 대응하는 레거시 필드로 폴백(더하지 않는다).
  const summaryCounts = summary === null ? null : resolveStudentSummaryCounts(summary);

  /**
   * 담임 선택지는 서버 facet(page.facets.teachers)만으로 만든다 — teacherName 을 뺀 나머지
   * 필터에 걸리는 전체 결과의 대표 담임 목록이라 페이지네이션과 무관하다. 현재 페이지 items 를
   * 다시 훑지 않는다. 방어적 보존은 헬퍼가 맡는다(선택 담임이 facet 에 없을 때 한 번만 유지).
   */
  const teacherOptions = useMemo(
    () => buildTeacherOptions(page?.facets.teachers ?? [], students.filters.teacherName),
    [page, students.filters.teacherName],
  );

  const submitSearch = () => students.setFilters({ query: searchDraft });

  // 캠퍼스가 선택되면 요약 라벨 앞에 캠퍼스명을 붙인다 — 전체(ALL)면 접두사 없이 그대로(순수 헬퍼).
  const branch = students.filters.branch;
  const statLabel = (label: string) => campusScopedLabel(branch, label);

  /**
   * 확인 필요 상세는 팝오버를 처음 열 때만 부른다 — 카드 수는 요약값으로 이미 온전하므로
   * 열어 보지 않으면 요청도 없다. 캠퍼스가 바뀌면 훅이 그 범위로 다시 읽는다.
   */
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const enableReview = useCallback(() => setReviewEnabled(true), []);
  const review = useReviewRequiredStudents(branch, reviewEnabled);

  return (
    <div data-screen-label="학생 현황">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
          animation: "ds-fade-up var(--dur-slow) var(--ease-out) both",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "var(--tracking-caps)",
              fontWeight: 700,
              color: "var(--text-accent)",
              marginBottom: 6,
            }}
          >
            STUDENTS
          </div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>학생 현황</h1>
        </div>

        <span style={{ flex: 1, minWidth: 8 }} />

        <SessionPicker
          sessions={sessions}
          value={students.filters.seminarSessionId}
          onChange={(seminarSessionId) => students.setFilters({ seminarSessionId })}
        />
      </div>

      <SyncBand
        sync={sync}
        totalStudentCount={summaryCounts?.eligibleUniqueStudentCount ?? null}
        lastSuccessfulSyncAt={page?.latestSuccessfulSyncAt ?? null}
      />

      {/* 요약 4종 — 서버 집계를 그대로 그린다. 재원생·수학·과학은 캠퍼스+단위 범위(단위 탭에 반응),
          확인 필요는 캠퍼스 범위만. 검색·담임·페이지는 넷 다 무시. 캠퍼스 선택 시 라벨에 캠퍼스명. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        <StatCard label={statLabel("재원생")} value={summaryCounts === null ? "—" : num(summaryCounts.eligibleUniqueStudentCount)} suffix="명" tone="brand" delay={0} />
        <StatCard label={statLabel("수학 정규반")} value={summaryCounts === null ? "—" : num(summaryCounts.mathStudentCount)} suffix="명" tone="brand" delay={1} />
        <StatCard label={statLabel("과학 정규반")} value={summaryCounts === null ? "—" : num(summaryCounts.scienceOnlyStudentCount)} suffix="명" tone="accent" delay={2} />
        <ReviewRequiredCard
          label={statLabel("확인 필요")}
          count={summaryCounts?.reviewRequiredStudentCount ?? null}
          review={review}
          onOpen={enableReview}
        />
      </div>

      <Card padding="0" style={{ marginTop: 16, overflow: "hidden" }}>
        <FilterBar
          filters={students.filters}
          searchDraft={searchDraft}
          onSearchDraft={setSearchDraft}
          onSubmitSearch={submitSearch}
          teacherOptions={teacherOptions}
          onChange={students.setFilters}
        />

        <StudentTable students={students} />
      </Card>
    </div>
  );
}

/* ── 예약 회차 선택 ────────────────────────────────────────────────────────── */

/**
 * 예약 회차 드랍다운 — 예약 명단과 같은 원천(설명회→회차)을 쓴다. 고른 회차는 목록 요청에
 * 실려 "예약 여부" 열의 기준이 된다(명단 범위는 그대로). 회차가 없거나 로딩 중이면 비활성.
 */
function SessionPicker({
  sessions,
  value,
  onChange,
}: {
  sessions: ReturnType<typeof useSeminarSessions>;
  value: string | undefined;
  onChange: (seminarSessionId: string) => void;
}) {
  const options = sessions.options.map((option) => ({
    value: option.session.seminarSessionId,
    label: sessionLabel(option),
  }));

  return (
    <div
      role="group"
      aria-label="예약 회차 선택"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}
    >
      <span
        aria-hidden
        style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "var(--tracking-caps)", color: "var(--text-muted)" }}
      >
        예약 회차
      </span>
      <Select
        options={options}
        value={value ?? ""}
        onChange={onChange}
        placeholder={sessions.loading ? "회차 불러오는 중…" : options.length === 0 ? "등록된 회차 없음" : "회차 선택"}
        disabled={sessions.loading || options.length === 0}
        style={{ width: 340, maxWidth: "min(340px, 78vw)", whiteSpace: "nowrap" }}
      />
    </div>
  );
}

/* ── 필터 (정확히 두 줄) ───────────────────────────────────────────────────── */

/**
 * 두 줄 필터 — 각 줄은 nowrap + 가로 스크롤이라 좁아져도 줄을 늘리지 않고 스스로 스크롤한다.
 * 1행 검색폭과 2행 왼쪽 여백이 같고 두 라벨 폭이 같아, `캠퍼스`·`단위` 와 그 뒤 버튼들이
 * 각각 같은 x 에서 시작한다. 라벨은 고정폭·비축소·줄바꿈 금지라 어떤 폭에서도 잘리지 않는다.
 */
function FilterBar({
  filters,
  searchDraft,
  onSearchDraft,
  onSubmitSearch,
  teacherOptions,
  onChange,
}: {
  filters: ReturnType<typeof useAdminStudents>["filters"];
  searchDraft: string;
  onSearchDraft: (value: string) => void;
  onSubmitSearch: () => void;
  teacherOptions: string[];
  onChange: ReturnType<typeof useAdminStudents>["setFilters"];
}) {
  const campusLabelId = useId();
  const unitLabelId = useId();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px var(--card-pad)" }}>
      {/* 1행: 검색 → 캠퍼스 라벨 → 캠퍼스 버튼 */}
      <div style={FILTER_ROW_STYLE}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitSearch();
          }}
          style={{ flexShrink: 0, width: FILTER_SEARCH_WIDTH }}
        >
          <Input
            placeholder="이름·학교·학번·연락처 뒤 4자리"
            value={searchDraft}
            onChange={onSearchDraft}
            icon={<Icons.search size={15} />}
            style={{ width: "100%" }}
          />
          <button type="submit" style={{ display: "none" }} aria-hidden />
        </form>

        <span id={campusLabelId} style={FILTER_LABEL_STYLE}>
          캠퍼스
        </span>
        <div role="group" aria-labelledby={campusLabelId} style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {BRANCH_TABS.map((tab) => (
            <Tag
              key={tab.value}
              selected={(filters.branch ?? "ALL") === tab.value}
              onClick={() => onChange({ branch: tab.value === "ALL" ? undefined : tab.value })}
              style={FILTER_TAG_STYLE}
            >
              {tab.label}
            </Tag>
          ))}
        </div>
      </div>

      {/* 2행: (검색폭만큼 왼쪽 여백) → 단위 라벨 → 단위 버튼 → 담임(오른쪽 끝) */}
      <div style={FILTER_ROW_STYLE}>
        <span aria-hidden style={{ width: FILTER_SEARCH_WIDTH, flexShrink: 0 }} />
        <span id={unitLabelId} style={FILTER_LABEL_STYLE}>
          단위
        </span>
        <div role="group" aria-labelledby={unitLabelId} style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {UNIT_GROUP_CHIPS.map((chip) => (
            <Tag
              key={chip.value}
              selected={filters.unitGroup === chip.value}
              onClick={() => onChange({ unitGroup: chip.value })}
              style={FILTER_TAG_STYLE}
            >
              {chip.label}
            </Tag>
          ))}
        </div>

        <span style={{ flex: 1, minWidth: 16 }} />

        {/* 담임 선택지는 서버 facet 만으로 만든다 — 현재 페이지 items 를 다시 훑지 않는다. */}
        {/* 포털 모드 — 필터 카드(overflow:hidden)와 이 줄(overflowX:auto)이 절대배치 메뉴를
            잘라 '담임 전체'를 눌러도 목록이 안 보이던 버그를 막는다. body 로 fixed 포털한다. */}
        <Select
          portal
          options={[{ value: "", label: "담임 전체" }, ...teacherOptions.map((teacher) => ({ value: teacher, label: teacher }))]}
          value={filters.teacherName}
          onChange={(teacherName) => onChange({ teacherName })}
          style={{ width: 132, flexShrink: 0 }}
        />
      </div>
    </div>
  );
}

/* ── 확인 필요 팝오버 ──────────────────────────────────────────────────────── */

const POPOVER_NOTE_STYLE = { margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 } as const;

/**
 * 확인 필요 카드 — 수는 요약값 그대로(캠퍼스 범위), 위에 접근 가능한 팝오버를 얹는다.
 *
 * 포인터 hover·키보드 focus 로 열리고, 클릭/탭으로 고정(pin)한다. Escape·바깥 클릭으로 닫히되,
 * 포커스가 카드/팝오버 안에 남아 있으면 닫지 않는다 — 포커스 콘텐츠를 숨기지 않기 위해서다.
 * 투명 버튼을 카드 위에 겹쳐 키보드 포커스·클릭을 모두 받게 한다(StatCard 는 div 라 그대로는
 * 포커스를 못 받는다).
 */
function ReviewRequiredCard({
  label,
  count,
  review,
  onOpen,
}: {
  label: string;
  /** 요약 reviewRequiredStudentCount(분원 범위) — 아직 못 읽었으면 null. 화면은 이 수를 다시 세지 않는다. */
  count: number | null;
  review: ReviewRequiredState;
  onOpen: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const open = hovering || pinned || focusWithin;

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();

  // 고정된 동안 바깥 클릭이면 닫는다 (Select 와 같은 패턴).
  useEffect(() => {
    if (!pinned) return;
    const onDown = (event: MouseEvent) => {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setPinned(false);
        setHovering(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pinned]);

  const tone: "warning" | "brand" = count !== null && count > 0 ? "warning" : "brand";
  const ariaCount = count === null ? "" : `${num(count)}명 `;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative" }}
      onMouseEnter={() => {
        setHovering(true);
        onOpen();
      }}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => {
        setFocusWithin(true);
        onOpen();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setPinned(false);
          setHovering(false);
          setFocusWithin(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <StatCard label={label} value={count === null ? "—" : num(count)} suffix="명" tone={tone} delay={3} />
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        // 클릭/탭은 **고정**한다(닫기가 아니다) — 닫기는 Escape·바깥 클릭이다. 트리거가 계속
        // 포커스를 쥔 채 토글하면 focus-within 때문에 닫히지 않으므로, 여기서는 열기만 맡는다.
        aria-label={`확인 필요 학생 ${ariaCount}상세 목록 보기`}
        onClick={() => {
          setPinned(true);
          onOpen();
        }}
        style={{
          position: "absolute",
          inset: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          borderRadius: "var(--radius-lg)",
          cursor: "pointer",
        }}
      />
      {open && (
        <>
          {/* 카드와 팝오버 사이 8px 틈을 잇는 투명 다리 — 포인터가 틈을 건너는 동안
              컨테이너를 벗어나 mouseleave 가 팝오버를 먼저 닫아 버리는 것을 막는다. */}
          <span
            aria-hidden
            style={{ position: "absolute", top: "100%", right: 0, height: 10, width: 380, maxWidth: "calc(100vw - 32px)" }}
          />
          <ReviewPopover id={dialogId} review={review} count={count} />
        </>
      )}
    </div>
  );
}

function ReviewPopover({ id, review, count }: { id: string; review: ReviewRequiredState; count: number | null }) {
  return (
    <div
      id={id}
      role="dialog"
      aria-label="확인 필요 학생 상세"
      // 키보드만 쓰는 사용자가 목록으로 들어와 스크롤할 수 있게 포커스 대상으로 둔다.
      // 포커스가 여기 들어오면 상위 컨테이너의 focus-within 이 유지돼 팝오버가 닫히지 않는다.
      tabIndex={0}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        left: "auto",
        zIndex: 70,
        width: 380,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: 320,
        overflowY: "auto",
        background: "var(--surface-card)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-float)",
        padding: 14,
        textAlign: "left",
        animation: "ds-scale-in var(--dur-base) var(--ease-spring) both",
        transformOrigin: "top right",
      }}
    >
      <ReviewPopoverBody review={review} total={count ?? 0} />
    </div>
  );
}

function ReviewPopoverBody({ review, total }: { review: ReviewRequiredState; total: number }) {
  if (review.loading) {
    return <p style={POPOVER_NOTE_STYLE}>확인 필요 목록을 불러오는 중…</p>;
  }

  if (review.error !== null && review.items.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={POPOVER_NOTE_STYLE}>{review.error}</p>
        <Button variant="secondary" size="sm" onClick={review.reload}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (review.items.length === 0) {
    // 상세가 비었는데 요약 수가 있으면 = 엔드포인트 미배포. 인원 수는 위 카드에 그대로 있다.
    return (
      <p style={POPOVER_NOTE_STYLE}>
        {total > 0
          ? "확인 필요 상세 목록은 아직 준비 중이에요. 인원 수는 위 카드에 그대로예요."
          : "확인이 필요한 학생이 없어요."}
      </p>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 2 }}>
        확인이 필요한 학생 {num(review.totalCount > 0 ? review.totalCount : review.items.length)}명
      </div>
      {review.items.map((student) => (
        <ReviewRequiredItem key={student.studentId} student={student} />
      ))}
    </div>
  );
}

/** 반명 목록 — 원천 접미사를 그대로 이어 붙인다(가공하지 않는다). 없으면 —. */
function joinClasses(names: string[]): string {
  return names.length > 0 ? names.join(", ") : "—";
}

/**
 * 확인 필요 한 명 — 사유(코드→고정 라벨)·캠퍼스·이름과 원천 반명·수학반·과학반 전부를 편다.
 * 사유는 여러 개일 수 있어 라벨을 모두 나열하고(각 span 의 title 에 원본 코드), 알 수 없는
 * 미래 코드는 reviewReasonLabel 이 안전 라벨로 떨어뜨린다 — 절대 undefined 를 보이지 않는다.
 * 과학반은 팝오버라 자리가 넉넉하므로 +N 로 접지 않고 전부 나열한다.
 */
function ReviewRequiredItem({ student }: { student: ReviewRequiredStudent }) {
  return (
    <div style={{ padding: "9px 0", borderTop: "1px solid var(--border-hairline)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 13.5, color: "var(--text-strong)" }}>{student.name}</b>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{BRANCH_LABELS[student.branch]}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", marginTop: 2 }}>
        {student.reasonCodes.map((code) => (
          <span key={code} title={code} style={{ fontSize: 12, color: "var(--status-warning)", lineHeight: 1.5 }}>
            {reviewReasonLabel(code)}
          </span>
        ))}
      </div>
      <dl style={{ margin: "6px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 11.5 }}>
        <ReviewField term="원천 반">{joinClasses(student.rawClassNames)}</ReviewField>
        <ReviewField term="수학반">{student.mathClassName ?? "—"}</ReviewField>
        <ReviewField term="과학반">{joinClasses(student.scienceClassNames)}</ReviewField>
      </dl>
    </div>
  );
}

function ReviewField({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-faint)", fontWeight: 700, whiteSpace: "nowrap" }}>{term}</dt>
      <dd style={{ margin: 0, color: "var(--text-body)", wordBreak: "break-word" }}>{children}</dd>
    </>
  );
}

/* ── 표 ────────────────────────────────────────────────────────────────── */

const GRID_COLS = "40px 88px 56px 1fr 0.9fr 0.9fr 1fr 52px 78px 116px 84px";
const HEADERS = ["No", "학번", "캠퍼스", "학생이름", "수학반", "과학반", "학교", "단위", "담임명", "학부모연락처", "예약 여부"];

function HeadCell() {
  return (
    <div
      role="row"
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 8,
        padding: "11px 14px",
        background: "var(--surface-sunken)",
        fontSize: 11.5,
        fontWeight: 700,
        color: "var(--text-muted)",
        textAlign: "center",
        alignItems: "center",
      }}
    >
      {HEADERS.map((header) => (
        <span role="columnheader" key={header}>
          {header}
        </span>
      ))}
    </div>
  );
}

function StudentTable({ students }: { students: ReturnType<typeof useAdminStudents> }) {
  const { page, loading, refreshing, error, filtered } = students;

  if (loading && page === null) {
    return (
      <div aria-busy="true" aria-label="학생 명단을 불러오는 중">
        <HeadCell />
        {Array.from({ length: STUDENT_PAGE_SIZE }, (_, index) => (
          <div
            key={index}
            style={{
              height: 43,
              borderTop: "1px solid var(--border-hairline)",
              background: "var(--surface-card)",
              display: "flex",
              alignItems: "center",
              padding: "0 18px",
            }}
          >
            <span
              style={{
                height: 11,
                flex: 1,
                borderRadius: 999,
                background: "var(--surface-sunken)",
                animation: "ds-shimmer 1.5s linear infinite",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (error !== null && page === null) {
    return (
      <div role="alert" style={{ padding: "40px 0", textAlign: "center" }}>
        <p style={{ fontSize: 13.5, color: "var(--text-body)", margin: "0 0 12px" }}>{error}</p>
        <Button variant="secondary" size="sm" onClick={students.reload}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (page === null) return <EmptyState>학생 명단을 불러오지 못했어요.</EmptyState>;

  return (
    <div>
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
          <Button variant="secondary" size="sm" onClick={students.reload}>
            다시 시도
          </Button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <div role="table" aria-label="학생 명단" style={{ minWidth: 1040, opacity: refreshing ? 0.6 : 1, transition: `opacity var(--dur-fast)` }}>
          <HeadCell />

          {page.items.map((student, index) => (
            <StudentRow
              key={student.studentId}
              student={student}
              no={(page.page.page - 1) * page.page.pageSize + index + 1}
              index={index}
            />
          ))}

          {page.items.length === 0 && (
            <EmptyState>{filtered ? "조건에 맞는 학생이 없어요." : "동기화된 학생이 아직 없어요."}</EmptyState>
          )}
        </div>
      </div>

      <Pagination students={students} />
    </div>
  );
}

function StudentRow({
  student,
  no,
  index,
}: {
  student: AdminStudent & AdminStudentReservation & AdminStudentCanonicalTeacher;
  no: number;
  index: number;
}) {
  const teacher = resolveHomeroomTeacher(student);

  return (
    <div
      role="row"
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 10,
        alignItems: "center",
        textAlign: "center",
        padding: "10px 18px",
        borderTop: "1px solid var(--border-hairline)",
        fontSize: 13,
        color: "var(--text-body)",
        background: "var(--surface-card)",
        animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(index, 12) * 16}ms both`,
      }}
    >
      <span style={{ color: "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>{no}</span>
      <span style={{ fontFeatureSettings: '"tnum"', color: "var(--text-muted)", fontSize: 12 }}>{student.sourceStudentNo}</span>
      <span>{BRANCH_LABELS[student.branch]}</span>
      <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{student.name}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {student.mathClassName ?? <Muted />}
      </span>
      <ScienceClasses names={student.scienceClassNames} />
      <span>{student.schoolName ?? <Muted />}</span>
      {/* 단위는 raw 학년(student.grade)이 아니라 서버 unitName 을 그룹 라벨로 접어 찍는다. */}
      <span>{rosterUnitGroupLabel(student.unitName)}</span>
      <span>{teacher ?? <Muted />}</span>
      <ParentContacts student={student} />
      <ReservationCell student={student} />
    </div>
  );
}

/**
 * 예약 여부 칸 — 오직 예약 / 미예약 두 값만. 선택된 회차 기준 학생별 상태를 서버가 실어
 * 주면(reservationStatus) 그대로 접고, 없으면 미예약이다. 세부 상태·참석 학부모·로그·시각은
 * 이 칸에 절대 싣지 않는다(지시된 최종 규칙).
 */
function ReservationCell({ student }: { student: AdminStudentReservation }) {
  const label = studentReservationLabel(student);
  const reserved = label === "예약";
  return (
    <span style={{ display: "inline-flex", justifyContent: "center" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 10px",
          borderRadius: "var(--radius-pill)",
          fontSize: 12,
          fontWeight: 700,
          background: reserved ? "var(--status-success-soft)" : "var(--surface-sunken)",
          color: reserved ? "var(--status-success)" : "var(--text-faint)",
        }}
      >
        {label}
      </span>
    </span>
  );
}

function Muted() {
  return <span style={{ color: "var(--text-faint)" }}>—</span>;
}

/* 과학반 팝오버 높이 추정 — 위/아래 뒤집기 판단과 최대 높이 계산용(정확할 필요는 없다). */
const SCIENCE_POPUP_LINE_H = 21;
const SCIENCE_POPUP_HEADER_H = 22;
const SCIENCE_POPUP_PAD_Y = 22;

/**
 * 과학반 칸 — 0개면 —, 1개면 그 이름, 2개 이상이면 `첫이름 +N`(N=나머지 수)으로 압축한다.
 * 2개 이상일 때는 ScienceClassesPopover 로 전체 목록을 연다.
 */
function ScienceClasses({ names }: { names: string[] }) {
  if (names.length === 0) return <Muted />;
  if (names.length === 1) {
    return <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names[0]}</span>;
  }
  return <ScienceClassesPopover names={names} />;
}

/**
 * 과학반 `+N` 팝오버 — 전체 반명을 hover·키보드 focus·클릭(고정) 어디서든 읽을 수 있게 연다.
 *
 * 왜 포털 + fixed 인가: 표는 `overflow-x:auto`, 감싼 Card 는 `overflow:hidden` 이라, 행 안에
 * 절대배치로 얹으면 팝오버가 잘리거나(세로) 좁은 칸의 shrink-to-fit 에 눌려 한 글자 폭으로
 * 무너져 세로 글자 기둥이 됐다. body 로 포털해 fixed 로 띄우면 어떤 조상 overflow 도 자르지
 * 못하고, 폭은 트리거 칸과 무관한 고정 가독 폭이라 무너지지 않는다. 좌표·상하 뒤집기·화면
 * 가장자리 clamp 는 computeSciencePopupPosition 이 순수하게 계산한다(테스트 대상).
 *
 * 상호작용은 같은 화면의 ReviewRequiredCard 와 같은 규칙: hover·focus 로 열고 클릭/탭으로
 * 고정(pin)한다. 닫기는 Escape(트리거로 포커스 복귀)·바깥 클릭이다.
 */
function ScienceClassesPopover({ names }: { names: string[] }) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [position, setPosition] = useState<SciencePopupPosition | null>(null);
  const open = hovering || pinned || focusWithin;

  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const rest = names.length - 1;
  const contentHeight = SCIENCE_POPUP_HEADER_H + names.length * SCIENCE_POPUP_LINE_H + SCIENCE_POPUP_PAD_Y;

  // 트리거 rect 로 좌표를 낸다. 여는 순간(핸들러)에 한 번, 그리고 열려 있는 동안 스크롤·
  // 리사이즈마다 다시 계산해 fixed 팝오버가 트리거를 따라가게 한다. 여는 시점 계산을
  // 핸들러에서 하므로 effect 는 구독(리스너)만 맡는다 — effect 내 동기 setState 를 피한다.
  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    setPosition(
      computeSciencePopupPosition(rect, { width: window.innerWidth, height: window.innerHeight }, contentHeight),
    );
  }, [contentHeight]);

  // 열려 있는 동안만 스크롤·리사이즈를 구독한다(표 안쪽 스크롤까지 capture 로 잡는다).
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  // 고정된 동안 바깥(트리거·팝오버 밖) 클릭이면 닫는다 (ReviewRequiredCard 와 같은 패턴).
  useEffect(() => {
    if (!pinned) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setPinned(false);
      setHovering(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pinned]);

  const showPopup = open && position !== null;

  return (
    <span
      ref={containerRef}
      style={{ display: "inline-flex", maxWidth: "100%", minWidth: 0 }}
      onMouseEnter={() => {
        measure();
        setHovering(true);
      }}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => {
        measure();
        setFocusWithin(true);
      }}
      onBlur={(event) => {
        // 팝오버는 body 로 포털돼 트리거의 DOM 자손이 아니다 — 트리거·팝오버 양쪽을 모두 본다.
        const next = event.relatedTarget as Node | null;
        if (containerRef.current?.contains(next) || popupRef.current?.contains(next)) return;
        setFocusWithin(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setPinned(false);
          setHovering(false);
          setFocusWithin(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={showPopup ? dialogId : undefined}
        aria-describedby={showPopup ? dialogId : undefined}
        // 접근성 폴백 — 스크린리더는 이 라벨로 전체 목록을 그대로 읽는다(시각 팝오버와 무관하게).
        aria-label={`과학반 ${names.length}개: ${names.join(", ")}`}
        // 클릭/탭은 **고정**만 맡는다(닫기가 아니다) — 닫기는 Escape·바깥 클릭. 트리거가 계속
        // 포커스를 쥔 채 토글하면 focus-within 때문에 어차피 닫히지 않는다(ReviewRequiredCard 와 동일).
        onClick={() => {
          measure();
          setPinned(true);
        }}
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 4,
          maxWidth: "100%",
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names[0]}</span>
        <span style={{ color: "var(--text-accent)", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>+{rest}</span>
      </button>

      {showPopup &&
        createPortal(
          <div
            ref={popupRef}
            id={dialogId}
            role="dialog"
            aria-label={`과학반 ${names.length}개`}
            style={{
              position: "fixed",
              left: position.left,
              top: position.top,
              width: position.width,
              maxWidth: `calc(100vw - ${SCIENCE_POPUP_MARGIN * 2}px)`,
              maxHeight: position.maxHeight,
              overflowY: "auto",
              boxSizing: "border-box",
              zIndex: 80,
              background: "rgba(23,33,15,0.96)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "var(--shadow-float)",
              padding: "8px 12px",
              textAlign: "left",
              color: "#FFFFFF",
              fontFamily: "var(--font-body)",
              animation: "ds-scale-in var(--dur-fast) var(--ease-out) both",
              transformOrigin: position.placement === "above" ? "bottom right" : "top right",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.62)", marginBottom: 4 }}>
              과학반 {names.length}개
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
              {names.map((name) => (
                // keep-all 로 한글 반명이 음절 사이에서 쪼개지지 않고, anywhere 로 아주 긴 토큰만
                // 마지막 수단으로 접어 팝오버 밖으로 넘치는 것을 막는다.
                <li key={name} style={{ fontSize: 12.5, lineHeight: 1.45, wordBreak: "keep-all", overflowWrap: "anywhere" }}>
                  {name}
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </span>
  );
}

/**
 * 학부모연락처 칸 — 저장된 모/부 번호를 있는 대로 각각 한 줄씩 보여 준다.
 * 어느 쪽 번호인지 라벨이 없으면 두 줄이 그냥 숫자 더미가 된다.
 */
function ParentContacts({ student }: { student: AdminStudent }) {
  const contacts = [
    { label: "모", phone: student.motherPhone },
    { label: "부", phone: student.fatherPhone },
  ].filter((entry): entry is { label: string; phone: string } => entry.phone !== null);

  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontFeatureSettings: '"tnum"', fontSize: 12 }}>
      {contacts.length === 0 ? (
        <Muted />
      ) : (
        contacts.map(({ label, phone }) => (
          <span key={label} style={{ display: "flex", gap: 4, alignItems: "baseline", whiteSpace: "nowrap" }}>
            <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{label}</span>
            {fmtPhone(phone)}
          </span>
        ))
      )}
    </span>
  );
}

/** 페이지 번호 창 — 현재 페이지 주변 최대 5개. */
function pageWindow(current: number, total: number): number[] {
  const size = Math.min(5, total);
  const start = Math.max(1, Math.min(current - 2, total - size + 1));
  return Array.from({ length: size }, (_, index) => start + index);
}

function Pagination({ students }: { students: ReturnType<typeof useAdminStudents> }) {
  const page = students.page;
  if (page === null || page.page.totalPages <= 0) return null;

  const { page: current, totalPages, totalItems } = page.page;

  return (
    <nav
      aria-label="학생 명단 페이지"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "16px var(--card-pad)",
        borderTop: "1px solid var(--border-hairline)",
      }}
    >
      {pageWindow(current, totalPages).map((number) => (
        <button
          key={number}
          type="button"
          aria-label={`${number} 페이지`}
          aria-current={number === current ? "page" : undefined}
          onClick={() => students.setFilters({ page: number })}
          style={{
            minWidth: 32,
            height: 32,
            borderRadius: "var(--radius-xs)",
            border: "1px solid " + (number === current ? "var(--violet-800)" : "var(--border-hairline)"),
            background: number === current ? "var(--violet-800)" : "var(--surface-card)",
            color: number === current ? "#fff" : "var(--text-body)",
            fontWeight: number === current ? 800 : 600,
            fontSize: 13,
            fontFamily: "var(--font-body)",
            cursor: "pointer",
            fontFeatureSettings: '"tnum"',
          }}
        >
          {number}
        </button>
      ))}

      <Button
        variant="secondary"
        size="sm"
        disabled={current >= totalPages}
        iconRight={<Icons.arrowRight size={14} />}
        onClick={() => students.setFilters({ page: current + 1 })}
      >
        다음
      </Button>

      {/* 필터가 걸린 결과 수다 — 위 카드의 전체 집계와 다른 수다. */}
      <span style={{ marginLeft: 8, fontSize: 12.5, color: "var(--text-muted)", fontFeatureSettings: '"tnum"' }}>
        총 {num(totalItems)}명
      </span>
    </nav>
  );
}
