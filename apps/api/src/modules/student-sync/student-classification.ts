export type StudentAssignmentExclusionReason = "NOT_ACTIVE" | "BRACKETED_CLASS" | null;

const SPECIAL_CLASS_PATTERN = /(특강|패키지|입시대비|TEST)/iu;
const SCIENCE_CLASS_PATTERN = /(물리|화학|생명과학|생물|지구과학)/u;
const TERMINAL_SUFFIX_PATTERN = /^([^\[\]]+)\[([^\[\]]+)\]$/u;
const WEEKDAY_SUFFIX_PATTERN = /^([월화수목금토일]{1,3})([1-9]\d?)?$/u;
const LATIN_SUFFIX_PATTERN = /^[Ee][1-9]\d?$/u;

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

export function isSpecialStudentClass(className: string): boolean {
  return SPECIAL_CLASS_PATTERN.test(studentClassBaseName(className));
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
  return !SPECIAL_CLASS_PATTERN.test(baseClass) && !(hasScheduleSuffix && baseClass === "기하");
}
