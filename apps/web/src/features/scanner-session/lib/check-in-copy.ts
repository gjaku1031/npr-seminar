/**
 * 스캔·수동 체크인 결과 문구 — 순수 함수 (DOM·React 없음, server 존 안전, node:test 로 검증).
 *
 * 계약 CheckInOutcome 의 서버 필드만 쓴다: `attendanceParty`, `representativeStudentName`,
 * `familySeatCount`. 학생/학부모 종류를 추정하지 않는다. 필수 문맥이 null 이면 `undefined` 를
 * 노출하지 않고 안전한 일반 문구로 폴백한다 — 계약상 CHECKED_IN/ALREADY_CHECKED_IN 은 항상
 * 문맥을 주므로(회귀 테스트로 고정), 폴백은 방어일 뿐이다.
 */

// 관계 경로 import — node:test(tsx) 가 `@/` alias 를 풀지 않으므로 계약 모듈을 직접 가리킨다.
import { ATTENDANCE_PARTY_LABELS, type CheckInOutcome, type CheckInResult } from "../../../shared/api/contract";

export interface CheckInCopy {
  /** 짧은 상태 라벨(색과 함께). */
  title: string;
  /** 낭독·표시되는 본문 — 성공/중복은 대표학생·참석 학부모·인원을 한 문장으로 담는다. */
  detail: string;
}

/**
 * 대표학생·참석 학부모 접두 — `{대표학생명} 학생 학부모({모|부|모/부})`.
 * 대표학생명 또는 참석 학부모가 null 이면 null 을 돌려 호출부가 일반 문구로 폴백하게 한다.
 */
function representativePrefix(outcome: CheckInOutcome): string | null {
  const name = outcome.representativeStudentName;
  const party = outcome.attendanceParty;
  if (name === null || name.trim() === "" || party === null) return null;
  return `${name} 학생 학부모(${ATTENDANCE_PARTY_LABELS[party]})`;
}

/**
 * 계약 CheckInResult 를 화면 문구로 옮긴다. CHECKED_IN/ALREADY_CHECKED_IN 만 서버 문맥으로
 * 문장을 만들고, 나머지는 결과 종류만으로 정해진 고정 문구다.
 */
export function formatCheckInOutcome(outcome: CheckInOutcome): CheckInCopy {
  switch (outcome.result) {
    case "CHECKED_IN": {
      const prefix = representativePrefix(outcome);
      // **예약 인원이 아니라 실제 입장 인원을 읽는다.** 2명 예약에 한 분만 온 경우
      // familySeatCount 를 그대로 쓰면 화면이 오지 않은 사람까지 입장했다고 말한다.
      const entered = outcome.attendedCount ?? outcome.familySeatCount;
      if (prefix !== null && entered !== null) {
        return { title: "입장 완료", detail: `${prefix} ${entered}명 입장 완료` };
      }
      return { title: "입장 완료", detail: "입장 처리됐어요." };
    }
    // 인원 선택 오버레이가 이 결과를 가로채 자기 화면을 띄우므로 보통은 보이지 않는다.
    // 그래도 결과 문구는 있어야 한다 — 오버레이가 뜨지 못한 경우에도 화면이 침묵하면 안 된다.
    case "PARTY_SELECTION_REQUIRED": {
      const prefix = representativePrefix(outcome);
      const detail = "몇 분 입장하는지 선택해야 입장 처리돼요.";
      return { title: "인원 선택 필요", detail: prefix === null ? detail : `${prefix} · ${detail}` };
    }
    case "ALREADY_CHECKED_IN": {
      const prefix = representativePrefix(outcome);
      if (prefix !== null) {
        const entered = outcome.attendedCount;
        return {
          title: "이미 입장한 QR",
          detail: entered === null ? `${prefix} 이미 입장 완료` : `${prefix} 이미 ${entered}명 입장 완료`,
        };
      }
      return { title: "이미 입장한 QR", detail: "이 예약은 이미 입장 처리됐어요." };
    }
    case "SESSION_MISMATCH":
      return { title: "다른 설명회 QR", detail: "지금 진행 중인 회차의 예약이 아니에요." };
    case "CANCELLED":
      return { title: "취소된 예약", detail: "취소된 예약이라 입장할 수 없어요." };
    case "REVOKED_QR":
      return { title: "폐기된 QR", detail: "다시 발급된 QR이 있어요. 최신 QR로 다시 시도해 주세요." };
    case "EXPIRED_QR":
      return { title: "만료된 QR", detail: "유효 기간이 지난 QR이에요." };
    case "INVALID_QR":
      return { title: "유효하지 않은 QR", detail: "우리 설명회 QR이 아니에요." };
    case "RESERVATION_NOT_FOUND":
      return { title: "예약을 찾을 수 없음", detail: "일치하는 예약이 없어요. 현장 접수로 안내해 주세요." };
    case "NOT_AUTHORIZED":
      return { title: "처리할 수 없는 QR", detail: "이 기기에서는 처리할 수 없어요. 관리자에게 문의해 주세요." };
  }
}

/** 결과 종류별 색조 — 색만으로 전달하지 않도록 문구(위)와 아이콘(컴포넌트)이 함께 붙는다. */
export type CheckInTone = "success" | "warning" | "danger";

export function checkInTone(result: CheckInResult): CheckInTone {
  switch (result) {
    case "CHECKED_IN":
      return "success";
    // 아직 입장하지 않았다 — 성공색으로 칠하면 끝난 일로 읽힌다.
    case "PARTY_SELECTION_REQUIRED":
    case "ALREADY_CHECKED_IN":
    case "SESSION_MISMATCH":
      return "warning";
    default:
      return "danger";
  }
}
