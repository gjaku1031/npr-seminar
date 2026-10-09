"use client";

/**
 * SMS 개인 링크 진입 (`/booking/access#token=...`) — 토큰+연락처 교환으로 30분 관리 세션을 엶
 *
 * ⚠️ 보안 불변식:
 * - fragment 의 원문 access token 은 첫 mount 에서 메모리(ref 레코드)로만 옮기고, 곧바로
 *   `history.replaceState` 로 주소창·history 에서 fragment 를 지움
 * - 토큰을 path·query·storage·log·오류문구·분석 이벤트 어디에도 넣지 않음
 * - 교환이 성공하기 전에는 예약 상세·학생 이름을 절대 요청·표시하지 않음
 * - 교환 성공 즉시 raw token 을 비우고, 반환된 familyBookingId 만 관리 패널에 넘김
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { initBookingAccessFragment } from "@/entities/reservation";
import {
  exchangeBookingAccessToken,
  isApiError,
  useKeyedOperationIntents,
} from "@/shared/api";
import { ContactEntryForm, FlowHeader, ManageBookingPanel } from "@/widgets/reserve-flow";
import { isCompleteContact, normalizeContactDigits, usePublicSessions } from "@/features/public-booking";

/**
 * 링크 fragment 확인 단계
 */
type FragmentPhase = "pending" | "ready" | "missing";

/**
 * 한 번만 확정하는 초기화 레코드 — 확정된 phase 와 원문 토큰(메모리 전용)을 담음
 */
interface FragmentInit {
  /**
   * 토큰 확보 여부
   */
  phase: "ready" | "missing";
  /**
   * 원문 access token — React state 가 아닌 ref 레코드 메모리에만 머묾. 교환 성공 시 비움
   */
  token: string | null;
}

/**
 * 링크 교환 요청 의도. 결과 미상 재시도 때 같은 키를 쓰기 위한 단위
 */
interface ExchangeIntent {
  /**
   * 링크 토큰 원문
   */
  accessToken: string;

  /**
   * 보호자 연락처 원문
   */
  contact: string;
}

/**
 * 링크 교환 멱등 키 대상 이름
 */
const EXCHANGE_INTENT_TARGET = "booking-access-exchange";

/**
 * 문자 개인 링크로 들어온 예약 확인 화면. 연락처를 확인해 관리 세션으로 교환
 */
export function BookingAccessView() {
  // 회차 메타(제목·일시)를 관리 패널에 붙이는 데만 씀 — 교환 전에는 예약을 요청하지 않음
  const { sessions } = usePublicSessions();

  // 초기화 레코드 — 컴포넌트별(모듈 전역 아님). 파싱·정리를 한 번만 하고 그 결과를 캐시함
  const initRef = useRef<FragmentInit | null>(null);
  const [fragmentPhase, setFragmentPhase] = useState<FragmentPhase>("pending");
  const fragmentReady = fragmentPhase === "ready";
  const fragmentMissing = fragmentPhase === "missing";

  // 첫 mount: fragment 를 엄격 파싱해 유효 토큰만 ref 레코드(메모리)로 옮김. 그리고 hash 가
  // 비어 있지 않으면 파싱 성공 여부와 무관하게 주소창·history 에서 즉시 제거함 — 잘못되거나
  // 파라미터가 여럿인 조각도 남기지 않음(path/query 로 옮기지 않고 그냥 없앰). 렌더 위상
  // 갱신은 마이크로태스크로 비동기 예약해 동기 effect setState 를 피함
  // StrictMode setup→cleanup→setup 안전성:
  // - 첫 setup 만 파싱·replaceState 를 수행하고 결과를 initRef 에 캐시함
  // - cleanup 이 그 setup 의 active 를 false 로 바꿔 예약된 마이크로태스크를 취소함
  // - 두 번째 setup 은 캐시된 phase/token 을 그대로 재사용하고(재파싱·재정리 없음) 새 갱신만
  //   예약함 — hash 가 이미 지워졌어도 유효 토큰을 잃지 않음
  // - unmount 시에도 active=false 라 unmount 이후 setState 가 일어나지 않음
  useEffect(() => {
    let active = true;
    if (initRef.current === null) {
      const result = initBookingAccessFragment({
        hash: window.location.hash,
        pathname: window.location.pathname,
        search: window.location.search,
      });
      // 비어 있지 않은 hash 는 파싱 성공 여부와 무관하게 즉시 지움 — cleanUrl 은 정확히
      // pathname+search 라 fragment(유효/무효 불문)가 주소창·history 에 남지 않음
      if (result.cleanUrl !== null) {
        window.history.replaceState(null, "", result.cleanUrl);
      }
      initRef.current = { phase: result.phase, token: result.token };
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
  const exchangeIntents = useKeyedOperationIntents<ExchangeIntent>(1);

  const digits = normalizeContactDigits(contact);
  const canSubmit = isCompleteContact(digits) && !submitting;

  const submit = useCallback(async () => {
    const token = initRef.current?.token ?? null;
    if (!token || !canSubmit) return;

    const operation = exchangeIntents.begin(EXCHANGE_INTENT_TARGET, {
      accessToken: token,
      contact: digits,
    });
    if (!operation.ok) {
      const retained = exchangeIntents.retained(EXCHANGE_INTENT_TARGET);
      if (retained !== null) setContact(retained.contact);
      setError(
        operation.reason === "diverged"
          ? "직전 요청의 결과를 확인하지 못했습니다. 이전에 입력한 연락처로 되돌렸습니다. 같은 요청을 다시 시도해 주세요."
          : "결과를 확인하지 못한 요청이 남아 있습니다. 같은 요청을 다시 시도해 주세요.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await exchangeBookingAccessToken(
        operation.intent,
        { idempotencyKey: operation.key },
      );
      exchangeIntents.settle(EXCHANGE_INTENT_TARGET);
      // 성공 즉시 원문 토큰만 비움 — 더는 필요 없음(phase 는 유지)
      if (initRef.current) initRef.current.token = null;
      setFamilyBookingId(result.familyBookingId);
    } catch (caught) {
      exchangeIntents.settle(EXCHANGE_INTENT_TARGET, caught);
      const retained = exchangeIntents.retained(EXCHANGE_INTENT_TARGET);
      if (retained !== null) {
        // 결과 미상에서는 키뿐 아니라 최초 연락처·토큰 의도도 그대로 유지함
        setContact(retained.contact);
        setError("예약 열기 요청의 결과를 확인하지 못했습니다. 입력값을 그대로 두고 다시 시도해 주세요.");
      } else if (isApiError(caught) && caught.status === 401) {
        // 토큰·연락처 중 무엇이 틀렸는지 구분하지 않음
        setError("링크 또는 연락처가 맞지 않습니다. 예약하신 연락처가 맞는지 확인해 주세요.");
      } else if (isApiError(caught) && caught.status === 429) {
        setError("요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.");
      } else if (isApiError(caught) && caught.status === 403) {
        setError("이 링크로는 예약을 열 수 없습니다. 문자로 받은 링크를 다시 열어 주세요.");
      } else {
        setError("예약을 여는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, digits, exchangeIntents]);

  // 교환 성공 — 관리 세션 모드 패널로 넘어감(예약 데이터는 여기서 처음 요청됨)
  // 이미 입력한 전체 연락처(digits)를 패널에 넘겨 변경 경계 OTP 발송 입력만 미리 채움
  //   패널은 이 값을 저장·로깅·URL 에 쓰지 않고, 세션은 변경 인증에 절대 쓰지 않음
  if (familyBookingId !== null) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh" }}>
        <ManageBookingPanel
          sessions={sessions}
          accessSession={{ familyBookingId }}
          prefillContact={digits}
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
          <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35 }}>예약 확인이 필요합니다</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.55 }}>
            문자로 받은 개인 링크입니다. 예약하신 <b>학부모 연락처 전체 번호</b>를 입력하시면 예약을 열어드립니다.
          </p>
        </div>

        {fragmentMissing ? (
          <div role="alert" style={{ padding: "16px 14px", borderRadius: "var(--radius-md)", background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 13, lineHeight: 1.6 }}>
            링크 정보를 읽을 수 없습니다. 문자로 받은 예약 링크를 다시 열어 주세요.
          </div>
        ) : (
          <ContactEntryForm
            value={contact}
            onChange={(v) => { setContact(v); setError(null); }}
            onSubmit={() => void submit()}
            disabled={!fragmentReady}
            submitting={submitting}
            canSubmit={canSubmit}
            submitLabel="예약 열기"
            submittingLabel="예약을 여는 중입니다…"
            hint="예약하실 때 사용한 전체 번호를 입력해 주세요."
            error={error}
          />
        )}
      </div>
    </div>
  );
}
