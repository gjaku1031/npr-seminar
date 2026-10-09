/**
 * HTTP 상태와 오류 코드를 가진 도메인 오류
 *
 * ProblemDetailsFilter가 problem+json 응답으로 변환함
 */
export class DomainError extends Error {
  /**
   * 상태·코드·메시지 설정
   */
  public constructor(
    /**
     * HTTP 상태 코드
     */
    public readonly status: number,

    /**
     * 클라이언트가 분기에 쓰는 안정 오류 코드
     */
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
