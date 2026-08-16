"use client";

/**
 * 예약 상세 직접 링크 (`/booking/{familyBookingId}`) — 문자로 보내는 안전한 링크의 목적지.
 *
 * ⚠️ 보안: 경로의 ID 는 **조회 키일 뿐 권한이 아니다**.
 * - 최초 렌더에서 예약 정보를 아무것도 보여주지 않고, 상세 요청도 보내지 않는다.
 * - 예약 연락처를 입력해 본인 확인을 마친 뒤에야 **이 ID 하나만** 범위 조회한다.
 *   (소유 예약 전체 조회를 타지 않는다 — ManageBookingPanel 의 initialBookingId 모드.)
 * - 인증번호는 받지 않는다. 서버가 그 예약 하나에 대해 연락처 digest 를 대조하고,
 *   틀리면 없는 예약·취소된 예약과 **같은 오류**를 준다(열거 단서 없음). 브루트포스는
 *   예약당·연락처당·IP·전역 rate limit 이 막는다.
 * - 링크를 주운 사람은 연락처를 모르면 열 수 없고, 열더라도 **읽기까지만**이다 —
 *   변경·취소·설문은 언제나 새 BOOKING_MANAGE proof 를 요구한다.
 *
 * 인증 뒤에는 예약 조회(`/reserve?mode=manage`)와 **같은 패널**을 쓴다: 회차 변경·취소·QR 확인·설문이
 * 동일한 변경/리플레이/오류/QR 시크릿 규칙으로 동작한다(QR 은 활성본 복구 GET 조회뿐, 재발급 없음).
 * 종료(onExit)는 공개 홈(루트 `/`, 포스터 진입면)으로 돌아간다.
 */

import { useRouter } from "next/navigation";
import { usePublicSessions } from "@/features/public-booking";
import { ManageBookingPanel } from "@/widgets/reserve-flow";

export interface BookingDetailViewProps {
  familyBookingId: string;
}

export function BookingDetailView({ familyBookingId }: BookingDetailViewProps) {
  const router = useRouter();
  // 회차 메타(제목·일시·장소)를 붙이고 회차 변경 후보를 고르는 데 쓴다.
  const { sessions } = usePublicSessions();

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh" }}>
      <ManageBookingPanel
        sessions={sessions}
        initialBookingId={familyBookingId}
        onExit={() => router.push("/")}
        onToast={() => {}}
      />
    </div>
  );
}
