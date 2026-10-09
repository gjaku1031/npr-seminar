import type { BranchCode } from "./offline-snapshot.types.js";

/**
 * 동기화 대상 지점
 */
export interface TongBranchDescriptor {
  /**
   * 내부 지점 코드
   */
  readonly code: BranchCode;

  /**
   * 통통통 지점 코드
   */
  readonly sourceCode: string;
}

/**
 * 통통통 학생 목록 그리드의 수강 등록 1행
 *
 * 값은 원천 문자열 그대로이며 정규화는 StudentNormalizerService가 수행
 */
export interface TongSourceAssignment {
  /**
   * 원천 고유 번호
   */
  readonly sourceUniqueNo: string;

  /**
   * 수강 등록 번호
   */
  readonly classRegistrationNo: string;

  /**
   * 학번
   */
  readonly studentNo: string;

  /**
   * 학생 이름
   */
  readonly name: string;

  /**
   * 반 이름
   */
  readonly className: string;

  /**
   * 어머니 연락처
   */
  readonly motherPhone: string;

  /**
   * 아버지 연락처. undefined면 확인된 연동 계약에 해당 열이 없음
   */
  readonly fatherPhone?: string;

  /**
   * 학교
   */
  readonly schoolName: string;

  /**
   * 학년
   */
  readonly grade: string;

  /**
   * 담임
   */
  readonly teacherName: string;

  /**
   * 단위(학부)
   */
  readonly unitName: string;

  /**
   * 원천 재원 상태. `재원생`만 포함 대상
   */
  readonly sourceStatus: string;
}

/**
 * 지점별 조회 결과
 */
export interface TongBranchSnapshot {
  /**
   * 지점
   */
  readonly branch: BranchCode;

  /**
   * 수강 등록 행 목록
   */
  readonly assignments: readonly TongSourceAssignment[];

  /**
   * 원천 응답 기준 스냅샷 해시
   */
  readonly snapshotHash: Buffer;
}

/**
 * 로그인 세션. 구현체 내부 값이라 호출자는 내용을 보지 않음
 */
export interface TongSession {
  /**
   * 구현체 전용 세션 상태
   */
  readonly opaque: object;
}

/**
 * 통통통 학원 관리 시스템 조회 추상화
 *
 * 설정에 따라 HTTP 구현 또는 비활성 구현 사용
 */
export abstract class TongTongTongGateway {
  /**
   * 설정 확인만 수행. 네트워크 요청을 보내면 안 됨
   */
  public abstract assertReady(): void;

  /**
   * 논리적 로그인 1회 수행. 호출자는 재시도하지 않음
   */
  public abstract login(): Promise<TongSession>;

  /**
   * 지점 전환과 확인 후 상한이 있는 모든 페이지를 한 번씩 조회
   */
  public abstract fetchBranch(session: TongSession, branch: TongBranchDescriptor): Promise<TongBranchSnapshot>;
}
