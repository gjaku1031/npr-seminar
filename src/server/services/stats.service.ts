import "server-only";
import { isConverted } from "@/entities/student";
import type { ReservationChannel } from "@/entities/reservation";
import { reservationRepository, sessionRepository, studentRepository } from "../repositories";

/**
 * 통계 대시보드 (명세 12.6) — 원장·실장 전용 (flows: gangsa 차단).
 * 범위: 지표 산출 경로까지. 차트별 세부 집계(시간대 추이 등)는 화면 구현 시 확장한다.
 */

export interface StatsOverview {
  /** 누적 예약 (취소 제외) */
  totalReservations: number;
  /** 참석률 % — entered / (entered + no_show) */
  attendanceRate: number;
  /** 노쇼율 % */
  noShowRate: number;
  /** 비재원 전환율 % — 전환 학생 / 전체 비재원 예약자 */
  conversionRate: number;
  /** 채널별 예약 수 (도넛) */
  byChannel: Record<ReservationChannel, number>;
  /** 회차별 참석률 (바) */
  bySession: Array<{ sessionId: string; title: string; rate: number }>;
}

const pct = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);

export async function getStatsOverview(): Promise<StatsOverview> {
  const sessions = await sessionRepository.list();
  const perSession = await Promise.all(
    sessions.map(async (s) => ({ session: s, rows: await reservationRepository.listBySession(s.id) })),
  );
  const all = perSession.flatMap((p) => p.rows);

  const entered = all.filter((r) => r.status === "entered").length;
  const noShow = all.filter((r) => r.status === "no_show").length;
  const settled = entered + noShow;

  const byChannel: Record<ReservationChannel, number> = { mobile: 0, phone: 0, manual: 0 };
  for (const r of all) if (r.status !== "cancelled") byChannel[r.channel] += 1;

  const students = await studentRepository.list();
  const guests = all.filter((r) => !r.member).length;

  return {
    totalReservations: all.filter((r) => r.status !== "cancelled").length,
    attendanceRate: pct(entered, settled),
    noShowRate: pct(noShow, settled),
    conversionRate: pct(students.filter(isConverted).length, guests),
    byChannel,
    bySession: perSession.map(({ session, rows }) => {
      const e = rows.filter((r) => r.status === "entered").length;
      const n = rows.filter((r) => r.status === "no_show").length;
      return { sessionId: session.id, title: session.title, rate: pct(e, e + n) };
    }),
  };
}
