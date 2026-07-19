"use client";

/**
 * 예약 상세 직접 링크 (`/booking/{familyBookingId}`) — 문자로 보내는 안전한 링크의 목적지.
 *
 * ⚠️ 보안: 경로의 ID 는 **조회 키일 뿐 권한이 아니다**.
 * - 최초 렌더에서 예약 정보를 아무것도 보여주지 않고, 상세 요청도 보내지 않는다.
 * - BOOKING_MANAGE OTP 로 본인 확인을 마친 뒤에야 **이 ID 하나만** 범위 조회한다.
 *   (소유 예약 전체 조회를 타지 않는다 — ManageBookingPanel 의 initialBookingId 모드.)
 * - 서버도 proof digest 와 예약 소유자를 대조하므로 링크를 주운 사람은 열 수 없다.
 *
 * 인증 뒤에는 루트의 예약 조회와 **같은 패널**을 쓴다: 회차 변경·취소·QR 확인·설문이
 * 동일한 변경/리플레이/오류/QR 시크릿 규칙으로 동작한다(QR 은 활성본 복구 GET 조회뿐, 재발급 없음).
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
