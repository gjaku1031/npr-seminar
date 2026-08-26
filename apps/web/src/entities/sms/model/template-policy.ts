import type { SmsEditablePurpose, SmsTemplatePolicy, SmsTemplatePurposePolicy } from "@/shared/api";

/** 서버 정책에서 현재 용도의 편집 정보를 찾는다. 목록에 없으면 null을 반환한다. */
export function policyForPurpose(
  policy: SmsTemplatePolicy | null,
  purpose: SmsEditablePurpose,
): SmsTemplatePurposePolicy | null {
  return policy?.purposes.find((entry) => entry.purpose === purpose) ?? null;
}

/** 서버가 지정한 접두어로 새 템플릿 키를 만든다. 해당 용도가 없으면 생성하지 않는다. */
export function newTemplateKey(policy: SmsTemplatePolicy, purpose: SmsEditablePurpose): string | null {
  const entry = policyForPurpose(policy, purpose);
  if (entry === null) return null;
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `${entry.keyPrefix}_${suffix}`;
}
