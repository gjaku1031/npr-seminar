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

export type StudentUnitGroup = (typeof STUDENT_UNIT_GROUPS)[number];

export const UNIT_NAMES_BY_GROUP: Readonly<Record<Exclude<StudentUnitGroup, "ALL" | "GUEST">, readonly string[]>> = {
  ELEMENTARY: ["초등"],
  MIDDLE_1: ["중등1"],
  MIDDLE_2: ["중등2"],
  MIDDLE_3: ["중등3"],
  SPECIAL_PURPOSE: ["특목", "예중1", "예고1"],
  HIGH: ["고등"],
  SCIENCE: ["과학"],
};
