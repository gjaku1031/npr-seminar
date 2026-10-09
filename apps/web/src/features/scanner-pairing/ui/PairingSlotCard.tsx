"use client";

/**
 * 새 iPad 연결 슬롯 — 시각안 1(카드 중심)의 네 번째 점선 카드
 * 빈 슬롯 → 발급 폼 → 코드·카운트다운 대기 상태로 자연스럽게 바뀜
 *
 * 원문 코드는 props 로 잠깐 받아 그리기만 함 — 저장하지 않음
 */

import { useEffect, useId } from "react";
import { Clock, Plus, Tablet } from "lucide-react";
import { Button } from "@/shared/ui";
import { useCountdown } from "@/shared/lib/useCountdown";
import { BRANCH_OPTIONS, type Branch, type PairingCodeMetadata } from "@/shared/api";
import type { PairingCodeStatus } from "../model/usePairingCode";

/**
 * 페어링 코드 발급 입력값
 */
export interface PairingFormValue {
  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 출입구 코드
   */
  gateCode: string;

  /**
   * 등록 예정 기기 이름
   */
  intendedDeviceName: string;
}

/**
 * 페어링 코드 발급 슬롯 카드 속성
 */
export interface PairingSlotCardProps {
  /**
   * 슬롯 상태
   */
  status: PairingCodeStatus;

  /**
   * 원문 코드. 신규 발급 직후에만 있음
   */
  code: string | null;

  /**
   * 발급된 코드 정보. 없으면 null
   */
  pairing: PairingCodeMetadata | null;

  /**
   * 안내 문구. 없으면 null
   */
  notice: string | null;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;
  /**
   * 활성 코드를 소유하지 않은 상태에서만 참 (훅이 결정함)
   */
  canIssue: boolean;
  /**
   * 결과 미상 구간 — 페이로드가 바뀌지 못하게 폼을 잠금
   */
  formLocked: boolean;
  /**
   * 카운트다운·만료의 단일 기준 (발급 코드의 expiresAt 또는 미상 구간의 TTL 마감)
   */
  deadlineIso: string | null;

  /**
   * 발급 입력값
   */
  form: PairingFormValue;

  /**
   * 입력값 변경 처리
   */
  onFormChange: (value: PairingFormValue) => void;

  /**
   * 발급 요청
   */
  onIssue: () => void;
  /**
   * 미상 구간에서 원본 페이로드를 같은 키로 재시도
   */
  onRetryUnknown: () => void;

  /**
   * 발급 취소 요청
   */
  onCancel: () => void;

  /**
   * 카운트다운 만료 처리
   */
  onExpire: () => void;

  /**
   * 등장 애니메이션 지연(ms)
   */
  animationDelayMs?: number;
}

/**
 * 입력 칸 스타일
 */
const fieldStyle: React.CSSProperties = {
  height: 42,
  width: "100%",
  padding: "0 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-soft)",
  background: "var(--surface-card)",
  color: "var(--text-strong)",
  fontSize: 14,
  fontFamily: "var(--font-body)",
  boxSizing: "border-box",
};

/**
 * 라벨 스타일
 */
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 5,
  textAlign: "left",
};

/**
 * 시각적으로 숨기되 스크린리더에는 남김 — 카운트다운 낭독용
 */
const srOnlyStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * 페어링 코드 발급 슬롯 카드. 입력·코드·카운트다운 표시
 */
export function PairingSlotCard({
  status,
  code,
  pairing,
  notice,
  error,
  canIssue,
  formLocked,
  deadlineIso,
  form,
  onFormChange,
  onIssue,
  onRetryUnknown,
  onCancel,
  onExpire,
  animationDelayMs = 0,
}: PairingSlotCardProps) {
  const branchId = useId();
  const gateId = useId();
  const nameId = useId();

  // 코드를 소유했거나 소유했을 수 있는 상태
  // 취소 중·결과 미상에도 카운트다운은 계속 돔 — TTL 이 지나면 서버에서도 무효라 슬롯이 풀림
  const owningCode = status === "issued" || status === "cancelling" || status === "unknown-create";
  const countdown = useCountdown(deadlineIso);

  const shouldExpire = deadlineIso !== null && countdown.expired;
  useEffect(() => {
    if (shouldExpire) onExpire();
  }, [shouldExpire, onExpire]);

  const showCode = status === "issued" && code !== null && !countdown.expired;
  const cancelling = status === "cancelling";
  const unknownCreate = status === "unknown-create";
  const formFilled =
    form.gateCode.trim().length > 0 && form.intendedDeviceName.trim().length > 0;
  // 기기 수 상한이 없음 — 활성 코드를 소유하지 않는 한 언제든 발급할 수 있음
  const issueEnabled = canIssue && !formLocked && formFilled;
  const fieldsDisabled = formLocked;

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: `1.5px dashed ${showCode ? "var(--violet-500)" : "var(--violet-200)"}`,
        background: showCode ? "var(--violet-50)" : "var(--surface-card)",
        padding: 22,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${animationDelayMs}ms both`,
      }}
    >
      {/* 슬롯 아이콘 — 연결된 카드의 태블릿 아이콘과 같은 자리·크기 */}
      <div
        style={{
          position: "relative",
          width: 62,
          height: 62,
          margin: "0 auto",
          borderRadius: "var(--radius-md)",
          background: "var(--violet-50)",
          color: "var(--violet-500)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1.5px dashed var(--violet-200)",
        }}
      >
        <Tablet size={26} aria-hidden="true" />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--violet-700)",
            color: "var(--text-on-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2.5px solid var(--surface-card)",
          }}
        >
          <Plus size={11} strokeWidth={3} />
        </span>
      </div>

      <div
        style={{
          marginTop: 14,
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 16.5,
          color: "var(--text-strong)",
        }}
      >
        새 iPad 연결
      </div>

      {/* 발급된 코드 — 라이브 리전으로 한 번 알림 */}
      {showCode && (
        <div style={{ marginTop: 10 }}>
          <p
            aria-live="polite"
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 40,
              lineHeight: 1.15,
              letterSpacing: "0.08em",
              color: "var(--violet-700)",
            }}
          >
            {code}
          </p>

          <div style={{ marginTop: 8 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 26,
                padding: "0 12px",
                borderRadius: "var(--radius-pill)",
                background: "var(--violet-100)",
                color: "var(--violet-900)",
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              <Clock size={12} aria-hidden="true" />
              {/* 초 단위 시각 표시는 낭독하지 않음 */}
              <span aria-hidden="true">{countdown.label} 남음</span>
            </span>
            {/* 낭독은 분 단위로만 바뀜 */}
            <span style={srOnlyStyle} aria-live="polite">
              {countdown.announcement}
            </span>
          </div>

          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)" }}>1회만 사용할 수 있어요</p>
          <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--text-faint)" }}>
            {pairing?.intendedDeviceName} · {pairing?.gateCode}
          </p>
        </div>
      )}

      {/* 코드를 소유했지만 원문을 표시할 수 없는 경우(미상·리플레이·취소 중) — 상태만 알림 */}
      {owningCode && !showCode && (
        <p aria-live="polite" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>
          {unknownCreate
            ? "발급 요청의 결과를 확인하지 못했어요. 코드가 이미 만들어졌을 수 있어 같은 내용으로만 다시 시도할 수 있어요."
            : cancelling
              ? "연결 코드를 취소하는 중이에요."
              : "발급된 코드는 화면에 다시 표시할 수 없어요."}
        </p>
      )}

      {/* 빈 슬롯 — 발급 대상 입력 */}
      {!owningCode && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label htmlFor={branchId} style={labelStyle}>
              지점
            </label>
            <select
              id={branchId}
              value={form.branch}
              disabled={fieldsDisabled}
              onChange={(event) => onFormChange({ ...form, branch: event.target.value as Branch })}
              style={fieldStyle}
            >
              {BRANCH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={gateId} style={labelStyle}>
              입구 위치
            </label>
            <input
              id={gateId}
              value={form.gateCode}
              disabled={fieldsDisabled}
              maxLength={100}
              placeholder="예: 정문"
              onChange={(event) => onFormChange({ ...form, gateCode: event.target.value })}
              style={fieldStyle}
            />
          </div>

          <div>
            <label htmlFor={nameId} style={labelStyle}>
              기기 이름
            </label>
            <input
              id={nameId}
              value={form.intendedDeviceName}
              disabled={fieldsDisabled}
              maxLength={100}
              placeholder="예: 스캐너 #4"
              onChange={(event) => onFormChange({ ...form, intendedDeviceName: event.target.value })}
              style={fieldStyle}
            />
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* 상태 안내 — 색만으로 전달하지 않고 문구로 함께 알림 */}
      {(error || notice) && (
        <p
          role={error ? "alert" : undefined}
          aria-live={error ? undefined : "polite"}
          style={{
            margin: "12px 0 0",
            fontSize: 12,
            lineHeight: 1.55,
            color: error ? "var(--status-danger)" : "var(--text-muted)",
            textAlign: "left",
          }}
        >
          {error ?? notice}
        </p>
      )}

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {/*
          활성 코드를 소유했거나 소유했을 수 있는 동안에는 발급 버튼을 아예 렌더하지 않음
          두 번째 유효 코드가 동시에 존재할 수 있는 경로를 UI 에서 제거함
        */}
        {!owningCode && (
          <Button size="sm" fullWidth onClick={onIssue} disabled={!issueEnabled}>
            {status === "issuing" ? "발급 중..." : "페어링 코드 발급"}
          </Button>
        )}

        {/* 미상 구간 — 원본 페이로드·원본 키로만 재시도함 (새 코드를 만들지 않음) */}
        {unknownCreate && (
          <Button size="sm" fullWidth onClick={onRetryUnknown}>
            발급 결과 다시 확인
          </Button>
        )}

        {/* 메타데이터를 되찾은 뒤에만 불투명 id 로 취소할 수 있음 */}
        {pairing && (status === "issued" || cancelling) && (
          /* 취소가 결과 미상으로 끝나면(error) 같은 키로 재시도할 수 있어야 함 */
          <Button
            size="sm"
            fullWidth
            variant="secondary"
            onClick={onCancel}
            disabled={cancelling && !error}
          >
            {cancelling ? (error ? "취소 다시 시도" : "취소 중...") : "발급 취소"}
          </Button>
        )}
      </div>
    </div>
  );
}
