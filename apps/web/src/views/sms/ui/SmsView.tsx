"use client";

/**
 * 문자 발송 (명세 §5, flows ADMIN-F3) — 와이어프레임 SmsScreen 레이아웃 유지, 데이터는 전부
 * same-origin Nest API (계약 tag: Admin SMS).
 *
 * 이전 구현과 달라진 핵심:
 * - 대상 수·바이트·타입은 **서버 프리뷰**가 정한다. 화면이 예약을 긁어 세지 않는다.
 * - 기본 버튼은 프리뷰만 부른다. 실제 발송은 확인 대화상자의 명시적 확인에서만 나간다.
 * - 로그는 실제 배송 상태다 — 성공률도 확정된 건만 센다.
 * - 연락처는 어떤 경로로도 평문으로 보이지 않는다 (서버가 마스킹해서만 준다).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SendConfirmDialog,
  useSmsGateway,
  useSmsLogs,
  useSmsSendFlow,
  useSmsTemplates,
} from "@/features/send-sms";
import { useSeminarSessions } from "@/features/admin-overview";
import { SMS_VARIABLES, SURVEY_SMS_VARIABLES, smsByteLength } from "@/entities/sms";
import {
  BRANCH_LABELS,
  primarySample,
  SMS_AUDIENCE_LABELS,
  SMS_AUDIENCE_OPTIONS,
  type Branch,
  type SmsAudience,
  type SmsBatchStatus,
  type SmsTargetRequest,
} from "@/shared/api";
import { CAMPUS_INFO, type Campus } from "@/shared/config/campus";
import { fmtDateTimeShort, fmtSessionDate } from "@/shared/lib/format";
import { Badge, BrandMark, Button, Card, Icons, Select, Tag, Toast } from "@/shared/ui";

/**
 * 데스크톱 230 / 유동 / 300 은 스크린샷 그대로 두고, 좁아지면 계단식으로 접는다.
 * 어드민을 1280 보다 좁게 여는 경우가 있어 가로 스크롤이 생기면 안 된다 (minmax(0,…) 필수).
 */
const GRID_STYLES = `
  .npr-sms-grid {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr) 300px;
    gap: 14px;
    margin-top: 20px;
    align-items: start;
  }
  /* 폰 프리뷰가 먼저 아래로 — 편집 폭을 가장 오래 지킨다. */
  @media (max-width: 1180px) {
    .npr-sms-grid { grid-template-columns: 230px minmax(0, 1fr); }
    .npr-sms-preview { grid-column: 1 / -1; }
  }
  @media (max-width: 820px) {
    .npr-sms-grid { grid-template-columns: minmax(0, 1fr); }
  }
  /* 로그 표는 좁아지면 가로 스크롤을 표 안에서만 허용한다 — 페이지가 밀리지 않게. */
  .npr-sms-logs { overflow-x: auto; }
  .npr-sms-log-row {
    display: grid;
    grid-template-columns: 1.1fr 1.5fr 1.8fr 0.8fr 0.7fr 0.7fr 0.7fr;
    min-width: 720px;
  }
`;

const BRANCH_CAMPUS: Record<Branch, Campus> = {
  CAMPUS_A: "A캠퍼스",
  CAMPUS_B: "B캠퍼스",
  CAMPUS_C: "C캠퍼스",
};

const BRANCHES: Branch[] = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"];

/** 명세 §5.1 의 6종 + 설문 링크 — 서버가 수신자별로 치환한다. */
const VARIABLES = [...SMS_VARIABLES, ...SURVEY_SMS_VARIABLES.filter((v) => v === "{설문링크}")];

/** 발송 큐에 들어간 상태 — 로그에서 "성공/실패"로 세지 않는 중간 상태다. */
const PENDING_LABEL = "대기";

/** 계약 SmsBatchStatus — 서버가 판정한 배치 상태를 그대로 옮긴다. */
const BATCH_STATUS_LABELS: Record<SmsBatchStatus, string> = {
  QUEUED: "대기 중",
  PROCESSING: "발송 중",
  COMPLETED: "완료",
  PARTIAL: "일부 실패",
  FAILED: "실패",
};

const BATCH_STATUS_TONE: Record<SmsBatchStatus, "info" | "warning" | "danger" | "success"> = {
  QUEUED: "info",
  PROCESSING: "info",
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "danger",
};

export function SmsView() {
  const gateway = useSmsGateway();
  const sessions = useSeminarSessions();
  const templates = useSmsTemplates();

  /**
   * 편집 중인 초안. null 이면 "아직 아무것도 고치지 않았다"는 뜻이고, 그때 화면은 목록의 첫
   * 템플릿을 그대로 보여 준다 — effect 로 첫 항목을 밀어 넣지 않고 파생시킨다.
   */
  const [draft, setDraft] = useState<{ templateId: string | null; name: string; body: string } | null>(null);
  const [sessionChoice, setSessionChoice] = useState<string | null>(null);
  const [audience, setAudience] = useState<SmsAudience>("BOOKED_FAMILIES");
  const [branch, setBranch] = useState<Branch>("CAMPUS_A");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const flash = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // 첫 템플릿·첫 회차는 파생 기본값이다. 사용자가 한 번 고르면 그 선택이 목록보다 우선한다.
  const activeTemplates = templates.active;
  const fallbackTemplate = activeTemplates[0] ?? null;
  const current = draft ?? {
    templateId: fallbackTemplate?.templateId ?? null,
    name: fallbackTemplate?.name ?? "",
    body: fallbackTemplate?.body ?? "",
  };
  const { templateId, name, body } = current;

  const sessionId = sessionChoice ?? sessions.options[0]?.session.seminarSessionId ?? "";
  const session = sessions.options.find((option) => option.session.seminarSessionId === sessionId);
  const campus = BRANCH_CAMPUS[branch];
  const campusInfo = CAMPUS_INFO[campus];

  const selected = activeTemplates.find((template) => template.templateId === templateId) ?? null;
  const dirty = selected !== null && (selected.body !== body || selected.name !== name);

  /**
   * 발송 요청 (계약 oneOf: templateId **또는** message — 둘 다 보내면 400).
   *
   * 저장된 템플릿을 그대로 쓰는 중이면 `templateId` 를 보낸다. 그래야 서버가 템플릿 이름·버전을
   * 배치에 기록해 로그가 "직접 입력" 대신 실제 이름을 보여 주고, 템플릿의 제목(LMS)도 함께 나간다.
   * 본문이나 이름을 고친 뒤에는 편집 중인 내용이 곧 발송 내용이므로 `message` 로 보낸다 —
   * 저장하지 않은 수정이 조용히 빠지면 안 된다.
   */
  const request = useMemo<SmsTargetRequest | null>(() => {
    if (sessionId === "" || body.trim() === "") return null;
    const target = { branch, seminarSessionId: sessionId, audience };
    if (selected !== null && !dirty) return { ...target, templateId: selected.templateId };
    return { ...target, message: body };
  }, [branch, sessionId, audience, body, selected, dirty]);

  const logs = useSmsLogs({ branch, seminarSessionId: sessionId === "" ? undefined : sessionId });
  // 발송이 접수되면 로그를 다시 읽는다 — 화면이 지어낸 행이 아니라 서버가 준 행을 보여 준다.
  // 성공 문구도 202 응답의 수치만 쓴다.
  const flow = useSmsSendFlow(request, {
    onSent: (accepted) => {
      logs.reload();
      flash(`${accepted.templateName} · ${accepted.queuedCount}건을 발송 큐에 넣었어요.`);
    },
  });

  const setBody = (next: string) => setDraft({ ...current, body: next });

  const pickTemplate = (id: string) => {
    const template = activeTemplates.find((item) => item.templateId === id);
    if (template === undefined) return;
    setDraft({ templateId: template.templateId, name: template.name, body: template.body });
    templates.clearMutationError();
  };

  const insertVariable = (variable: string) => {
    const textarea = bodyRef.current;
    // 커서 위치에 넣는다 — 항상 끝에 붙이면 문장 중간에 변수를 넣을 수 없다.
    if (textarea === null) {
      setBody(body + variable);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBody(body.slice(0, start) + variable + body.slice(end));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  const doCreate = async () => {
    const created = await templates.create({
      name: `새 템플릿 ${activeTemplates.length + 1}`,
      body: body.trim() === "" ? "[npr] " : body,
    });
    if (created === null) return;
    setDraft({ templateId: created.templateId, name: created.name, body: created.body });
    flash("새 템플릿을 만들었어요.");
  };

  const doSave = async () => {
    if (templateId === null) return;
    const saved = await templates.save(templateId, { name, body });
    if (saved !== null) flash("템플릿을 저장했어요.");
  };

  const doArchive = async (id: string) => {
    const ok = await templates.archive(id);
    if (!ok) return;
    flash("템플릿을 삭제했어요.");
    if (templateId !== id) return;
    // 지운 템플릿이 열려 있었으면 남은 것 중 하나로 옮긴다.
    const next = activeTemplates.find((template) => template.templateId !== id) ?? null;
    setDraft(
      next === null
        ? { templateId: null, name: "", body: "" }
        : { templateId: next.templateId, name: next.name, body: next.body },
    );
  };

  /** 클라이언트 추정 — 확인 화면은 서버 값만 쓴다 (여기 숫자는 작성 중 참고용). */
  const estimatedBytes = smsByteLength(body);
  const estimatedLms = estimatedBytes > 90;

  /**
   * 폰 미리보기 — 프리뷰를 받은 뒤에는 서버 본문을, 그 전에는 예시 치환을 보여 준다.
   * 어느 쪽인지 캡션이 분명히 말한다.
   */
  const serverSample = flow.preview === null ? null : primarySample(flow.preview);
  const exampleRendered = body
    .replaceAll("{학생명}", "김수민")
    .replaceAll("{설명회명}", session?.seminarTitle ?? "")
    .replaceAll(
      "{일시}",
      session ? `${fmtSessionDate(new Date(session.session.startsAt))} ${new Date(session.session.startsAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "",
    )
    .replaceAll("{장소}", session?.session.location ?? "")
    .replaceAll("{QR링크}", "npr.kr/q/(예시)")
    .replaceAll("{문의전화}", campusInfo.inquiry)
    .replaceAll("{설문링크}", "npr.kr/s/(예시)");
  const phoneBody = serverSample?.message ?? exampleRendered;
  const phoneCaption = serverSample !== null
    ? `서버가 만든 실제 발송 본문 — ${serverSample.maskedRecipient} 기준`
    : "예시 미리보기 — 변수는 임의 예시 값이에요";

  const canPreview =
    request !== null && !flow.busy && !gateway.sendDisabled && !templates.busy;

  /** 확인 대화상자가 떠 있는 구간 — 실패 문구는 그 안에서만 보여 준다 (두 번 말하지 않게). */
  const confirmOpen = flow.phase === "confirming" || flow.phase === "sending";

  const sessionTitleOf = (id: string | null) =>
    sessions.options.find((option) => option.session.seminarSessionId === id)?.seminarTitle ?? null;

  return (
    <div data-screen-label="문자 발송">
      <style>{GRID_STYLES}</style>

      <div style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>SMS</div>
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>문자 발송</h1>
      </div>

      {gateway.warning !== null && (
        <div
          role="status"
          style={{
            marginTop: 14,
            padding: "11px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--border-soft)",
            fontSize: 13,
            color: "var(--text-body)",
          }}
        >
          {gateway.warning}
        </div>
      )}

      <div className="npr-sms-grid">
        {/* 템플릿 목록 (명세 §5.1) */}
        <Card padding="14px" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 60ms both" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 6px 10px" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-strong)", fontFamily: "var(--font-display)" }}>템플릿</span>
            <button
              type="button"
              onClick={() => void doCreate()}
              disabled={templates.busy}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--violet-800)", fontSize: 12, fontWeight: 700, cursor: templates.busy ? "default" : "pointer", opacity: templates.busy ? 0.5 : 1, fontFamily: "var(--font-body)" }}
            >
              <Icons.plus size={13} /> 생성
            </button>
          </div>

          {templates.loading && (
            <div style={{ padding: "18px 6px", fontSize: 12.5, color: "var(--text-faint)" }}>불러오는 중…</div>
          )}

          {!templates.loading && templates.error !== null && (
            <div style={{ padding: "6px 4px" }}>
              <p role="alert" style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--status-danger)", lineHeight: 1.5 }}>
                {templates.error}
              </p>
              <Button variant="secondary" size="sm" fullWidth onClick={templates.reload}>다시 시도</Button>
            </div>
          )}

          {!templates.loading && templates.error === null && activeTemplates.length === 0 && (
            <div style={{ padding: "18px 6px", fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
              아직 템플릿이 없어요. <b>생성</b>으로 첫 템플릿을 만들어 주세요.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activeTemplates.map((template) => {
              const current = template.templateId === templateId;
              return (
                <div
                  key={template.templateId}
                  style={{
                    position: "relative",
                    borderRadius: "var(--radius-sm)",
                    background: current ? "var(--surface-brand-soft)" : "transparent",
                    border: current ? "1.5px solid var(--violet-800)" : "1px solid var(--border-hairline)",
                    transition: "all var(--dur-fast) var(--ease-out)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => pickTemplate(template.templateId)}
                    aria-current={current}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "11px 30px 11px 12px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>
                      {template.name}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text-faint)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {template.body.split("\n")[0]}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={`${template.name} 템플릿 삭제`}
                    aria-label={`${template.name} 템플릿 삭제`}
                    onClick={() => void doArchive(template.templateId)}
                    disabled={templates.busy}
                    style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: 6, border: "none", background: "transparent", color: "var(--text-faint)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: templates.busy ? "default" : "pointer" }}
                  >
                    <Icons.x size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {templates.mutationError !== null && (
            <p role="alert" style={{ margin: "10px 2px 0", fontSize: 12, color: "var(--status-danger)", lineHeight: 1.5 }}>
              {templates.mutationError}
            </p>
          )}

          <Button
            variant="secondary"
            size="sm"
            fullWidth
            icon={<Icons.save size={14} />}
            onClick={() => void doSave()}
            disabled={templateId === null || templates.busy || !dirty}
            style={{ marginTop: 12 }}
          >
            {templates.busy ? "저장 중…" : dirty ? "현재 내용 저장" : "저장됨"}
          </Button>
        </Card>

        {/* 작성 영역 (명세 §5.1~5.3) */}
        <Card padding="20px" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 120ms both" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Select
              options={sessions.options.map((option) => ({
                label: `${option.seminarTitle} · ${fmtSessionDate(new Date(option.session.startsAt))}`,
                value: option.session.seminarSessionId,
              }))}
              value={sessionId}
              onChange={setSessionChoice}
              placeholder={sessions.loading ? "회차 불러오는 중…" : "설명회 회차 선택"}
              disabled={sessions.loading || sessions.options.length === 0}
              style={{ flex: 1, minWidth: 220 }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SMS_AUDIENCE_OPTIONS.map((option) => (
                <Tag
                  key={option.value}
                  selected={audience === option.value}
                  onClick={() => setAudience(option.value)}
                  style={{ height: 32 }}
                >
                  {option.label}
                </Tag>
              ))}
            </div>
          </div>

          {sessions.error !== null && (
            <p role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--status-danger)" }}>
              {sessions.error}{" "}
              <button type="button" onClick={sessions.reload} style={{ background: "none", border: "none", color: "var(--violet-800)", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>
                다시 시도
              </button>
            </p>
          )}

          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)", marginRight: 2 }}>캠퍼스</span>
            {BRANCHES.map((value) => (
              <Tag key={value} selected={branch === value} onClick={() => setBranch(value)} style={{ height: 30 }}>
                {BRANCH_LABELS[value]}
              </Tag>
            ))}
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11.5, color: "var(--text-muted)", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)", borderRadius: "var(--radius-pill)", padding: "5px 11px", fontFeatureSettings: '"tnum"' }}>
              <Icons.phone size={11} /> 발신·문의 <b style={{ color: "var(--text-strong)" }}>{campusInfo.sender}</b>
            </span>
          </div>

          {/* 이름은 여기서 고친다 — 저장하면 본문과 함께 한 번의 PATCH 로 나간다. */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <label htmlFor="npr-sms-template-name" style={{ fontSize: 11.5, color: "var(--text-faint)", flexShrink: 0 }}>
              템플릿 이름
            </label>
            <input
              id="npr-sms-template-name"
              value={name}
              onChange={(event) => setDraft({ ...current, name: event.target.value })}
              disabled={templateId === null || templates.busy}
              maxLength={160}
              placeholder={templateId === null ? "템플릿을 먼저 선택하세요" : "템플릿 이름"}
              style={{
                flex: 1,
                minWidth: 0,
                height: 32,
                padding: "0 11px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-soft)",
                background: templateId === null ? "var(--surface-sunken)" : "var(--surface-card)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text-strong)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <label htmlFor="npr-sms-body" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
            문자 본문
          </label>
          <textarea
            id="npr-sms-body"
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={flow.busy}
            rows={9}
            style={{ width: "100%", marginTop: 10, padding: "14px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.65, color: "var(--text-strong)", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)", marginRight: 2 }}>변수</span>
            {VARIABLES.map((variable) => (
              <button
                key={variable}
                type="button"
                onClick={() => insertVariable(variable)}
                disabled={flow.busy}
                style={{ padding: "4px 10px", borderRadius: "var(--radius-pill)", border: "1px dashed var(--mint-500)", background: "var(--mint-50)", color: "var(--mint-700)", fontSize: 12, fontWeight: 700, cursor: flow.busy ? "default" : "pointer", fontFamily: "var(--font-body)" }}
              >
                {variable}
              </button>
            ))}
            <span
              title="작성 중 참고용 추정치예요. 최종 바이트·타입은 발송 확인 화면에서 서버가 알려 줘요."
              style={{ marginLeft: "auto", fontSize: 12, color: estimatedLms ? "var(--status-warning)" : "var(--text-faint)", fontFeatureSettings: '"tnum"' }}
            >
              약 {estimatedBytes} byte · {estimatedLms ? "LMS" : "SMS"} (추정)
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-hairline)", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }} aria-live="polite">
              {flow.preview !== null ? (
                <>
                  수신 대상{" "}
                  <b style={{ color: "var(--text-strong)", fontFeatureSettings: '"tnum"' }}>
                    {flow.preview.recipientCount}명
                  </b>{" "}
                  · {BRANCH_LABELS[flow.preview.branch]}캠퍼스 · {SMS_AUDIENCE_LABELS[flow.preview.audience]}
                </>
              ) : (
                <>
                  수신 대상은 <b style={{ color: "var(--text-strong)" }}>발송 확인</b> 시 서버가 알려 줘요 · {campus} ·{" "}
                  {SMS_AUDIENCE_LABELS[audience]}
                </>
              )}
            </span>
            <Button
              disabled={!canPreview}
              onClick={flow.requestPreview}
              icon={<Icons.send size={15} />}
            >
              {flow.phase === "previewing" ? "대상 확인 중…" : "발송 확인"}
            </Button>
          </div>

          {/* 확정 실패는 흐름이 대화상자를 닫으므로 여기서 이어 말한다. */}
          {flow.error !== null && !confirmOpen && (
            <p role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--status-danger)" }}>
              {flow.error}
            </p>
          )}
        </Card>

        {/* 모바일 프리뷰 (명세 §5.5) */}
        <div className="npr-sms-preview" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 180ms both" }}>
          <div style={{ width: 280, margin: "0 auto", borderRadius: 38, background: "var(--violet-950)", padding: 10, boxShadow: "var(--shadow-float)" }}>
            <div style={{ borderRadius: 30, background: "var(--surface-sunken)", overflow: "hidden" }}>
              <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 78, height: 18, borderRadius: 12, background: "var(--violet-950)" }} />
              </div>
              <div style={{ padding: "8px 14px 6px", textAlign: "center", borderBottom: "1px solid var(--border-hairline)" }}>
                <BrandMark size={34} radius="50%" style={{ margin: "0 auto" }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-strong)", marginTop: 4 }}>npr 입시설명회</div>
              </div>
              <div style={{ padding: "14px 12px 18px", minHeight: 260 }}>
                <div style={{ fontSize: 10, color: "var(--text-faint)", textAlign: "center", marginBottom: 10 }}>
                  {serverSample !== null ? "발송 예정" : "예시"}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                  <div key={phoneBody} style={{ maxWidth: 200, padding: "10px 12px", borderRadius: "4px 16px 16px 16px", background: "var(--surface-card)", border: "1px solid var(--border-hairline)", fontSize: 12, lineHeight: 1.6, color: "var(--text-strong)", whiteSpace: "pre-wrap", wordBreak: "break-word", animation: "ds-pop var(--dur-base) var(--ease-spring) both" }}>
                    {phoneBody || "내용을 입력하세요"}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-faint)", marginTop: 8, lineHeight: 1.5 }}>
            {phoneCaption}
          </div>
        </div>
      </div>

      {/* 발송 로그 (명세 §5.4) */}
      <Card padding="0" style={{ marginTop: 14, overflow: "hidden", animation: "ds-fade-up var(--dur-slow) var(--ease-out) 240ms both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 20px", borderBottom: "1px solid var(--border-hairline)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>발송 로그</span>
          <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
            {campus} · {session?.seminarTitle ?? "선택한 회차"}
          </span>
          <span style={{ flex: 1 }} />
          {logs.successRate !== null && (
            <Badge tone="success" size="sm">성공률 {logs.successRate}%</Badge>
          )}
          <button
            type="button"
            onClick={logs.reload}
            disabled={logs.refreshing}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--violet-800)", fontSize: 12, fontWeight: 700, cursor: logs.refreshing ? "default" : "pointer", opacity: logs.refreshing ? 0.5 : 1 }}
          >
            <Icons.refresh size={12} /> {logs.refreshing ? "새로고침 중…" : "새로고침"}
          </button>
        </div>

        <div className="npr-sms-logs">
          <div className="npr-sms-log-row" style={{ padding: "10px 20px", background: "var(--surface-sunken)", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)" }}>
            <span>발송 시각</span><span>템플릿</span><span>설명회</span><span>캠퍼스</span><span>수신</span><span>성공</span><span>실패</span>
          </div>

          {logs.loading && (
            <div style={{ padding: "22px 20px", fontSize: 13, color: "var(--text-faint)" }}>불러오는 중…</div>
          )}

          {logs.error !== null && (
            <div style={{ padding: "18px 20px" }} role="alert">
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--status-danger)" }}>{logs.error}</p>
              <Button variant="secondary" size="sm" onClick={logs.reload}>다시 시도</Button>
            </div>
          )}

          {!logs.loading && logs.error === null && logs.rows.length === 0 && (
            <div style={{ padding: "26px 20px", fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>
              이 조건으로 발송한 기록이 아직 없어요.
            </div>
          )}

          {logs.rows.map((row, index) => (
            <div
              key={row.id}
              className="npr-sms-log-row"
              style={{ padding: "11px 20px", borderTop: "1px solid var(--border-hairline)", fontSize: 13, color: "var(--text-body)", fontFeatureSettings: '"tnum"', animation: `ds-fade-up var(--dur-base) var(--ease-out) ${Math.min(index, 8) * 50}ms both` }}
            >
              <span>{fmtDateTimeShort(new Date(row.createdAt))}</span>
              <span style={{ fontWeight: 600, color: "var(--text-strong)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {/* 배치는 서버가 이름을 주고, 배치 밖 단건은 이름이 없을 수 있다 — 지어내지 않는다. */}
                  {row.templateName ?? (row.maskedRecipient !== null ? `수신 ${row.maskedRecipient}` : "—")}
                </span>
                {row.audience !== null && <Badge tone="info" size="sm">{SMS_AUDIENCE_LABELS[row.audience]}</Badge>}
                {row.status !== null && row.status !== "COMPLETED" && (
                  <Badge tone={BATCH_STATUS_TONE[row.status]} size="sm">{BATCH_STATUS_LABELS[row.status]}</Badge>
                )}
              </span>
              <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sessionTitleOf(row.seminarSessionId) ?? "—"}
              </span>
              <span>{BRANCH_LABELS[row.branch]}</span>
              <span>{row.recipientCount}명</span>
              <span style={{ color: "var(--status-success)", fontWeight: 700 }}>{row.successCount}</span>
              <span style={{ color: row.failureCount ? "var(--status-danger)" : "var(--text-faint)", fontWeight: row.failureCount ? 700 : 400 }}>
                {row.failureCount}
                {row.pendingCount > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
                    {PENDING_LABEL} {row.pendingCount}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <SendConfirmDialog
        open={confirmOpen}
        preview={flow.preview}
        busy={flow.phase === "sending"}
        error={flow.error}
        retryable={flow.retryable}
        sendDisabled={gateway.sendDisabled}
        onConfirm={flow.confirmSend}
        onCancel={flow.cancel}
      />

      {toast && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", zIndex: 120 }}>
          <Toast tone="success">{toast}</Toast>
        </div>
      )}
    </div>
  );
}
