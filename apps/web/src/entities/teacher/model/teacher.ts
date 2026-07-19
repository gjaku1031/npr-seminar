/**
 * 강사(Teacher) 도메인 모델 — 명세 §2 (4명 시드).
 * 로그인 사용자(User)와 별개: User.teacherId가 이 모델을 가리킨다.
 */
export interface Teacher {
  id: string;
  name: string;
}
