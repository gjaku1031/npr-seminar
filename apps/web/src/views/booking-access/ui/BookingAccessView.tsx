"use client";

/**
 * SMS 개인 링크 진입 (`/booking/access#token=...`) — 토큰+연락처 교환으로 30분 관리 세션을 연다.
 *
 * ⚠️ 보안 불변식:
 * - fragment 의 원문 access token 은 첫 mount 에서 **메모리(ref 레코드)로만** 옮기고, 곧바로
 *   `history.replaceState` 로 주소창·history 에서 fragment 를 지운다.
 * - 토큰을 path·query·storage·log·오류문구·분석 이벤트 어디에도 넣지 않는다.
 * - 교환이 성공하기 전에는 예약 상세·학생 이름을 **절대 요청·표시하지 않는다**.
 * - 교환 성공 즉시 raw token 을 비우고, 반환된 familyBookingId 만 관리 패널에 넘긴다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { parseBookingAccessFragment } from "@/entities/reservation";
import { Button, Input } from "@/shared/ui";
import {
  exchangeBookingAccessToken,
  isApiError,
  useOperationKey,
} from "@/shared/api";
import { ErrorNote, FlowHeader, ManageBookingPanel } from "@/widgets/reserve-flow";
import { usePublicSessions } from "@/features/public-booking";

function normalizeContact(raw: string): string {
  return raw.replace(/\D/g, "");
}

type FragmentPhase = "pending" | "ready" | "missing";

/** 한 번만 확정하는 초기화 레코드 — 확정된 phase 와 원문 토큰(메모리 전용)을 담는다. */
interface FragmentInit {
  phase: "ready" | "missing";
  /** 원문 access token — React state 가 아닌 ref 레코드 메모리에만 머문다. 교환 성공 시 비운다. */
  token: string | null;
}

export function BookingAccessView() {
  // 회차 메타(제목·일시)를 관리 패널에 붙이는 데만 쓴다 — 교환 전에는 예약을 요청하지 않는다.
  const { sessions } = usePublicSessions();

  // 초기화 레코드 — 컴포넌트별(모듈 전역 아님). 파싱·정리를 한 번만 하고 그 결과를 캐시한다.
  const initRef = useRef<FragmentInit | null>(null);
  const [fragmentPhase, setFragmentPhase] = useState<FragmentPhase>("pending");
  const fragmentReady = fragmentPhase === "ready";
  const fragmentMissing = fragmentPhase === "missing";

  /*
   * 첫 mount: fragment 를 엄격 파싱→토큰을 ref 레코드(메모리)로 옮기고 주소창에서 즉시 제거.
   * 렌더 위상 갱신은 마이크로태스크로 비동기 예약해 동기 effect setState 를 피한다.
   *
   * StrictMode setup→cleanup→setup 안전성:
   * - 첫 setup 만 파싱·replaceState 를 수행하고 결과를 initRef 에 캐시한다.
   * - cleanup 이 그 setup 의 active 를 false 로 바꿔 예약된 마이크로태스크를 취소한다.
   * - 두 번째 setup 은 캐시된 phase/token 을 그대로 재사용하고(재파싱·재정리 없음) 새 갱신만
   *   예약한다 — hash 가 이미 지워졌어도 유효 토큰을 잃지 않는다.
   * - unmount 시에도 active=false 라 unmount 이후 setState 가 일어나지 않는다.
   */
  useEffect(() => {
    let active = true;
    if (initRef.current === null) {
      const token = parseBookingAccessFragment(window.location.hash);
      if (token === null) {
        initRef.current = { phase: "missing", token: null };
      } else {
        // 토큰을 주소창·history 에서 지운다 — path/query 로 옮기지 않고 그냥 없앤다.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        initRef.current = { phase: "ready", token };
      }
    }
    const cached = initRef.current;
    queueMicrotask(() => {
      if (active) setFragmentPhase(cached.phase);
    });
    return () => {
      active = false;
    };
  }, []);

  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [familyBookingId, setFamilyBookingId] = useState<string | null>(null);
  const exchangeKey = useOperationKey();

  const digits = normalizeContact(contact);
  const canSubmit = digits.length >= 8 && digits.length <= 15 && !submitting;

  const submit = useCallback(async () => {
    const token = initRef.current?.token ?? null;
    if (!token || !canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await exchangeBookingAccessToken(
        { accessToken: token, contact: digits },
        { idempotencyKey: exchangeKey.current() },
      );
      exchangeKey.settle();
      // 성공 즉시 원문 토큰만 비운다 — 더는 필요 없다(phase 는 유지).
      if (initRef.current) initRef.current.token = null;
      setFamilyBookingId(result.familyBookingId);
    } catch (caught) {
      exchangeKey.settle(caught);
      if (isApiError(caught) && caught.status === 401) {
        // 토큰·연락처 중 무엇이 틀렸는지 구분하지 않는다.
        setError("링크 또는 연락처가 맞지 않아요. 예약하신 연락처가 맞는지 확인해 주세요.");
      } else if (isApiError(caught) && caught.status === 429) {
        setError("요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.");
      } else if (isApiError(caught) && caught.status === 403) {
        setError("이 링크로는 예약을 열 수 없어요. 문자에서 링크를 다시 열어주세요.");
      } else {
        setError("예약을 여는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, digits, exchangeKey]);

  /* 교환 성공 — 관리 세션 모드 패널로 넘어간다(예약 데이터는 여기서 처음 요청된다). */
  if (familyBookingId !== null) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh" }}>
        <ManageBookingPanel
          sessions={sessions}
          accessSession={{ familyBookingId }}
          onExit={() => { window.location.href = "/"; }}
          onToast={() => {}}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "var(--surface-page)" }}>
      <FlowHeader title="예약 관리" />
      <div style={{ padding: "14px 18px 30px" }}>
        <div style={{ padding: "8px 4px 16px" }}>
          <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>예약 확인이 필요해요</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.55 }}>
            문자로 받은 개인 링크예요. 예약하신 <b>학부모 연락처 전체 번호</b>를 입력하면 예약을 열어드려요.
          </p>
        </div>

        {fragmentMissing ? (
          <div role="alert" style={{ padding: "16px 14px", borderRadius: "var(--radius-md)", background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 13, lineHeight: 1.6 }}>
            링크 정보를 읽을 수 없어요. 문자에서 예약 링크를 다시 열어주세요.
          </div>
        ) : (
          <>
            <Input
              label="학부모 연락처"
              placeholder="010-0000-0000"
              value={contact}
              onChange={setContact}
              disabled={!fragmentReady || submitting}
              icon={<Smartphone size={16} aria-hidden="true" />}
              hint="예약할 때 사용한 전체 번호를 입력해 주세요."
            />
            <Button
              size="lg"
              fullWidth
              onClick={() => void submit()}
              disabled={!fragmentReady || !canSubmit}
              style={{ marginTop: 16 }}
            >
              {submitting ? "예약 여는 중…" : "예약 열기"}
            </Button>
            <ErrorNote message={error} />
          </>
        )}
      </div>
    </div>
  );
}
