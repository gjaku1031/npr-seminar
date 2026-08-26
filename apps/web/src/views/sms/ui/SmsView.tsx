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

import { useEffect, useRef, useState } from "react";
import {
  SendConfirmDialog,
  useSmsGateway,
  useSmsLogs,
  useSmsSendFlow,
  useSmsTemplates,
  useSmsTemplatePolicy,
  useSmsAudienceCounts,
} from "@/features/send-sms";
import { useSeminarSessions } from "@/features/admin-overview";
import { policyForPurpose, smsByteLength } from "@/entities/sms";
import {
  BRANCH_LABELS,
  primarySample,
  SMS_AUDIENCE_LABELS,
  SMS_AUDIENCE_OPTIONS,
  type Branch,
  type SmsAudience,
  type SmsBatchStatus,
  type SmsEditablePurpose,
  type SmsTargetRequest,
} from "@/shared/api";
import { CAMPUS_INFO, type Campus } from "@/shared/config/campus";
import { fmtDateTimeShort, fmtSessionDate } from "@/shared/lib/format";
import { SEMINAR_LOCATION } from "@/shared/lib/seminar";
import { Badge, BRAND_SMS_TAG, BrandMark, brandSeminarTitle, Button, Card, Icons, Select, Tag, Toast } from "@/shared/ui";

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
  SONGPA: "송파캠퍼스",
  WIRYE: "위례캠퍼스",
  GWANGJIN: "광진캠퍼스",
};

const BRANCHES: Branch[] = ["SONGPA", "WIRYE", "GWANGJIN"];

/** 관리자 그룹 발송 용도만 실제로 발송된다 — 나머지 용도는 이 화면에서 편집만 한다. */
const GROUP_PURPOSE: SmsEditablePurpose = "ADMIN_GROUP";

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

/** 서버 정책으로 편집 선택을 구성하고, 그룹 용도에서만 발송 프리뷰를 연다. */
export function SmsView() {
  const gateway = useSmsGateway();
  const sessions = useSeminarSessions();
  const templatePolicy = useSmsTemplatePolicy();
  const policy = templatePolicy.policy;
  const policyReady = policy !== null && !templatePolicy.loading && templatePolicy.error === null;
  const templates = useSmsTemplates(policy);

  /**
   * 편집 중인 초안. null 이면 "아직 아무것도 고치지 않았다"는 뜻이고, 그때 화면은 선택한 용도의 첫
   * 템플릿을 그대로 보여 준다 — effect 로 첫 항목을 밀어 넣지 않고 파생시킨다.
   *
   * `purpose` 는 이 초안이 (저장되면) 갖게 될 용도다. 에디터의 용도 Select 로 바뀌며, 저장된
   * 용도와 달라지면 dirty 가 된다.
   */
  const [draft, setDraft] = useState<
    { templateId: string | null; name: string; body: string; purpose: SmsEditablePurpose } | null
  >(null);
  /** 사용자가 고른 필터. 처음에는 서버의 defaultPurpose를 따른다. */
  const [purposeChoice, setPurposeChoice] = useState<SmsEditablePurpose | null>(null);
  const [sessionChoice, setSessionChoice] = useState<string | null>(null);
  const [audience, setAudience] = useState<SmsAudience>("BOOKED_FAMILIES");
  const [branch, setBranch] = useState<Branch>("SONGPA");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /** 성공 문구를 잠시 보여 주고, 연속 작업 시 이전 타이머를 취소한다. */
  const flash = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const purposeView = purposeChoice !== null && policyForPurpose(policy, purposeChoice) !== null
    ? purposeChoice : policy?.defaultPurpose ?? null;
  const viewPolicy = purposeView === null ? null : policyForPurpose(policy, purposeView);
  const purposeOptions = policy?.purposes.map((entry) => ({ value: entry.purpose, label: entry.label })) ?? [];
  // 편집 정책이 노출한 용도만 다룬다 — 자동 체크인 템플릿은 서버에 남아도 이 화면에서 제외한다.
  const editableTemplates = templates.active.filter((template) =>
    policyForPurpose(policy, template.purpose as SmsEditablePurpose) !== null,
  );
  // 왼쪽 목록에는 선택한 용도의 활성 템플릿만 보인다.
  const viewTemplates = editableTemplates.filter((template) => template.purpose === purposeView);
  // 첫 템플릿·첫 회차는 파생 기본값이다. 사용자가 한 번 고르면 그 선택이 목록보다 우선한다.
  const fallbackTemplate = viewTemplates[0] ?? null;
  const current = draft ?? {
    templateId: fallbackTemplate?.templateId ?? null,
    name: fallbackTemplate?.name ?? "",
    body: fallbackTemplate?.body ?? "",
    purpose: purposeView,
  };
  const { templateId, name, body, purpose } = current;
  const draftPurposeValid = purpose !== null && policyForPurpose(policy, purpose) !== null;
  const editorLocked = !policyReady || !draftPurposeValid;

  const sessionId = sessionChoice ?? sessions.options[0]?.session.seminarSessionId ?? "";
  // 대상 탭에 붙일 실제 수신 인원 — 캠퍼스·회차가 바뀌면 다시 센다.
  const audienceCounts = useSmsAudienceCounts(branch, sessionId === "" ? null : sessionId);
  const session = sessions.options.find((option) => option.session.seminarSessionId === sessionId);
  const campus = BRANCH_CAMPUS[branch];
  const campusInfo = CAMPUS_INFO[campus];

  // 선택 대상은 전체 목록에서 찾는다 — 초안이 용도를 바꿔 두면 그 행은 아직 옛 용도 뷰에 남아 있다.
  const selected = editableTemplates.find((template) => template.templateId === templateId) ?? null;
  const dirty =
    selected !== null && (selected.body !== body || selected.name !== name || selected.purpose !== purpose);
  /** 이 초안은 실제 그룹 발송 대상인가 — 그룹 용도가 아니면 프리뷰·발송을 만들지 않는다. */
  const isGroup = purpose === GROUP_PURPOSE;
  /** 화면 변수 칩은 서버 정책에서 초안의 현재 용도가 허용한 목록이다. */
  const variables = purpose === null ? [] : policyForPurpose(policy, purpose)?.variables ?? [];

  /**
   * 발송 요청 (계약 oneOf: templateId **또는** message — 둘 다 보내면 400).
   *
   * 저장된 템플릿을 그대로 쓰는 중이면 `templateId` 를 보낸다. 그래야 서버가 템플릿 이름·버전을
   * 배치에 기록해 로그가 "직접 입력" 대신 실제 이름을 보여 주고, 템플릿의 제목(LMS)도 함께 나간다.
   * 본문이나 이름을 고친 뒤에는 편집 중인 내용이 곧 발송 내용이므로 `message` 로 보낸다 —
   * 저장하지 않은 수정이 조용히 빠지면 안 된다.
   */
  // 발송 요청은 값싼 동기 계산이라 메모이제이션이 필요 없다 — 매 렌더에서 바로 만든다.
  const selectedTemplateId = selected?.templateId ?? null;
  const selectedIsGroup = selected !== null && selected.purpose === GROUP_PURPOSE;
  // 그룹 발송 용도만 실제로 나간다. 자동 발송 용도(OTP·예약)는 여기서 편집만 하고
  // templateId·message 어느 쪽으로도 발송 요청을 만들지 않는다. 초안이 용도를 그룹에서
  // 다른 값으로 바꿔 둔 경우도 isGroup 이 false 라 여기서 걸린다.
  let request: SmsTargetRequest | null = null;
  if (policyReady && isGroup && sessionId !== "" && body.trim() !== "") {
    const target = { branch, seminarSessionId: sessionId, audience };
    // 저장된 그룹 템플릿을 그대로 쓰는 중이면 templateId 를, 고쳤으면 편집 본문을 message 로.
    request =
      selectedTemplateId !== null && selectedIsGroup && !dirty
        ? { ...target, templateId: selectedTemplateId }
        : { ...target, message: body };
  }

  const logs = useSmsLogs({ branch, seminarSessionId: sessionId === "" ? undefined : sessionId });
  // 발송이 접수되면 로그를 다시 읽는다 — 화면이 지어낸 행이 아니라 서버가 준 행을 보여 준다.
  // 성공 문구도 202 응답의 수치만 쓴다.
  const flow = useSmsSendFlow(request, {
    onSent: (accepted) => {
      logs.reload();
      flash(`${accepted.templateName} · ${accepted.queuedCount}건을 발송 큐에 넣었어요.`);
    },
  });

  /** 본문 변경을 선택한 초안에 반영한다. 정책 조회 전에는 초안을 만들지 않는다. */
  const setBody = (next: string) => {
    if (purpose !== null) setDraft({ ...current, purpose, body: next });
  };

  /** 정책에 노출된 템플릿을 선택하고 서버 본문을 새 초안으로 연다. */
  const pickTemplate = (id: string) => {
    const template = editableTemplates.find((item) => item.templateId === id);
    if (template === undefined) return;
    const entry = policyForPurpose(policy, template.purpose as SmsEditablePurpose);
    if (entry === null) return;
    setDraft({
      templateId: template.templateId,
      name: template.name,
      body: template.body,
      purpose: entry.purpose,
    });
    templates.clearMutationError();
  };

  /** 용도 필터를 바꾸면 그 용도의 첫 템플릿을 파생 기본값으로 연다. */
  const changePurposeView = (next: SmsEditablePurpose) => {
    if (policyForPurpose(policy, next) === null) return;
    setPurposeChoice(next);
    setDraft(null);
    templates.clearMutationError();
  };

  /** 편집 용도 변경을 저장 전 초안에만 반영한다. */
  const changeDraftPurpose = (next: SmsEditablePurpose) => {
    if (policyForPurpose(policy, next) === null) return;
    setDraft({ ...current, purpose: next });
  };

  /** 변수 칩을 본문의 현재 커서 또는 선택 영역에 삽입한다. */
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

  /** 서버 정책의 라벨·접두어로 현재 용도의 새 템플릿을 만든다. */
  const doCreate = async () => {
    if (!policyReady || purposeView === null) return;
    const entry = policyForPurpose(policy, purposeView);
    if (entry === null) return;
    // 지금 보고 있는 용도로 만든다. 본문 기본값은 변수가 없어 어떤 용도에서도 유효하다.
    const created = await templates.create({
      name: `새 ${entry.label} 템플릿 ${viewTemplates.length + 1}`,
      body: `${BRAND_SMS_TAG} `,
      purpose: purposeView,
    });
    if (created === null) return;
    setDraft({
      templateId: created.templateId,
      name: created.name,
      body: created.body,
      purpose: purposeView,
    });
    flash("새 템플릿을 만들었어요.");
  };

  /** 현재 초안을 저장하고 서버가 반환한 용도·본문·버전으로 선택을 갱신한다. */
  const doSave = async () => {
    if (!policyReady || templateId === null || purpose === null) return;
    const saved = await templates.save(templateId, { name, body, purpose });
    if (saved === null) return;
    flash("템플릿을 저장했어요.");
    // 저장된 용도로 카테고리 뷰를 옮기되 선택은 유지한다 — 서버가 준 행이 진실이다.
    const savedPurpose = policyForPurpose(policy, saved.purpose as SmsEditablePurpose)?.purpose;
    if (savedPurpose === undefined) return;
    setPurposeChoice(savedPurpose);
    setDraft({ templateId: saved.templateId, name: saved.name, body: saved.body, purpose: savedPurpose });
  };

  /** 서버가 같은 용도의 기본 템플릿을 옮긴 결과를 목록에 반영한다. */
  const doSetDefault = async (id: string) => {
    if (!policyReady) return;
    const ok = await templates.setDefault(id);
    if (ok) flash("기본 템플릿으로 지정했어요.");
  };

  /** 보관·삭제 결과를 반영하고 현재 선택이 사라졌을 때 같은 용도의 다른 템플릿을 연다. */
  const doArchive = async (id: string) => {
    if (!policyReady || purposeView === null) return;
    const ok = await templates.archive(id);
    if (!ok) return;
    flash("템플릿을 삭제했어요.");
    if (templateId !== id) return;
    // 지운 템플릿이 열려 있었으면 같은 용도에 남은 것 중 하나로 옮긴다.
    const next = viewTemplates.find((template) => template.templateId !== id) ?? null;
    setDraft(
      next === null
        ? { templateId: null, name: "", body: "", purpose: purposeView }
        : { templateId: next.templateId, name: next.name, body: next.body, purpose: purposeView },
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
  // 로컬 예시 치환 — 지금 용도가 허용하는 변수를 모두 덮되 실제 데이터는 새지 않게 임의 예시값만 쓴다.
  const exampleRendered = body
    .replaceAll("{인증번호}", "123456")
    .replaceAll("{학생명}", "김수민")
    .replaceAll("{설명회명}", session?.seminarTitle ?? "")
    .replaceAll(
      "{일시}",
      session ? `${fmtSessionDate(new Date(session.session.startsAt))} ${new Date(session.session.startsAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "",
    )
    .replaceAll("{장소}", session === undefined ? "" : SEMINAR_LOCATION)
    .replaceAll("{예약확인링크}", "neulpureun.kr/b/(예시)")
    .replaceAll("{QR링크}", "neulpureun.kr/q/(예시)")
    .replaceAll("{문의전화}", campusInfo.inquiry);
  const phoneBody = serverSample?.message ?? exampleRendered;
  const phoneCaption = serverSample !== null
    ? `서버가 만든 실제 발송 본문 — ${serverSample.maskedRecipient} 기준`
    : "예시 미리보기 — 변수는 임의 예시 값이에요";

  const canPreview =
    request !== null && !flow.busy && !gateway.sendDisabled && !templates.busy;

  /** 확인 대화상자가 떠 있는 구간 — 실패 문구는 그 안에서만 보여 준다 (두 번 말하지 않게). */
  const confirmOpen = flow.phase === "confirming" || flow.phase === "sending";

  /** 로그의 회차 식별자를 현재 조회한 설명회 제목으로 바꾼다. */
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

      {(templatePolicy.loading || templatePolicy.error !== null || (policyReady && !draftPurposeValid)) && (
        <div role={templatePolicy.error !== null ? "alert" : "status"} style={{ marginTop: 14, padding: "11px 16px", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", border: "1px solid var(--border-soft)", fontSize: 13, color: templatePolicy.error !== null ? "var(--status-danger)" : "var(--text-body)" }}>
          {templatePolicy.loading ? "문자 편집 정책을 불러오는 중이에요. 편집은 잠시 기다려 주세요." :
            templatePolicy.error !== null ? templatePolicy.error : "이 초안의 용도가 현재 편집 정책에 없어요. 용도를 다시 선택해 주세요."}
          {templatePolicy.error !== null && (
            <Button variant="secondary" size="sm" onClick={templatePolicy.reload} style={{ marginLeft: 12 }}>정책 다시 시도</Button>
          )}
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
              disabled={!policyReady || templates.busy}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--violet-800)", fontSize: 12, fontWeight: 700, cursor: !policyReady || templates.busy ? "default" : "pointer", opacity: !policyReady || templates.busy ? 0.5 : 1, fontFamily: "var(--font-body)" }}
            >
              <Icons.plus size={13} /> 생성
            </button>
          </div>

          {/* 용도 필터 — 선택한 용도의 템플릿만 아래에 보인다. 생성도 이 용도로 만든다. */}
          <div style={{ padding: "0 4px 10px" }}>
            <Select
              portal
              label="용도"
              options={purposeOptions}
              value={purposeView ?? undefined}
              onChange={(next) => changePurposeView(next as SmsEditablePurpose)}
              disabled={!policyReady}
            />
            {viewPolicy !== null && <p style={{ margin: "6px 2px 0", fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5 }}>
              {purposeView === GROUP_PURPOSE
                ? "그룹 발송용 템플릿이에요. 아래에서 골라 발송할 수 있어요."
                : `${viewPolicy.label} 자동 발송용 템플릿이에요. 여기서 편집만 하고 그룹으로는 발송하지 않아요.`}
            </p>}
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

          {policyReady && !templates.loading && templates.error === null && viewTemplates.length === 0 && (
            <div style={{ padding: "18px 6px", fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
              이 용도에는 아직 템플릿이 없어요. <b>생성</b>으로 {viewPolicy?.label} 템플릿을 만들어 주세요.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {viewTemplates.map((template) => {
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
                    disabled={!policyReady}
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
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {template.name}
                      </span>
                      {template.isDefault && <Badge tone="brand" size="sm">기본</Badge>}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text-faint)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {template.body.split("\n")[0]}
                    </span>
                  </button>
                  <button
                    type="button"
                    // 현재 기본은 다른 템플릿을 기본으로 지정하기 전엔 보관할 수 없다 (서버도 거절한다).
                    title={template.isDefault ? `${template.name} 은 기본 템플릿이라 다른 템플릿을 기본으로 지정한 뒤에 삭제할 수 있어요` : `${template.name} 템플릿 삭제`}
                    aria-label={template.isDefault ? `${template.name} 템플릿 삭제 — 기본 템플릿이라 먼저 다른 템플릿을 기본으로 지정해야 해요` : `${template.name} 템플릿 삭제`}
                    onClick={() => void doArchive(template.templateId)}
                    disabled={!policyReady || templates.busy || template.isDefault}
                    style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: 6, border: "none", background: "transparent", color: "var(--text-faint)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: !policyReady || templates.busy || template.isDefault ? "default" : "pointer", opacity: template.isDefault ? 0.4 : 1 }}
                  >
                    <Icons.x size={12} />
                  </button>
                  {!template.isDefault && (
                    <div style={{ padding: "0 10px 9px 12px" }}>
                      <button
                        type="button"
                        onClick={() => void doSetDefault(template.templateId)}
                        disabled={!policyReady || templates.busy}
                        style={{ background: "none", border: "none", padding: 0, color: "var(--violet-800)", fontSize: 11.5, fontWeight: 700, cursor: !policyReady || templates.busy ? "default" : "pointer", opacity: !policyReady || templates.busy ? 0.5 : 1, fontFamily: "var(--font-body)" }}
                      >
                        이 목적의 기본으로 지정
                      </button>
                    </div>
                  )}
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
            disabled={editorLocked || templateId === null || templates.busy || !dirty}
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
            {/*
              대상 탭에 실제 수신 인원을 함께 붙인다 — 발송이 쓰는 것과 같은 선택 로직으로
              서버가 센 값이다. 인원을 모르는 동안에는 **0 을 그리지 않는다**: 0명과
              "아직 모름"은 다른 사실이고, 발송 화면에서 그 둘을 섞으면 위험하다.
            */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SMS_AUDIENCE_OPTIONS.map((option) => {
                const count = audienceCounts.countOf(option.value);
                return (
                  <Tag
                    key={option.value}
                    selected={audience === option.value}
                    onClick={() => setAudience(option.value)}
                    style={{ height: 32 }}
                  >
                    {option.label}
                    <span
                      style={{
                        marginLeft: 6,
                        fontFeatureSettings: '"tnum"',
                        fontWeight: 800,
                        opacity: count === null ? 0.45 : 0.85,
                      }}
                    >
                      {count === null ? (audienceCounts.loading ? "…" : "–") : `${count.toLocaleString("ko-KR")}명`}
                    </span>
                  </Tag>
                );
              })}
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
              onChange={(event) => {
                if (purpose !== null) setDraft({ ...current, purpose, name: event.target.value });
              }}
              disabled={editorLocked || templateId === null || templates.busy}
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

          {/* 이 초안의 용도 — 저장하면 이 용도로 나간다(그룹만 실제 발송). 바꾸면 dirty 가 된다. */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)", flexShrink: 0 }}>용도</span>
            <Select
              portal
              options={purposeOptions}
              value={purpose ?? undefined}
              onChange={(next) => changeDraftPurpose(next as SmsEditablePurpose)}
              disabled={!policyReady || templateId === null || templates.busy}
              style={{ minWidth: 200 }}
            />
            {!isGroup && (
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                자동 발송용 — 여기서 편집만 하고 발송하지 않아요.
              </span>
            )}
          </div>

          <label htmlFor="npr-sms-body" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
            문자 본문
          </label>
          <textarea
            id="npr-sms-body"
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={editorLocked || flow.busy}
            rows={9}
            style={{ width: "100%", marginTop: 10, padding: "14px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--surface-card)", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.65, color: "var(--text-strong)", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)", marginRight: 2 }}>변수</span>
            {variables.map((variable) => (
              <button
                key={variable}
                type="button"
                onClick={() => insertVariable(variable)}
                disabled={editorLocked || flow.busy}
                style={{ padding: "4px 10px", borderRadius: "var(--radius-pill)", border: "1px dashed var(--mint-500)", background: "var(--mint-50)", color: "var(--mint-700)", fontSize: 12, fontWeight: 700, cursor: editorLocked || flow.busy ? "default" : "pointer", fontFamily: "var(--font-body)" }}
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
              {!isGroup ? (
                <>
                  이 용도는 <b style={{ color: "var(--text-strong)" }}>편집 전용</b>이에요 · 자동 발송 템플릿이라 이 화면에서 발송하지 않아요
                </>
              ) : flow.preview !== null ? (
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
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-strong)", marginTop: 4 }}>{brandSeminarTitle()}</div>
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
