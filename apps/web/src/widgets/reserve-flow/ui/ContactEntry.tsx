"use client";

/**
 * 학부모 연락처 입력 — 루트 연락처 조회와 개인 링크 교환(BookingAccessView)이 공유하는 표현
 *
 * 문구·전화번호 정규화·검증·접근성·오류 처리를 한 컴포넌트로 통일함. 라벨/버튼 문구·힌트만
 * 사용처가 정하고, 입력 필드·검증 게이트·오류 낭독(ErrorNote)은 여기서 동일하게 그림
 * 기존 화면을 재설계하지 않고 공용 Input·Button·ErrorNote 와 토큰을 그대로 씀
 *
 * 전체 연락처는 이 입력 안에서만 다뤄짐 — 값은 호출부 메모리 state 로만 오가고 저장·로깅·URL
 *   노출을 하지 않음. 마스킹된 값이 아니라 필요한 원문을 담는 유일한 입력임(계약 허용)
 */

import { Smartphone } from "lucide-react";
import { Button, Input } from "@/shared/ui";
import { formatContactInput } from "@/features/public-booking";
import { ErrorNote } from "./MobileChrome";

/**
 * 연락처 입력 폼 속성
 */
export interface ContactEntryFormProps {
  /**
   * 입력값
   */
  value: string;

  /**
   * 변경 처리
   */
  onChange: (value: string) => void;

  /**
   * 제출 처리
   */
  onSubmit: () => void;
  /**
   * 입력·제출 자체가 아직 불가한 경우(예: 링크 fragment 미준비)
   */
  disabled?: boolean;

  /**
   * 제출 중 여부
   */
  submitting: boolean;
  /**
   * 정규화된 숫자열이 계약 길이를 만족하는가(호출부가 판정해 넘김)
   */
  canSubmit: boolean;

  /**
   * 제출 버튼 문구
   */
  submitLabel: string;

  /**
   * 제출 중 버튼 문구
   */
  submittingLabel: string;

  /**
   * 입력 안내 문구
   */
  hint: string;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

  /**
   * 입력 라벨
   */
  label?: string;
}

/**
 * 보호자 연락처 입력 폼
 */
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
        // 숫자만 입력받아 화면에는 하이픈 표기로 보여 줌. 전송값은 호출부가 다시 정규화하므로 표기 전용임
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
