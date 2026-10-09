/**
 * 학생 목록 단위 그룹 필터 값. ALL 전체, GUEST 비재원생
 */
export const STUDENT_UNIT_GROUPS = [
  "ALL",
  "ELEMENTARY",
  "MIDDLE_1",
  "MIDDLE_2",
  "MIDDLE_3",
  "SPECIAL_PURPOSE",
  "HIGH",
  "SCIENCE",
  "GUEST",
] as const;

/**
 * 단위 그룹
 */
export type StudentUnitGroup = (typeof STUDENT_UNIT_GROUPS)[number];

/**
 * 그룹별 포함 단위 이름. ALL·GUEST는 단위로 거르지 않아 제외
 */
export const UNIT_NAMES_BY_GROUP: Readonly<Record<Exclude<StudentUnitGroup, "ALL" | "GUEST">, readonly string[]>> = {
  ELEMENTARY: ["초등"],
  MIDDLE_1: ["중등1"],
  MIDDLE_2: ["중등2"],
  MIDDLE_3: ["중등3"],
  SPECIAL_PURPOSE: ["특목", "예중1", "예고1"],
  HIGH: ["고등"],
  SCIENCE: ["과학"],
};
