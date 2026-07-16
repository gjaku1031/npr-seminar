/**
 * 만족도 설문(SurveyResponse) 도메인 모델 — 명세 §2 · 12.7.
 * 별점 1~5 + 객관식 2문항(helpful·again) + 주관식 1(comment).
 */

export type SurveyRating = 1 | 2 | 3 | 4 | 5;

export interface SurveyResponse {
  id: string;
  sessionId: string;
  rating: SurveyRating;
  /** 객관식: 도움이 되었는지 */
  helpful: string;
  /** 객관식: 재참석 의향 */
  again: string;
  comment: string;
}

export interface SurveyDraft {
  sessionId: string;
  rating: SurveyRating;
  helpful: string;
  again: string;
  comment: string;
}

/** 응답 요약 — 평균 별점·분포 (명세 12.7 응답 요약 카드) */
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
    average: responses.length === 0 ? 0 : Number((total / responses.length).toFixed(2)),
    distribution,
  };
}
