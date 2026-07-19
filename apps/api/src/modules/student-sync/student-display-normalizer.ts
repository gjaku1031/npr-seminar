import { studentClassBaseName } from "./student-classification.js";

export type CanonicalUnitName = "과학" | "예고1" | "특목" | "예중1" | "초등" | "고등" | "중등1" | "중등2" | "중등3";

const SCIENCE_PREFIXES = ["과초6", "과고1", "과고2", "과고3", "과1", "과2", "과3", "과예중1", "과예고1"] as const;

export function primaryTeacher(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const first = value.normalize("NFKC").split(",", 1)[0]?.trim() ?? "";
  return first === "" ? null : first;
}

/** Canonical display unit. Ordering intentionally mirrors the product/Excel rule. */
export function canonicalUnitName(value: string | null | undefined): CanonicalUnitName | null {
  if (value === null || value === undefined) return null;
  const className = studentClassBaseName(value);
  if (className === "" || className === "비재원생") return null;
  if (className === "과학") return "과학";
  if (SCIENCE_PREFIXES.some((prefix) => className.startsWith(prefix))) return "과학";
  if (className.startsWith("예고1")) return "예고1";
  if (className.startsWith("예1S") || className.startsWith("예1영")) return "특목";
  if (className.startsWith("예1")) return "예중1";
  if (["초6", "초5", "중1", "중2", "중3"].some((prefix) => className.startsWith(prefix))) return "특목";
  if (className.startsWith("초3") || ["4", "5", "6"].includes(className[0] ?? "")) return "초등";
  if (["고1", "고2", "고3"].some((prefix) => className.startsWith(prefix))) return "고등";
  if (className.startsWith("1")) return "중등1";
  if (className.startsWith("2")) return "중등2";
  if (className.startsWith("3")) return "중등3";
  return null;
}
