import { describe, expect, it } from "vitest";
import { canonicalUnitName, primaryTeacher } from "../../src/modules/student-sync/student-display-normalizer.js";

// 학생 표시 값 정규화
describe("canonical student display values", () => {
  // 운영 규칙의 단위 접두사 순서와 의도된 긴 과학 접두사 유지
  it("keeps the product unit prefix ordering, including intended long science prefixes", () => {
    for (const prefix of ["과초6", "과고1", "과고2", "과고3", "과1", "과2", "과3", "과예중1", "과예고1"]) {
      expect(canonicalUnitName(`${prefix} 심화`)).toBe("과학");
    }
    expect(canonicalUnitName("예고1A")).toBe("예고1");
    expect(canonicalUnitName("예1S-A")).toBe("특목");
    expect(canonicalUnitName("예1A")).toBe("예중1");
    expect(canonicalUnitName("초6A")).toBe("특목");
    expect(canonicalUnitName("중2S")).toBe("특목");
    expect(canonicalUnitName("초3A")).toBe("초등");
    expect(canonicalUnitName("5A")).toBe("초등");
    expect(canonicalUnitName("고2A")).toBe("고등");
    expect(canonicalUnitName("1A")).toBe("중등1");
    expect(canonicalUnitName("2A")).toBe("중등2");
    expect(canonicalUnitName("3A")).toBe("중등3");
    expect(canonicalUnitName("과학")).toBe("과학");
    expect(canonicalUnitName("과1특A[토3]")).toBe("과학");
    expect(canonicalUnitName("과고1가람[일4]")).toBe("과학");
    expect(canonicalUnitName("고2A[e3]")).toBe("고등");
    expect(canonicalUnitName(" 과학 ［토3］ ")).toBe("과학");
  });

  // 확인된 규칙보다 접두사 범위를 넓히지 않음
  it("does not broaden prefix boundaries beyond the confirmed rules", () => {
    expect(canonicalUnitName("과초5A")).toBeNull();
    expect(canonicalUnitName("과4A")).toBeNull();
    expect(canonicalUnitName("초4A")).toBeNull();
    expect(canonicalUnitName("중4A")).toBeNull();
    expect(canonicalUnitName("10A")).toBe("중등1");
    expect(canonicalUnitName("５A")).toBe("초등");
  });

  // 모호하거나 맞지 않는 반은 추측하지 않고 null
  it("reports ambiguous or unmatched classes as null instead of guessing", () => {
    expect(canonicalUnitName("중등 통합반")).toBeNull();
    expect(canonicalUnitName("미분류")).toBeNull();
    expect(canonicalUnitName("비재원생")).toBeNull();
    expect(canonicalUnitName("  ")).toBeNull();
  });

  // NFKC 정규화 후 쉼표로 나눈 첫 번째 담임만 사용
  it("uses only the first trimmed comma-separated teacher after NFKC normalization", () => {
    expect(primaryTeacher("  김수민,한종보  ")).toBe("김수민");
    expect(primaryTeacher("김수민 ， 한종보")).toBe("김수민");
    expect(primaryTeacher("　김수민　, 한종보")).toBe("김수민");
    expect(primaryTeacher(" ,한종보")).toBeNull();
    expect(primaryTeacher(null)).toBeNull();
  });
});
