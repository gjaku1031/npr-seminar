"use client";

/**
 * 학부모 연락처 입력 — 루트 연락처 조회와 개인 링크 교환(BookingAccessView)이 **공유**하는 표현.
 *
 * 문구·전화번호 정규화·검증·접근성·오류 처리를 한 컴포넌트로 통일한다. 라벨/버튼 문구·힌트만
 * 사용처가 정하고, 입력 필드·검증 게이트·오류 낭독(ErrorNote)은 여기서 동일하게 그린다.
 * 기존 화면을 재설계하지 않고 공용 Input·Button·ErrorNote 와 토큰을 그대로 쓴다.
 *
 * ★ 전체 연락처는 이 입력 안에서만 다뤄진다 — 값은 호출부 메모리 state 로만 오가고 저장·로깅·URL
 *   노출을 하지 않는다. 마스킹된 값이 아니라 필요한 원문을 담는 **유일한 입력**이다(계약 허용).
 */

import { Smartphone } from "lucide-react";
import { Button, Input } from "@/shared/ui";
import { formatContactInput } from "@/features/public-booking";
import { ErrorNote } from "./MobileChrome";

export interface ContactEntryFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** 입력·제출 자체가 아직 불가한 경우(예: 링크 fragment 미준비). */
  disabled?: boolean;
  submitting: boolean;
  /** 정규화된 숫자열이 계약 길이를 만족하는가(호출부가 판정해 넘긴다). */
  canSubmit: boolean;
  submitLabel: string;
  submittingLabel: string;
  hint: string;
  error: string | null;
  label?: string;
}

export function ContactEntryForm({
  value,
  onChange,
  onSubmit,
  disabled = false,
  submitting,
  canSubmit,
  submitLabel,
  submittingLabel,
  hint,
  error,
  label = "학부모 연락처",
}: ContactEntryFormProps) {
  return (
    <div>
      <Input
        label={label}
        placeholder="010-0000-0000"
        value={value}
        // 숫자만 입력받아 화면에는 하이픈 표기로 보여 준다. 전송값은 호출부가 다시 정규화하므로 표기 전용이다.
        onChange={(next) => onChange(formatContactInput(next))}
        type="tel"
        disabled={disabled || submitting}
        icon={<Smartphone size={16} aria-hidden="true" />}
        hint={hint}
      />
      <Button
        size="lg"
        fullWidth
        onClick={onSubmit}
        disabled={disabled || submitting || !canSubmit}
        style={{ marginTop: 16 }}
      >
        {submitting ? submittingLabel : submitLabel}
      </Button>
      <ErrorNote message={error} />
    </div>
  );
}
