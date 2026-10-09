/**
 * 담임(Select) 선택지 — 서버 facet 만으로 만듦
 *
 * 선택지의 유일한 출처는 `AdminStudentPage.facets.teachers` 임: teacherName 을 뺀 나머지
 * 필터에 걸리는 전체 결과의 대표 담임 목록이라, 지금 페이지에 10명만 보여도 전체 담임이
 * 다 담김. 그래서 이 헬퍼는 학생 행(items)을 받지도 보지도 않음 — 페이지네이션과의
 * 경계를 함수 시그니처로 못박음
 *
 * 방어적 보존: URL 이 지목한 현재 선택 담임이 새로 받은 facet 목록에 없을 수 있음(그 담임이
 * 다른 필터로 걸러졌거나 명부에서 빠진 경우). 그대로 두면 controlled Select 가 라벨 없는
 * 값이 되어 사용자가 바꾸거나 지울 수도 없음. 그래서 선택값은 딱 한 번만 끼워 넣고 한글
 * 정렬을 유지함. 서버 배열은 건드리지 않음
 */
export function buildTeacherOptions(facetTeachers: string[], selectedTeacher: string): string[] {
  const values = new Set(facetTeachers);
  if (selectedTeacher !== "") values.add(selectedTeacher);
  return [...values].sort((a, b) => a.localeCompare(b, "ko"));
}
