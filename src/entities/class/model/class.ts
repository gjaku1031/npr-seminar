/**
 * 반(Class) 도메인 모델 — 명세 §2 (초등부A~고등부B, 4명 강사).
 */

/** 부문 (명세 §2 level 초/중/고) */
export type ClassLevel = "elementary" | "middle" | "high";

export interface Class {
  id: string;
  name: string;
  level: ClassLevel;
  teacherId: string;
}

export const classLevelLabel: Record<ClassLevel, string> = {
  elementary: "초등부",
  middle: "중등부",
  high: "고등부",
};

export const classLevels: ClassLevel[] = ["elementary", "middle", "high"];
