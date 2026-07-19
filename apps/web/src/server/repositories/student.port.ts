import "server-only";
import type { Student } from "@/entities/student";

/**
 * 명단 조회 조건 (명세 §4.2~§4.3) — 필터 조합은 구현이 질의로 번역한다.
 * v4.0: 부문(초/중/고) → 캠퍼스 + 단위 탭, 반 필터 → 담임 필터.
 */
export interface StudentQuery {
  /** 이름·학교·연락처(모/부) 부분 일치 (명세 §4.2) */
  search?: string;
  /** 캠퍼스 필터 — '전체'는 미지정과 동일 (명세 §4.1) */
  campus?: string;
  /** 단위 탭 (전체·초등·중1~3·특목·고등·과학) — 매칭 규칙은 unitMatchesTab (명세 §2.1) */
  unitTab?: string;
  /** 담임 필터 (명세 §4.2) */
  teacherName?: string;
}

/**
 * ★ DB 교체 격리지점 (설계 §6) ★ — 재원생 계약.
 * v4.0: 재원생 명단은 읽기 전용 참조 데이터 — 추가·엑셀 업로드·전환 폐기 (명세 §12 실데이터 연동 예정).
 */
export interface StudentRepository {
  list(query?: StudentQuery): Promise<Student[]>;
  findById(id: string): Promise<Student | null>;
  /** 학부모 연락처(부분·뒷자리, **모/부 모두**)로 조회 — 모바일 예약·현장 입장 (명세 §9.3 · §10.3) */
  listByParentPhone(digits: string): Promise<Student[]>;
}
