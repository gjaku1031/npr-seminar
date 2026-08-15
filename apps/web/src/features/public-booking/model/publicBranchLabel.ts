/**
 * 공개 예약 플로우 전용 캠퍼스 라벨 — 학부모 화면 사용자 문구는 항상 풀 라벨(…캠퍼스)로 보인다.
 *
 * 전역 BRANCH_LABELS/BRANCH_OPTIONS 는 관리자 화면이 짧은 라벨(A·B·C)로 쓰므로 건드리지 않는다.
 * 공개 루트에서 캠퍼스 이름을 노출할 때는 이 헬퍼만 사용해 표기를 한곳에서 통일한다.
 */

import { BRANCH_LABELS, type Branch } from "../../../shared/api/contract";

/** 공개 예약 플로우에서 보이는 캠퍼스 풀 라벨. 예: CAMPUS_A → "A캠퍼스". */
export function publicBranchLabel(branch: Branch): string {
  return `${BRANCH_LABELS[branch]}캠퍼스`;
}
