/**
 * 합성 QA DB 이름
 */
export const QA_DATABASE_NAME = "npr_seminar_qa";

/**
 * 합성 QA PostgreSQL 포트
 */
export const QA_DATABASE_PORT = "55432";

/**
 * 적재 확인 문구. QA_DATA_CONFIRMATION 값
 */
export const QA_SEED_CONFIRMATION = "SEED NPR SYNTHETIC QA";

/**
 * 초기화 확인 문구. QA_DATA_CONFIRMATION 값
 */
export const QA_RESET_CONFIRMATION = "RESET NPR SYNTHETIC QA";

/**
 * 합성 QA 작업 종류
 */
export type QaDataAction = "seed" | "reset";

/**
 * 안전 조건 확인 결과
 */
export interface QaSafetyResult {
  /**
   * 확인된 DB 연결 URL
   */
  readonly databaseUrl: string;

  /**
   * DB 이름
   */
  readonly databaseName: typeof QA_DATABASE_NAME;

  /**
   * 작업 종류
   */
  readonly action: QaDataAction;
}

/**
 * 합성 QA 데이터 작업 안전 조건 확인
 *
 * 운영 DB를 건드리지 않도록 모든 조건을 만족해야 함
 * - APP_ENV=staging, 작업별 확인 문구 일치
 * - 문자·시트·통통통 연동 모두 false
 * - DATABASE_URL이 루프백 호스트·포트 55432·DB npr_seminar_qa·역할 npr_migrator
 *
 * @throws {Error} 조건 위반
 */
export function assertSyntheticQaSafety(
  environment: NodeJS.ProcessEnv,
  action: QaDataAction,
): QaSafetyResult {
  if (environment.APP_ENV !== "staging") {
    throw new Error("Synthetic QA data is restricted to APP_ENV=staging");
  }
  const confirmation = action === "seed" ? QA_SEED_CONFIRMATION : QA_RESET_CONFIRMATION;
  if (environment.QA_DATA_CONFIRMATION !== confirmation) {
    throw new Error(`QA_DATA_CONFIRMATION must equal ${confirmation}`);
  }
  for (const key of ["SMS_ENABLED", "GOOGLE_SHEETS_ENABLED", "TONG_SYNC_ENABLED"] as const) {
    if (environment[key] !== "false") {
      throw new Error(`${key}=false is required for synthetic QA data operations`);
    }
  }
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol");
  }
  const host = parsed.hostname.toLowerCase();
  if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(host)) {
    throw new Error("Synthetic QA data may connect only to a loopback PostgreSQL host");
  }
  if (parsed.port !== QA_DATABASE_PORT) {
    throw new Error(`Synthetic QA data requires PostgreSQL port ${QA_DATABASE_PORT}`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (databaseName !== QA_DATABASE_NAME) {
    throw new Error(`Synthetic QA data requires database ${QA_DATABASE_NAME}`);
  }
  if (decodeURIComponent(parsed.username) !== "npr_migrator") {
    throw new Error("Synthetic QA data requires the isolated npr_migrator role");
  }
  return { databaseUrl, databaseName: QA_DATABASE_NAME, action };
}

/**
 * 정규 base64로 인코딩한 32바이트 키 환경 변수
 *
 * @throws {Error} 없음·형식 오류
 */
export function requireCanonicalKey(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined) throw new Error(`${name} is required`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) {
    throw new Error(`${name} must be canonical base64 for exactly 32 bytes`);
  }
  return value;
}
