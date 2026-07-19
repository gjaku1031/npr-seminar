import "server-only";

/**
 * 도메인 에러 — 서비스가 불변식 위반을 알리는 표준 수단.
 * Server Action이 이 에러를 잡아 사용자 메시지로 바꾼다(throw가 아니라 상태로 반환, 설계 §7).
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * ★ 서버 불변식 ① 중복 예약 (설계 §6.4 — 2026-07-16 결정 S9) ★
 * 명세 §11이 "정책 공백"으로 지적한 항목. 와이어프레임은 수동예약 경로에서만 막았지만,
 * 서버는 모바일·전화·수동·현장 **모든 경로**에서 막는다.
 */
export class DuplicateReservationError extends DomainError {
  constructor(message = "이미 이 설명회에 예약된 참석자입니다.") {
    super("DUPLICATE_RESERVATION", message);
  }
}

/**
 * ★ 서버 불변식 ② 정원 초과 (설계 §6.4 — 결정 S9) ★
 * 명세 §11의 두 번째 정책 공백. 모바일만 마감을 표시했으나 서버가 모든 경로를 차단한다.
 */
export class CapacityExceededError extends DomainError {
  constructor(message = "정원이 모두 찼습니다.") {
    super("CAPACITY_EXCEEDED", message);
  }
}

/** 조회 대상 없음 */
export class NotFoundError extends DomainError {
  constructor(message = "대상을 찾을 수 없습니다.") {
    super("NOT_FOUND", message);
  }
}

/** 상태 전이 위반 (예: 미체크가 아닌 예약을 체크인) */
export class InvalidStateError extends DomainError {
  constructor(message = "현재 상태에서는 처리할 수 없습니다.") {
    super("INVALID_STATE", message);
  }
}

/** 권한 없음 — 역할 게이팅 (flows GANGSA-G1) */
export class ForbiddenError extends DomainError {
  constructor(message = "권한이 없습니다.") {
    super("FORBIDDEN", message);
  }
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
