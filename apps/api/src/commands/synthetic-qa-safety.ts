export const QA_DATABASE_NAME = "npr_seminar_qa";
export const QA_DATABASE_PORT = "55432";
export const QA_SEED_CONFIRMATION = "SEED NPR SYNTHETIC QA";
export const QA_RESET_CONFIRMATION = "RESET NPR SYNTHETIC QA";

export type QaDataAction = "seed" | "reset";

export interface QaSafetyResult {
  readonly databaseUrl: string;
  readonly databaseName: typeof QA_DATABASE_NAME;
  readonly action: QaDataAction;
}

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

export function requireCanonicalKey(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined) throw new Error(`${name} is required`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) {
    throw new Error(`${name} must be canonical base64 for exactly 32 bytes`);
  }
  return value;
}
