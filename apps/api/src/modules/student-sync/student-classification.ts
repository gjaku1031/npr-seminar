export type StudentAssignmentExclusionReason = "NOT_ACTIVE" | "BRACKETED_CLASS" | null;

const SPECIAL_CLASS_PATTERN = /(특강|패키지|입시대비|TEST)/iu;
const SCIENCE_CLASS_PATTERN = /(물리|화학|생명과학|생물|지구과학)/u;
const TERMINAL_SUFFIX_PATTERN = /^([^\[\]]+)\[([^\[\]]+)\]$/u;
const WEEKDAY_SUFFIX_PATTERN = /^([월화수목금토일]{1,3})([1-9]\d?)?$/u;
const LATIN_SUFFIX_PATTERN = /^[Ee][1-9]\d?$/u;

/**
 * `09-1M4A` 처럼 **두 자리 월 + `-`** 로 시작하는 반은 다음 학기 사전 배정이다.
 *
 * 통통통은 개강 전 반을 이렇게 미리 만들어 두고, 아직 학부(단위)도 담임도 붙이지 않는다.
 * 그래서 이 반이 대표 반으로 뽑히면 학생의 반·단위·담임이 한꺼번에 비어 버린다.
 *
 * 배정 자체는 그대로 저장한다 — 원천에 있는 사실이고 9월이 되면 그때의 현재 반이 된다.
 * 다만 "지금 이 학생의 반"을 고를 때는 후보에서 뺀다.
 */
const FUTURE_TERM_CLASS_PATTERN = /^(0[1-9]|1[0-2])-/u;

export function normalizeStudentClassName(className: string): string {
  return className.normalize("NFKC").trim();
}

/** Removes only a validated timetable suffix; every source field stays untouched. */
export function studentClassBaseName(className: string): string {
  const normalized = normalizeStudentClassName(className);
  if (normalized.includes("*")) return normalized;
  return parseScheduleSuffix(normalized)?.baseClass ?? normalized;
}

function parseScheduleSuffix(normalized: string): { readonly baseClass: string; readonly suffix: string } | null {
  const match = TERMINAL_SUFFIX_PATTERN.exec(normalized);
  if (match === null) return null;
  const baseClass = match[1]!.trim();
  const suffix = match[2]!;
  if (baseClass === "") return null;
  if (LATIN_SUFFIX_PATTERN.test(suffix)) return { baseClass, suffix };
  const weekday = WEEKDAY_SUFFIX_PATTERN.exec(suffix);
  if (weekday === null) return null;
  const days = [...weekday[1]!];
  return new Set(days).size === days.length ? { baseClass, suffix } : null;
}

/**
 * Source rows are accepted when the class name has no brackets, or when its
 * only bracket pair is one well-formed trailing timetable suffix.
 */
export function isAllowedStudentAssignmentClass(className: string): boolean {
  const normalized = normalizeStudentClassName(className);
  if (normalized === "" || normalized.includes("*")) return false;
  const hasBracket = normalized.includes("[") || normalized.includes("]");
  return !hasBracket || parseScheduleSuffix(normalized) !== null;
}

export function classifyStudentAssignment(
  sourceStatus: string,
  className: string,
): { readonly included: boolean; readonly exclusionReason: StudentAssignmentExclusionReason } {
  const active = sourceStatus.normalize("NFKC").trim() === "재원생";
  if (!active) return { included: false, exclusionReason: "NOT_ACTIVE" };
  if (!isAllowedStudentAssignmentClass(className)) {
    return { included: false, exclusionReason: "BRACKETED_CLASS" };
  }
  return { included: true, exclusionReason: null };
}

export function isFutureTermStudentClass(className: string): boolean {
  return FUTURE_TERM_CLASS_PATTERN.test(normalizeStudentClassName(className));
}

export function isScienceStudentClass(className: string): boolean {
  const baseClass = studentClassBaseName(className);
  return baseClass.startsWith("과") || SCIENCE_CLASS_PATTERN.test(baseClass);
}

/**
 * `기하[시간]` is retained as a source assignment, but it is a subject-only
 * timetable assignment rather than a representative regular class.
 */
export function isRepresentativeStudentClass(className: string): boolean {
  if (!isAllowedStudentAssignmentClass(className)) return false;
  const normalized = normalizeStudentClassName(className);
  const baseClass = studentClassBaseName(normalized);
  const hasScheduleSuffix = baseClass !== normalized;
  if (isFutureTermStudentClass(normalized)) return false;
  return !SPECIAL_CLASS_PATTERN.test(baseClass) && !(hasScheduleSuffix && baseClass === "기하");
}
