"use client";

/**
 * 예약 유형 선택 — 공개 루트(`/`)의 새 첫 화면 (STEP 1 · TYPE)
 * 선택된 시각안 1을 충실히 구현함: 재원생 예약 / 비재원생 예약 카드 세로 스택 + 하단 예약 관리 링크
 *
 * 시각 언어·치수·토큰은 기존 캠퍼스 카드(ReserveFlow)와 FlowHeader 를 그대로 계승함
 *
 * 비재원(guest) 카드 상태는 boolean 하나로 오류를 숨기지 않음: loading·error·disabled·enabled 를
 *   정직하게 보여 줌. `disabled` 는 활성 가능한 공개 회차가 하나도 없을 때이고, 이때만 고정 문구
 *   `7/23(목)부터 예약 가능` 을 씀. loading·error 에서는 카드를 열지 않음(실패 시 임의 활성화 금지)
 */

import { ArrowRight, GraduationCap, UserPlus } from "lucide-react";
import { Badge, brandSeminarTitle, BRAND_NAME } from "@/shared/ui";
import type { GuestEntryState } from "@/features/public-booking";
import { FlowHeader, FlowToast } from "./MobileChrome";

/**
 * 활성 가능한 회차가 하나도 없을 때만 쓰는 운영 확정 문구(변경 금지)
 */
const GUEST_DISABLED_BADGE = "7/23(목)부터 예약 가능";

/**
 * 예약 유형 선택 단계 속성
 */
export interface ReservationTypeStepProps {
  /**
   * 비재원생 진입 가능 상태
   */
  guestState: GuestEntryState;

  /**
   * 재원생 예약 선택
   */
  onSelectEnrolled: () => void;

  /**
   * 비재원생 예약 선택
   */
  onSelectGuest: () => void;

  /**
   * 예약 관리로 이동
   */
  onManage: () => void;
  /**
   * 공개 회차 목록을 다시 불러옴(로딩·오류 상태의 재시도 동선)
   */
  onRetry: () => void;

  /**
   * 짧은 안내 문구. 없으면 null
   */
  toast: string | null;
}

/**
 * 예약 유형 선택 첫 화면
 */
export function ReservationTypeStep({
  guestState,
  onSelectEnrolled,
  onSelectGuest,
  onManage,
  onRetry,
  toast,
}: ReservationTypeStepProps) {
  const guestEnabled = guestState === "enabled";

  return (
    <div
      data-screen-label="모바일 — 예약 유형 선택"
      style={{ minHeight: "100%", background: "var(--surface-page)" }}
    >
      <FlowHeader title={brandSeminarTitle()} />
      <div style={{ padding: "10px 18px 30px" }}>
        <div style={{ padding: "20px 4px 18px" }}>
          <div style={{ fontSize: 11, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)" }}>
            STEP 1 · TYPE
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 6, lineHeight: 1.3 }}>
            예약 유형을
            <br />
            선택해 주세요
          </h2>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
            재원 여부에 따라 예약 절차가 다릅니다.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 재원생 예약 — 항상 진입 가능(캠퍼스 화면이 로딩·오류를 처리함) */}
          <button
            type="button"
            onClick={onSelectEnrolled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "18px 20px",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface-card)",
              border: "1px solid var(--border-hairline)",
              boxShadow: "var(--shadow-card)",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              fontFamily: "var(--font-body)",
              animation: "ds-fade-up var(--dur-slow) var(--ease-out) 80ms both",
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-sm)",
                background: "var(--violet-50)",
                color: "var(--violet-800)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <GraduationCap size={20} aria-hidden="true" />
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--text-strong)" }}>
                재원생 예약
              </span>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                자녀가 {BRAND_NAME}에 다니고 있습니다
              </span>
            </span>
            <ArrowRight size={16} aria-hidden="true" style={{ color: "var(--violet-800)", flexShrink: 0 }} />
          </button>

          {/* 비재원생 예약 — guestState 로 활성/비활성이 갈림 */}
          <button
            type="button"
            disabled={!guestEnabled}
            aria-disabled={!guestEnabled}
            onClick={guestEnabled ? onSelectGuest : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "18px 20px",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface-card)",
              border: "1px solid var(--border-hairline)",
              boxShadow: "var(--shadow-card)",
              cursor: guestEnabled ? "pointer" : "not-allowed",
              textAlign: "left",
              width: "100%",
              fontFamily: "var(--font-body)",
              animation: "ds-fade-up var(--dur-slow) var(--ease-out) 160ms both",
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-sm)",
                background: guestEnabled ? "var(--violet-50)" : "var(--surface-sunken)",
                color: guestEnabled ? "var(--violet-800)" : "var(--text-faint)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                // 아이콘 타일은 흐리지 않되 비활성 본문만 낮춤
                opacity: guestEnabled ? 1 : 0.9,
              }}
            >
              <UserPlus size={20} aria-hidden="true" />
            </span>
            {/*
              부모 span 을 흐리지 않음. 비활성 시 낮추는 것은 제목·설명뿐이고
              배지는 형제 위치에서 opacity 1 을 유지함(선택 원본 1안 규칙)
            */}
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--text-strong)", opacity: guestEnabled ? 1 : 0.6 }}>
                비재원생 예약
              </span>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", marginTop: 2, opacity: guestEnabled ? 1 : 0.6 }}>
                자녀가 아직 {BRAND_NAME}에 다니지 않습니다
              </span>
              {/* 상태 안내 — 배지(disabled) 또는 진행 문구(loading/error). 배지는 흐리지 않음 */}
              {guestState === "disabled" && (
                <span style={{ display: "inline-flex", marginTop: 8, opacity: 1 }}>
                  {/*
                    선택안 1 원본대로: 하늘색 fill 이 아니라 거의 흰색/투명 배경 + 얇은 회색 outline +
                    중립 회색 텍스트. Badge 공용 tone 은 건드리지 않고 이 사용처에서만 neutral 위에
                    배경·테두리·글자색을 override 함
                  */}
                  <Badge
                    tone="neutral"
                    size="sm"
                    style={{ background: "transparent", border: "1px solid var(--border-soft)", color: "var(--text-muted)" }}
                  >
                    {GUEST_DISABLED_BADGE}
                  </Badge>
                </span>
              )}
              {guestState === "loading" && (
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-faint)", marginTop: 6 }}>
                  예약 가능 여부 확인 중
                </span>
              )}
              {guestState === "error" && (
                <span style={{ display: "block", fontSize: 11.5, color: "var(--status-warning)", marginTop: 6 }}>
                  예약 정보를 불러오지 못했습니다
                </span>
              )}
            </span>
            {guestEnabled && (
              <ArrowRight size={16} aria-hidden="true" style={{ color: "var(--violet-800)", flexShrink: 0 }} />
            )}
          </button>
        </div>

        {/* 목록 오류 시 재시도 동선(로딩·오류 상태 공유) */}
        {guestState === "error" && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              type="button"
              onClick={onRetry}
              style={{ background: "none", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-pill)", padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "var(--text-body)", cursor: "pointer", fontFamily: "var(--font-body)" }}
            >
              예약 정보 다시 불러오기
            </button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 22 }}>
          <button
            type="button"
            onClick={onManage}
            style={{ background: "none", border: "none", fontSize: 13.5, fontWeight: 700, color: "var(--violet-800)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "var(--font-body)", padding: 8 }}
          >
            이미 예약하셨나요? 예약 조회 · 변경 · 취소
          </button>
        </div>
      </div>
      <FlowToast message={toast} />
    </div>
  );
}
