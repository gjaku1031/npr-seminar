import "server-only";
import type { Seminar } from "@/entities/seminar";

/**
 * ★ DB 교체 격리지점 (설계 §6) ★ — 참고 구조 shared/lib/http.ts 어댑터의 풀스택 후계.
 *
 * 서비스 이상 전 레이어는 이 계약만 안다. 계약은 도메인 모델(@/entities/seminar) 타입으로만
 * 정의한다 — Row·SQL·드라이버 타입이 여기 등장하면 격리가 깨진 것이다.
 *
 * DB가 바뀌면: repositories/<신규구현>/ 을 이 계약대로 작성하고 index.ts 스위치만 바꾼다.
 * 이 파일과 상위(services·features·app)는 불변 (설계 §6.2 시나리오 ③).
 *
 * 계약 확장 원칙: 저수준 CRUD가 아니라 유스케이스 언어로 메서드를 추가한다.
 * (예: 다중 테이블 원자 변경은 "메서드 하나"로 — 트랜잭션 방식 차이가 구현 내부에 숨는다, 설계 §8)
 */
export interface SeminarRepository {
  list(): Promise<Seminar[]>;
  findById(id: string): Promise<Seminar | null>;
  create(data: Omit<Seminar, "id">): Promise<Seminar>;
}
