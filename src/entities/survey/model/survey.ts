/**
 * 만족도 설문(SurveyResponse) 도메인 모델 — 명세 v4.0 §2 · §6.5 · §10.9.
 *
 * v4.0 개편: 별점(필수) + 후기(주관식) + 사진 첨부(목업)로 문항 개편(구 helpful/again 폐기).
 * 결과 테이블 9열(캠퍼스·단위명·학생명·반명·담임명·학부모HP·별점·후기·사진첨부)이
 * 직접 쓰는 스냅샷 필드를 응답에 보관한다 (명세 §6.5).
 */

import type { Campus } from "@/shared/config/campus";

export type SurveyRating = 1 | 2 | 3 | 4 | 5;

export interface SurveyResponse {
  id: string;
  sessionId: string;
  campus: Campus | "";
  unit: string;
  /** 학생명 스냅샷 (명세 §6.5 테이블 3열) */
  student: string;
  className: string;
  teacherName: string;
  phone: string;
  rating: SurveyRating;
  /** 후기 (주관식, 선택) */
  comment: string;
  /** 사진 첨부 여부 — 업로드는 목업 (명세 §12) */
  photo: boolean;
  /** 첨부 파일명 — 다운로드 링크 목업 (명세 §6.5) */
  photoName?: string;
  createdAt: Date;
}

export interface SurveyDraft {
  sessionId: string;
  campus: Campus | "";
  unit: string;
  student: string;
  className: string;
  teacherName: string;
  phone: string;
  rating: SurveyRating;
  comment: string;
  photo: boolean;
  photoName?: string;
}

/** 응답 요약 — 건수·평균 별점 (명세 §6.5 보조 표시) */
export interface SurveySummary {
  count: number;
  average: number;
  /** rating 1~5별 응답 수 */
  distribution: Record<SurveyRating, number>;
}

export const SURVEY_RATINGS: SurveyRating[] = [1, 2, 3, 4, 5];

export function isSurveyRating(value: number): value is SurveyRating {
  return SURVEY_RATINGS.includes(value as SurveyRating);
}

export function summarize(responses: SurveyResponse[]): SurveySummary {
  const distribution: Record<SurveyRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of responses) distribution[r.rating] += 1;
  const total = responses.reduce((sum, r) => sum + r.rating, 0);
  return {
    count: responses.length,
    average: responses.length === 0 ? 0 : Number((total / responses.length).toFixed(1)),
    distribution,
  };
}
