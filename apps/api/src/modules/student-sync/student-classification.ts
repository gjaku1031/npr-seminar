/**
 * 수강 등록 제외 사유. NOT_ACTIVE 재원생 아님, BRACKETED_CLASS 허용되지 않는 대괄호 반, null 포함
 */
export type StudentAssignmentExclusionReason = "NOT_ACTIVE" | "BRACKETED_CLASS" | null;

/**
 * 특강·패키지·입시대비·테스트 반. 대표 반 후보에서 제외
 */
const SPECIAL_CLASS_PATTERN = /(특강|패키지|입시대비|TEST)/iu;

/**
 * 과학 과목 반 이름
 */
const SCIENCE_CLASS_PATTERN = /(물리|화학|생명과학|생물|지구과학)/u;

/**
 * 끝의 대괄호 접미사 하나 `기본반[접미사]`
 */
const TERMINAL_SUFFIX_PATTERN = /^([^\[\]]+)\[([^\[\]]+)\]$/u;

/**
 * 요일 시간표 접미사. 요일 1~3자(중복 없음)와 선택 회차 번호
 */
const WEEKDAY_SUFFIX_PATTERN = /^([월화수목금토일]{1,3})([1-9]\d?)?$/u;

/**
 * 영문 시간표 접미사 `E1`~`E99`
 */
const LATIN_SUFFIX_PATTERN = /^[Ee][1-9]\d?$/u;

/**
 * 다음 학기 사전 배정 반. `09-1M4A`처럼 두 자리 월과 `-`로 시작
 *
 * 통통통은 개강 전 반을 미리 만들고 단위·담임을 붙이지 않음
 * 이런 반이 대표 반으로 뽑히면 학생의 반·단위·담임이 함께 비게 됨
 * 수강 등록 자체는 원천 사실이라 그대로 저장하고, 현재 반을 고를 때만 후보에서 제외
 */
const FUTURE_TERM_CLASS_PATTERN = /^(0[1-9]|1[0-2])-/u;

/**
 * 반 이름 비교용 정규화. NFKC·앞뒤 공백 제거
 */
export function normalizeStudentClassName(className: string): string {
  return className.normalize("NFKC").trim();
}

/**
 * 검증된 시간표 접미사만 제거한 기본 반 이름
 *
 * `*` 포함 반이나 형식이 맞지 않는 접미사는 그대로 둠. 원천 필드는 변경하지 않음
 */
export function studentClassBaseName(className: string): string {
  const normalized = normalizeStudentClassName(className);
  if (normalized.includes("*")) return normalized;
  return parseScheduleSuffix(normalized)?.baseClass ?? normalized;
}

/**
 * 끝의 시간표 접미사 해석
 *
 * @returns 기본 반과 접미사. 형식이 맞지 않거나 요일이 중복되면 null
 */
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
 * 수강 등록 반 허용 여부
 *
 * 대괄호가 없거나, 대괄호가 끝의 올바른 시간표 접미사 하나뿐이면 허용. 빈 이름·`*` 포함은 거부
 */
export function isAllowedStudentAssignmentClass(className: string): boolean {
  const normalized = normalizeStudentClassName(className);
  if (normalized === "" || normalized.includes("*")) return false;
  const hasBracket = normalized.includes("[") || normalized.includes("]");
  return !hasBracket || parseScheduleSuffix(normalized) !== null;
}

/**
 * 수강 등록 포함 여부와 제외 사유
 *
 * 원천 상태가 `재원생`이고 반 이름이 허용 형식이어야 포함
 */
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

/**
 * 다음 학기 사전 배정 반 여부
 */
export function isFutureTermStudentClass(className: string): boolean {
  return FUTURE_TERM_CLASS_PATTERN.test(normalizeStudentClassName(className));
}

/**
 * 과학 반 여부. 기본 반 이름이 `과`로 시작하거나 과학 과목명 포함
 */
export function isScienceStudentClass(className: string): boolean {
  const baseClass = studentClassBaseName(className);
  return baseClass.startsWith("과") || SCIENCE_CLASS_PATTERN.test(baseClass);
}

/**
 * 대표 정규 반 후보 여부
 *
 * 허용 형식이어야 하고 다음 학기 반·특강류 제외
 * `기하[시간]`은 수강 등록으로는 유지하지만 과목 단독 시간표 등록이라 대표 반이 아님
 */
export function isRepresentativeStudentClass(className: string): boolean {
  if (!isAllowedStudentAssignmentClass(className)) return false;
  const normalized = normalizeStudentClassName(className);
  const baseClass = studentClassBaseName(normalized);
  const hasScheduleSuffix = baseClass !== normalized;
  if (isFutureTermStudentClass(normalized)) return false;
  return !SPECIAL_CLASS_PATTERN.test(baseClass) && !(hasScheduleSuffix && baseClass === "기하");
}
