import { isActiveSyncRun, type SyncRunStatus } from "@/shared/api";

/**
 * 상태 API에는 최신 실행의 별도 클라이언트 캐시 키가 없다. 시작 시각은 실행마다
 * 서버가 새로 기록하므로, 열린 탭이 "새로 끝난 실행"을 발견했는지 판별하는 데 쓴다.
 */
export interface ObservedSyncRun {
  identity: string;
  status: SyncRunStatus;
}

/**
 * 명부를 다시 읽어야 하는 완료 전이인가.
 *
 * - 같은 실행이 active -> terminal 로 끝난 경우
 * - 탭 밖에서 시작하고 끝난 새 terminal 실행을 뒤늦게 발견한 경우
 *
 * 첫 로드와 같은 terminal 응답의 반복 조회는 명부를 중복 요청하지 않는다.
 */
export function shouldRefreshStudentsAfterSync(
  previous: ObservedSyncRun | null,
  current: ObservedSyncRun | null,
): boolean {
  if (previous === null || current === null || isActiveSyncRun(current.status)) return false;
  return previous.identity !== current.identity || isActiveSyncRun(previous.status);
}
