/**
 * 학부모 모바일 예약 화면 (명세 §10) — 공개 라우트 /reserve의 화면 조합.
 * 실제 플로우는 widgets/reserve-flow가 담당(프리뷰와 공유), 여기는 모바일 폭 래퍼만.
 * 와이어프레임 mobile.html의 body max-width 480 중앙 정렬을 재현한다.
 */

import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { Student } from "@/entities/student";
import { ReserveFlow } from "@/widgets/reserve-flow";

export interface ReserveViewProps {
  sessions: Session[];
  students: Student[];
  reservations: Reservation[];
}

export function ReserveView({ sessions, students, reservations }: ReserveViewProps) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh" }}>
      <ReserveFlow sessions={sessions} students={students} reservations={reservations} />
    </div>
  );
}
