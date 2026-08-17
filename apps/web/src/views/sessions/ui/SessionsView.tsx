"use client";

/**
 * 설명회 운영 (명세 §6, flows ADMIN-F4) — 와이어프레임 SessionsScreen 이식(POC 복원).
 *
 * ★ POC 의 화면 구성(4개 카드·설문 보내기·결과)을 그대로 되살린다. 다만 **조작은 붙이지
 *   않는다**: 새 설명회·종료·삭제·설문 발송·엑셀 저장은 계약에 아직 없어서, 눌러도 성공한 척
 *   보여 주느니 **비활성(disabled)** 으로 원래 자리에 두고 "API 연결 전"을 스크린리더까지 알린다.
 *   가짜 성공을 만들지 않는다.
 *
 * ★ 4개 카드(총 예약·입장 완료·입장인원·취소)와 좌측 모든 회차의 숫자는 회차 목록이 함께 주는
 *   `operationsSummary` 실집계다. 정원·예약률·좌석 원장은 운영 화면에 노출하지 않는다.
 *
 * ★ 설문 결과 표는 계약 GET survey-responses 의 실데이터다 — 응답마다 `participant`(캠퍼스·단위·
 *   학생·반·담임·학부모 연락처)까지 와서 POC 의 8열(캠퍼스·단위명·학생명·반명·담임명·학부모HP·
 *   별점·후기)을 그대로 채운다. 보내기 카드의 문구·변수·바이트는 **미리보기(예시)** 이며 편집 불가다.
 */

import { useMemo, useState } from "react";
import { useGuestBookingToggle, useSeminarSessions, useSessionSurvey } from "@/features/admin-overview";
import { PosterAdminPanel } from "@/features/admin-poster";
import {
  BRANCH_LABELS,
  type SeminarSessionOption,
  type SeminarSessionStatus,
} from "@/shared/api";
import { isLms, smsByteLength, SURVEY_SMS_VARIABLES } from "@/entities/sms";
import { fmtDateTimeShort, fmtSessionDate } from "@/shared/lib/format";
import { fmtPhone } from "@/shared/lib/phone";
import { SEMINAR_LOCATION } from "@/shared/lib/seminar";
import { Badge, BRAND_SMS_TAG, Button, Card, EmptyState, Icons, StatCard, Switch } from "@/shared/ui";

const STATUS_LABELS: Record<SeminarSessionStatus, string> = {
  DRAFT: "작성 중",
  OPEN: "예약 열림",
  CLOSED: "예약 마감",
  CANCELLED: "취소됨",
  ARCHIVED: "보관됨",
};

const STATUS_TONES: Record<SeminarSessionStatus, "neutral" | "brand" | "accent" | "danger"> = {
  DRAFT: "neutral",
  OPEN: "brand",
  CLOSED: "neutral",
  CANCELLED: "danger",
  ARCHIVED: "neutral",
};

/** 조작이 계약에 붙기 전이라는 사실을 스크린리더까지 알리는 공통 꼬리표. */
const PENDING = "API 연결 전";

/** 시각적으로 숨기고 스크린리더에만 읽히는 텍스트 — DS Button 은 aria-label 을 받지 않아, 비활성 사유를 접근名에 보탠다. */
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * 설문 문자 **미리보기(예시)** — 계약에 회차별 설문 문구 필드가 없다. 편집·발송이 붙기 전까지
 * 바이트 감을 주기 위한 예시일 뿐이라 read-only 로만 보여 준다(가짜 저장을 만들지 않는다).
 */
const SURVEY_SMS_PREVIEW =
  `${BRAND_SMS_TAG} {학생명} 학부모님, 설명회에 참석해 주셔서 감사합니다. 아래 링크에서 별점·후기를 남겨 주세요 → {설문링크}`;

/** 만족도 결과 표 — POC 8열(캠퍼스·단위명·학생명·반명·담임명·학부모HP·별점·후기). */
const SURVEY_COLS = "80px 52px 72px 66px 66px 118px 92px 1.6fr";
const SURVEY_MIN_WIDTH = 860;

export function SessionsView() {
  const sessions = useSeminarSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* 좌측 사이드바 폭 드래그 조절 (명세 §6.1: 190~460px) */
  const [sideW, setSideW] = useState(300);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const sw = sideW;
    const mv = (ev: MouseEvent) => setSideW(Math.max(190, Math.min(460, sw + ev.clientX - sx)));
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  const selected = useMemo<SeminarSessionOption | null>(
    () => sessions.options.find((o) => o.session.seminarSessionId === selectedId) ?? sessions.options[0] ?? null,
    [sessions.options, selectedId],
  );

  const survey = useSessionSurvey(selected?.session.seminarSessionId ?? null);
  // 회차별 비재원생 예약 허용 토글 — 계약 PATCH 가 있는 **활성** 조작이다(POC 비활성 링크와 다르다).
  const guestToggle = useGuestBookingToggle(sessions.reload);

  const previewBytes = smsByteLength(SURVEY_SMS_PREVIEW);

  if (sessions.loading) {
    return (
      <div data-screen-label="설명회 운영 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>설명회를 불러오는 중이에요…</div>
      </div>
    );
  }

  if (sessions.error !== null) {
    return (
      <div data-screen-label="설명회 운영 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        <div role="alert" style={{ padding: "60px 0", textAlign: "center" }}>
          <p style={{ fontSize: 13.5, color: "var(--text-body)", margin: "0 0 12px" }}>{sessions.error}</p>
          <Button variant="secondary" size="sm" onClick={sessions.reload}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  if (selected === null) {
    return (
      <div data-screen-label="설명회 운영 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>등록된 설명회가 없어요.</div>
      </div>
    );
  }

  const session = selected.session;
  /** 회차 목록이 항목마다 함께 준 실집계 — 별도 요청 없이 바로 읽는다(근사·로딩 없음). */
  const summary = session.operationsSummary;
  const scope = session.branch === null ? "전체" : BRANCH_LABELS[session.branch];

  return (
    <div data-screen-label="설명회 운영 대시보드">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>QR OPERATIONS</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        </div>
        {/* POC 위치(우상단)에 '새 설명회'를 되살리되, 생성 계약이 붙기 전이라 비활성이다. */}
        <Button icon={<Icons.plus size={16} />} disabled>
          새 설명회<span style={SR_ONLY}> 만들기 — {PENDING}</span>
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `${sideW}px 14px 1fr`, marginTop: 20, alignItems: "start" }}>
        {/* 회차 목록 (명세 §6.1) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.options.map((option, i) => {
            const item = option.session;
            const sel = item.seminarSessionId === session.seminarSessionId;
            // 목록이 항목마다 operationsSummary 를 함께 주므로 모든 행이 자기 실집계를 쓴다.
            const rowActive = item.operationsSummary.activeCount;
            const rowCheckedIn = item.operationsSummary.checkedInCount;
            return (
              <button
                key={item.seminarSessionId}
                type="button"
                aria-pressed={sel}
                onClick={() => {
                  setSelectedId(item.seminarSessionId);
                  guestToggle.clearStatus();
                }}
                style={{ width: "100%", textAlign: "left", fontFamily: "inherit", padding: "16px 18px", borderRadius: "var(--radius-lg)", cursor: "pointer", background: sel ? "var(--surface-brand-soft)" : "var(--surface-card)", color: "var(--text-body)", border: sel ? "1.5px solid var(--violet-800)" : "1px solid var(--border-hairline)", boxShadow: sel ? "var(--shadow-accent-glow)" : "var(--shadow-card)", transform: sel ? "scale(1.02)" : "scale(1)", transition: "all var(--dur-base) var(--ease-spring)", animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${Math.min(i, 10) * 70}ms both` }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: sel ? "var(--text-brand)" : "var(--text-strong)", lineHeight: 1.4 }}>
                  {option.seminarTitle}
                </div>
                <div style={{ fontSize: 12, marginTop: 5, color: "var(--text-muted)" }}>
                  {fmtSessionDate(new Date(item.startsAt))} · {item.branch === null ? "전체" : BRANCH_LABELS[item.branch]}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 11.5, color: sel ? "var(--text-brand)" : "var(--text-muted)", fontFeatureSettings: '"tnum"' }}>
                  <span>예약 <b>{rowActive.toLocaleString("ko-KR")}</b>건</span>
                  <span aria-hidden="true">·</span>
                  <span>입장 <b>{rowCheckedIn.toLocaleString("ko-KR")}</b>건</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 폭 조절 핸들 (명세 §6.1) */}
        <div onMouseDown={startDrag} title="드래그하여 폭 조절" style={{ cursor: "col-resize", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 4, height: 52, borderRadius: 2, background: "var(--gray-3)" }} />
        </div>

        {/* 선택 회차 대시보드 */}
        <div key={session.seminarSessionId} style={{ display: "flex", flexDirection: "column", gap: 14, animation: "ds-fade-up var(--dur-base) var(--ease-out) both" }}>
          <Card padding="20px 24px" style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>{selected.seminarTitle}</h2>
                <Badge tone={STATUS_TONES[session.status]} size="sm">
                  {STATUS_LABELS[session.status]}
                </Badge>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                  <Icons.calendar size={13} /> {fmtDateTimeShort(new Date(session.startsAt))}
                </span>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                  <Icons.mapPin size={13} /> {SEMINAR_LOCATION}
                </span>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                  <Icons.users size={13} /> {scope}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
                예약 창구 {fmtDateTimeShort(new Date(session.bookingOpensAt))} ~ {fmtDateTimeShort(new Date(session.bookingClosesAt))}
              </div>
              {/*
                비재원생 예약 허용 — 계약 PATCH 가 붙은 **운영 가능한** 토글이다. 저장 중에는
                disabled + "저장 중", 성공/실패는 aria-live 로 짧게 알린다. 결과를 낙관적으로 확정하지 않는다.
              */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <Switch
                  checked={session.guestBookingEnabled}
                  disabled={guestToggle.savingId === session.seminarSessionId}
                  onChange={(next) => void guestToggle.toggle(session, next)}
                  label="비재원생 예약 허용"
                />
                <span
                  role="status"
                  aria-live="polite"
                  style={{ fontSize: 11.5, color: "var(--text-faint)", fontWeight: 600 }}
                >
                  {guestToggle.savingId === session.seminarSessionId
                    ? "저장 중…"
                    : guestToggle.status !== null
                      ? guestToggle.status
                      : session.guestBookingEnabled
                        ? "허용됨"
                        : "허용 안 함"}
                </span>
                {guestToggle.error !== null && (
                  <span role="alert" style={{ fontSize: 11.5, color: "var(--status-danger)", fontWeight: 600 }}>
                    {guestToggle.error}
                  </span>
                )}
              </div>
            </div>
            {/* POC 위치(우측)에 종료·삭제를 되살리되, 두 조작 모두 계약 연결 전이라 비활성이다. */}
            <div style={{ display: "flex", gap: 14 }}>
              <PendingLink icon={<Icons.check size={12} />} label="설명회 종료" tone="var(--text-muted)" />
              <PendingLink icon={<Icons.trash size={12} />} label="삭제" tone="var(--status-danger)" />
            </div>
          </Card>

          {/*
            현황 스탯 — 총 예약·입장 완료·입장인원·취소. 목록 항목의 operationsSummary
            실집계다(노쇼·테스트 예약 제외).

            ★ 단위가 섞여 있다. 총 예약·입장 완료·취소는 **가족 예약 건수**이고,
              입장인원만 **사람 수**다. 그래서 suffix 로 건/명을 분명히 갈라 둔다 —
              한 가족이 두 명 들어오면 입장 완료 1건에 입장인원 2명이다.

            미체크(RESERVED 건수)를 뺀 자리다. 운영 중 실제로 묻는 것은 "지금 안에 몇 명
            있나"이고, 안 온 사람 수는 총 예약에서 빼면 나온다.
          */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatCard label="총 예약" value={summary.activeCount} suffix="건" tone="brand" icon={<Icons.ticket size={15} />} delay={0} />
            <StatCard label="입장 완료" value={summary.checkedInCount} suffix="건" tone="success" icon={<Icons.check size={15} />} delay={50} />
            <StatCard label="입장인원" value={summary.attendedPeopleCount} suffix="명" tone="accent" icon={<Icons.users size={15} />} delay={100} />
            <StatCard label="취소" value={summary.cancelledCount} suffix="건" tone="danger" icon={<Icons.x size={15} />} delay={150} />
          </div>

          {/* 만족도 설문 보내기 — 문구·변수·바이트 미리보기(read-only) + 발송 비활성 */}
          <Card padding="18px 20px">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.star size={15} style={{ color: "var(--mint-600)" }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>만족도 설문 보내기</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                대상: 입장 완료{" "}
                <b style={{ color: "var(--text-strong)", fontFeatureSettings: '"tnum"' }}>{summary.checkedInCount}건</b>
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4, marginBottom: 10 }}>
              학부모님이 문자 속 URL 로 들어가 <b>별점 · 후기</b>를 남깁니다. 문구 편집·발송은 <b>{PENDING}</b>이라 아래는 미리보기(예시)예요.
            </div>
            <textarea
              value={SURVEY_SMS_PREVIEW}
              readOnly
              rows={3}
              aria-label={`설문 문자 미리보기(예시) — 편집은 ${PENDING}`}
              style={{ width: "100%", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-sunken)", fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-muted)", resize: "none", outline: "none", boxSizing: "border-box", cursor: "not-allowed" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>변수</span>
              {SURVEY_SMS_VARIABLES.map((v) => (
                <span
                  key={v}
                  aria-disabled="true"
                  title={`${v} 변수 — ${PENDING}`}
                  style={{ padding: "4px 10px", borderRadius: "var(--radius-pill)", border: "1px dashed var(--border-soft)", background: "var(--surface-sunken)", color: "var(--text-faint)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-body)", cursor: "not-allowed" }}
                >
                  {v}
                </span>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 12, color: previewBytes > 90 ? "var(--status-warning)" : "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>
                {previewBytes} byte · {isLms(SURVEY_SMS_PREVIEW) ? "LMS" : "SMS"} (추정)
              </span>
              <Button size="sm" icon={<Icons.send size={14} />} disabled>
                설문 보내기<span style={SR_ONLY}> — {PENDING}</span>
              </Button>
            </div>
          </Card>

          {/* 만족도 설문 결과 (명세 §6.5) — 계약 실데이터 */}
          <Card padding="0" style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderBottom: "1px solid var(--border-hairline)", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>만족도 설문 결과</span>
              <span style={{ fontSize: 12.5, color: "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>
                {survey.loading ? "불러오는 중…" : `${survey.totalItems}건`}
                {!survey.loading && summary.checkedInCount > 0 && (
                  <> · 응답률 {Math.round((survey.totalItems / summary.checkedInCount) * 100)}%</>
                )}
              </span>
              <span style={{ flex: 1 }} />
              {survey.summary !== null && survey.summary.averageRating !== null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "var(--mint-600)" }}>
                  <Icons.star size={13} style={{ color: "var(--mint-500)" }} /> 평균 {survey.summary.averageRating.toFixed(1)}
                </span>
              )}
              <Button variant="ghost" size="sm" icon={<Icons.download size={13} />} disabled>
                엑셀 저장<span style={SR_ONLY}> — {PENDING}</span>
              </Button>
            </div>

            {survey.error !== null ? (
              <div role="alert" style={{ padding: "32px 20px", textAlign: "center" }}>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-body)" }}>{survey.error}</p>
                <Button variant="secondary" size="sm" onClick={survey.reload}>
                  다시 시도
                </Button>
              </div>
            ) : survey.loading ? (
              <EmptyState>설문 결과를 불러오는 중이에요…</EmptyState>
            ) : survey.items.length === 0 ? (
              <EmptyState>아직 응답이 없어요.</EmptyState>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: SURVEY_MIN_WIDTH }}>
                  <div style={{ display: "grid", gridTemplateColumns: SURVEY_COLS, gap: 10, padding: "10px 20px", background: "var(--surface-sunken)", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)" }}>
                    <span>캠퍼스</span>
                    <span>단위명</span>
                    <span>학생명</span>
                    <span>반명</span>
                    <span>담임명</span>
                    <span>학부모HP</span>
                    <span>별점</span>
                    <span>후기</span>
                  </div>
                  {survey.items.map((response, i) => {
                    const p = response.participant;
                    const longComment = response.comment !== null && response.comment.length > 20;
                    return (
                      <div
                        key={response.surveyResponseId}
                        style={{ display: "grid", gridTemplateColumns: SURVEY_COLS, gap: 10, alignItems: "center", padding: "11px 20px", borderTop: "1px solid var(--border-hairline)", fontSize: 12.5, color: "var(--text-body)", animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(i, 10) * 30}ms both` }}
                      >
                        <span>{BRANCH_LABELS[p.branch]}</span>
                        <span>{p.unitName ?? "—"}</span>
                        <span style={{ fontWeight: 700, color: "var(--text-strong)" }}>{p.studentName}</span>
                        <span>{p.className}</span>
                        {/* 과학 전용 등 수학 담임이 없으면 계약이 null — 그대로 —로 보인다. */}
                        <span>{p.teacherName ?? "—"}</span>
                        <span style={{ fontFeatureSettings: '"tnum"', fontSize: 11.5 }}>{fmtPhone(p.contact)}</span>
                        <span style={{ display: "flex", gap: 1 }}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <svg key={n} width={11} height={11} viewBox="0 0 24 24" fill={n <= response.rating ? "var(--mint-500)" : "none"} stroke={n <= response.rating ? "var(--mint-500)" : "var(--gray-3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z" />
                            </svg>
                          ))}
                        </span>
                        <span title={response.comment ?? ""} style={{ color: response.comment !== null ? "var(--text-body)" : "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: longComment ? "help" : "default" }}>
                          {response.comment ?? "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 첫 페이지만 받았다면 그렇게 말한다 — 목록 길이를 전체인 척하지 않는다. */}
            {survey.truncated && (
              <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border-hairline)", fontSize: 11.5, color: "var(--text-faint)", textAlign: "right" }}>
                최근 {survey.items.length}건만 보여 주고 있어요 (전체 {survey.totalItems}건). 평균 별점은 전체 기준이에요.
              </div>
            )}
          </Card>
        </div>
      </div>

      {/*
        공개 진입면(`/`) 포스터 관리 — 선택 회차에 매이지 않는 **전역** 설정이라, 회차별 대시보드
        아래 전체 폭 영역에 둔다(예전 허브에 있던 패널을 여기로 옮겼다). 회차 카드가 아니다.
      */}
      <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--border-hairline)", animation: "ds-fade-up var(--dur-slow) var(--ease-out) 120ms both" }}>
        <PosterAdminPanel />
      </div>
    </div>
  );
}

/**
 * POC 의 밑줄 링크(종료·삭제) 자리를 지키되 **비활성**으로 둔다. 진짜 disabled 인 `<button>`
 * 이라 클릭·포커스가 막히고, aria-label 로 "API 연결 전"을 스크린리더까지 알린다.
 */
function PendingLink({ icon, label, tone }: { icon: React.ReactNode; label: string; tone: string }) {
  return (
    <button
      type="button"
      disabled
      aria-label={`${label} — ${PENDING}`}
      title={PENDING}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: 0,
        background: "none",
        border: "none",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 600,
        color: tone,
        textDecoration: "underline",
        textUnderlineOffset: 3,
        opacity: 0.5,
        cursor: "not-allowed",
        whiteSpace: "nowrap",
      }}
    >
      {icon} {label}
    </button>
  );
}
