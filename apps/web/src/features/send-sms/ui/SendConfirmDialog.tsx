"use client";

/**
 * 발송 확인 (요구: 버튼 한 번으로 발송 금지).
 *
 * 여기 뜨는 값은 **전부 서버 프리뷰**가 준 것이다 — 대상 수, 마스킹 표본, 수신자별로 치환된
 * 최종 본문(`samples[0]`), 바이트/타입(`maximum*`). 클라이언트 추정 바이트는 오르지 않는다.
 * 사용자가 "발송"을 누르기 전까지 아무 문자도 나가지 않으며, 취소는 조용히 닫는다.
 *
 * ConfirmDialog 가 role="alertdialog" · 포커스 트랩 · 기본 포커스=취소 · Esc 취소를 준다.
 */

import { useState } from "react";
import { BRANCH_LABELS, primarySample, SMS_AUDIENCE_LABELS } from "@/shared/api";
import type { SmsTargetPreview } from "@/shared/api";
import { ConfirmDialog } from "@/shared/ui";

export interface SendConfirmDialogProps {
  open: boolean;
  preview: SmsTargetPreview | null;
  busy: boolean;
  error: string | null;
  /**
   * 남은 실패가 **같은 내용 재시도로 풀릴 수 있는가** (결과 미상일 때만 true).
   * 확정 실패는 흐름이 이 창을 닫으므로 여기 오지 않는다 — 반드시 실패할 재시도를 권하지 않는다.
   */
  retryable: boolean;
  /** 대상 수가 0 이거나 게이트웨이가 꺼져 있으면 확인 버튼 자체를 막는다. */
  sendDisabled: boolean;
  /** @param scheduledAt 예약 발송 시각(ISO). 비우면 즉시 발송. */
  onConfirm: (scheduledAt?: string) => void;
  onCancel: () => void;
}

/**
 * `datetime-local` 값(로컬 시각, 타임존 없음) → ISO 순간.
 *
 * 입력은 운영자가 보는 시계 그대로이고, 서버는 순간(timestamptz)을 받는다. `new Date(...)` 가
 * 브라우저 로컬 타임존으로 해석하므로 운영자가 친 시각이 곧 그 시각이다.
 */
function toInstant(localValue: string): string | null {
  if (localValue.trim() === "") return null;
  const at = new Date(localValue);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "7px 0",
  borderBottom: "1px solid var(--border-hairline)",
  fontSize: 13.5,
};

const keyStyle: React.CSSProperties = {
  width: 92,
  flexShrink: 0,
  color: "var(--text-faint)",
  fontWeight: 600,
};

const valueStyle: React.CSSProperties = {
  color: "var(--text-strong)",
  fontWeight: 700,
  fontFeatureSettings: '"tnum"',
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  padding: "11px 13px",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-sunken)",
  border: "1px solid var(--border-hairline)",
  fontFamily: "var(--font-body)",
  fontSize: 12.5,
  lineHeight: 1.6,
  color: "var(--text-strong)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

export function SendConfirmDialog({
  open,
  preview,
  busy,
  error,
  retryable,
  sendDisabled,
  onConfirm,
  onCancel,
}: SendConfirmDialogProps) {
  // 예약 발송 시각. 비어 있으면 즉시 발송이다 — 기본값을 채워 두면 운영자가 의도하지 않은
  // 예약이 기본이 된다. 훅은 이른 return 보다 위에 있어야 한다(호출 순서 고정).
  const [scheduleInput, setScheduleInput] = useState("");

  if (!open || preview === null) return null;

  const empty = preview.recipientCount === 0;
  // 수신자가 0 명이면 서버가 표본을 만들 수 없다 — 그때는 치환 전 원문만 있다.
  const sample = primarySample(preview);
  const blocked = empty || sendDisabled;
  const scheduled = toInstant(scheduleInput);

  return (
    <ConfirmDialog
      open
      tone="danger"
      title={scheduled === null ? "정말 문자를 발송할까요?" : "이 시각에 발송할까요?"}
      confirmLabel={
        error !== null && retryable
          ? "같은 내용으로 다시 시도"
          : scheduled === null ? "지금 발송" : "예약 발송"
      }
      cancelLabel="취소"
      busy={busy}
      onConfirm={() => {
        if (blocked) return;
        if (scheduleInput.trim() !== "" && scheduled === null) return;
        onConfirm(scheduled ?? undefined);
      }}
      onCancel={onCancel}
    >
      <p style={{ margin: 0, color: "var(--status-danger)", fontWeight: 700 }}>
        {scheduled === null
          ? <>확인을 누르면 아래 수신자에게 <u>실제 문자가 발송</u>돼요. 되돌릴 수 없어요.</>
          : <>예약한 시각이 되면 아래 수신자에게 <u>실제 문자가 발송</u>돼요.</>}
      </p>

      {/*
        예약 발송 — 비워 두면 지금 나간다. 대상은 이미 프리뷰에서 얼렸으므로 시각을 나중에
        정해도 수신자가 달라지지 않는다.
      */}
      <label style={{ display: "block", marginTop: 14 }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
          예약 발송 (비우면 지금 발송)
        </span>
        <input
          type="datetime-local"
          value={scheduleInput}
          disabled={busy}
          onChange={(event) => setScheduleInput(event.target.value)}
          style={{
            marginTop: 6,
            width: "100%",
            padding: "9px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-soft)",
            background: "var(--surface-card)",
            fontFamily: "inherit",
            fontSize: 13.5,
            color: "var(--text-strong)",
          }}
        />
        {scheduleInput.trim() !== "" && scheduled === null && (
          <span role="alert" style={{ display: "block", marginTop: 5, fontSize: 12, color: "var(--status-danger)", fontWeight: 700 }}>
            시각을 읽을 수 없어요. 다시 골라 주세요.
          </span>
        )}
      </label>

      <div style={{ marginTop: 16 }}>
        <div style={rowStyle}>
          <span style={keyStyle}>대상</span>
          <span style={valueStyle}>{SMS_AUDIENCE_LABELS[preview.audience]}</span>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>캠퍼스</span>
          <span style={valueStyle}>{BRANCH_LABELS[preview.branch]}캠퍼스</span>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>템플릿</span>
          <span style={valueStyle}>{preview.templateName}</span>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>수신 인원</span>
          <span style={{ ...valueStyle, color: empty ? "var(--text-faint)" : "var(--text-strong)" }}>
            {preview.recipientCount}명
          </span>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>메시지</span>
          <span style={valueStyle}>
            {/* 수신자마다 길이가 달라 서버가 최댓값을 준다. 0 명이면 null 이라 숫자를 지어내지 않는다. */}
            {preview.maximumMessageBytes === null || preview.maximumMessageType === null ? (
              <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>수신자가 없어 계산되지 않았어요</span>
            ) : (
              <>
                최대 {preview.maximumMessageBytes} byte · {preview.maximumMessageType}
              </>
            )}
          </span>
        </div>
        {preview.maximumTitleBytes !== null && (
          <div style={rowStyle}>
            <span style={keyStyle}>제목</span>
            <span style={valueStyle}>최대 {preview.maximumTitleBytes} byte</span>
          </div>
        )}
      </div>

      {preview.maskedRecipients.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
            수신자 표본 (마스킹)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {preview.maskedRecipients.map((masked, index) => (
              <span
                key={`${masked}-${index}`}
                style={{
                  padding: "3px 9px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border-hairline)",
                  fontSize: 12,
                  color: "var(--text-body)",
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {masked}
              </span>
            ))}
          </div>
          {preview.recipientCount > preview.maskedRecipients.length && (
            <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 6 }}>
              전체 {preview.recipientCount}명 중 {preview.maskedRecipients.length}명만 표본으로 보여 줘요.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
          {sample === null ? "발송 본문 (변수 치환 전 원문)" : `실제 발송 본문 — ${sample.maskedRecipient} 기준`}
        </div>

        {sample?.title != null && (
          <div
            style={{
              ...bodyStyle,
              marginBottom: 6,
              fontWeight: 700,
              background: "var(--surface-card)",
            }}
          >
            {sample.title}
          </div>
        )}

        <pre style={bodyStyle}>{sample === null ? preview.messageTemplate : sample.message}</pre>

        {sample === null ? (
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--text-faint)" }}>
            수신자가 없어 서버가 치환 표본을 만들지 못했어요 — 위는 변수가 그대로 남은 원문이에요.
          </p>
        ) : (
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--text-faint)", fontFeatureSettings: '"tnum"' }}>
            이 표본 {sample.messageBytes} byte · {sample.messageType}. 수신자마다 이름·링크가 달라 길이가 조금씩 달라요.
          </p>
        )}
      </div>

      {empty && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--status-warning)" }}>
          조건에 맞는 수신자가 없어요. 발송할 수 없어요.
        </p>
      )}

      {sendDisabled && !empty && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--status-warning)" }}>
          문자 기능이 서버에서 꺼져 있어 발송할 수 없어요.
        </p>
      )}

      {error !== null && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--status-danger)" }}>
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
