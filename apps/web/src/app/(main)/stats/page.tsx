import { StatsView } from "@/views/stats";

/**
 * 통계 화면. 회차 × 캠퍼스 필터
 * 학생·가족·실 참가자와 운영 상태의 절대 건수를 서버 집계 API에서 읽음
 */
export default function StatsPage() {
  return <StatsView />;
}
