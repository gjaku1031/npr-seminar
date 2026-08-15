import "server-only";
import { UNIT_TABS, unitMatchesTab } from "@/entities/class";
import { isActiveReservation, type ReservationChannel } from "@/entities/reservation";
import { summarize } from "@/entities/survey";
import {
  reservationRepository,
  sessionRepository,
  studentRepository,
  surveyRepository,
} from "../repositories";

/**
 * 통계 대시보드 (명세 v4.0 §8) — 설명회 × 캠퍼스 필터.
 * 정원·예약률 없이 학생·가족 예약·입장·노쇼의 절대 건수와 만족도만 집계한다.
 */

export interface UnitStat {
  unit: string;
  /** 단위 인원 (재원생 기준) */
  students: number;
  reserved: number;
  entered: number;
}

export interface StatsOverview {
  /** 전체 재원생 수 (캠퍼스 필터 반영) */
  totalStudents: number;
  /** 유효 예약 (reserved+entered) */
  totalReservations: number;
  entered: number;
  /** 노쇼 가족 예약 절대 건수 */
  noShowCount: number;
  /** 채널별 예약 수 (도넛 — 모바일/수동 2종, 명세 §8.3) */
  byChannel: Record<ReservationChannel, number>;
  /** 단위별 학생·활성 예약·입장 절대 건수 — '전체' + 7단위 */
  byUnit: UnitStat[];
  /** 평균 만족도 별점 (명세 §8.5) */
  averageRating: number;
}

export async function getStatsOverview(input?: {
  sessionId?: string;
  campus?: string;
}): Promise<StatsOverview> {
  const sessions = await sessionRepository.list();
  const target = input?.sessionId
    ? sessions.filter((s) => s.id === input.sessionId)
    : sessions;

  const campus = input?.campus && input.campus !== "전체" ? input.campus : null;

  let rows = (
    await Promise.all(target.map((s) => reservationRepository.listBySession(s.id)))
  ).flat();
  if (campus) rows = rows.filter((r) => r.campus === campus);

  let students = await studentRepository.list();
  if (campus) students = students.filter((s) => s.campus === campus);

  const active = rows.filter((r) => isActiveReservation(r.status));
  const entered = rows.filter((r) => r.status === "entered").length;
  const noShow = rows.filter((r) => r.status === "no_show").length;

  const byChannel: Record<ReservationChannel, number> = { mobile: 0, manual: 0 };
  for (const r of rows) if (r.status !== "cancelled") byChannel[r.channel] += 1;

  // 단위별: '전체' + 단위 탭 7종 (명세 §8.4). 비재원생(단위 '')은 전체에만 포함.
  const byUnit: UnitStat[] = UNIT_TABS.map((tab) => {
    const unitStudents =
      tab === "전체" ? students : students.filter((s) => unitMatchesTab(s.unit, tab));
    const unitActive =
      tab === "전체" ? active : active.filter((r) => r.unit !== "" && unitMatchesTab(r.unit, tab));
    const unitEntered = unitActive.filter((r) => r.status === "entered").length;
    return {
      unit: tab,
      students: unitStudents.length,
      reserved: unitActive.length,
      entered: unitEntered,
    };
  });

  const surveys = (
    await Promise.all(target.map((s) => surveyRepository.listBySession(s.id)))
  ).flat();

  return {
    totalStudents: students.length,
    totalReservations: active.length,
    entered,
    noShowCount: noShow,
    byChannel,
    byUnit,
    averageRating: summarize(campus ? surveys.filter((v) => v.campus === campus) : surveys).average,
  };
}
